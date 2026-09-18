package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.TextUtils.normalizeClientNumber;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.client.ClientSuggestionDto;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis")
public class ClientSearchController {

  private static final int MINIMUM_SEARCH_LENGTH = 3;
  private static final int MAXIMUM_SEARCH_LENGTH = 60;
  private static final int CLIENT_NUMBER_LENGTH = 8;

  private final ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final ProvincialAuthorizationService provincialAuthorizationService;

  public ClientSearchController(
      ObjectProvider<ClientLookupService> clientLookupServiceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.clientLookupServiceProvider = clientLookupServiceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @GetMapping("/client-search")
  public ResponseEntity<List<ClientSuggestionDto>> searchClients(
      @RequestParam(name = "q", required = false) String query,
      @RequestParam(name = "counterpartyClientNumber", required = false)
          String counterpartyClientNumber,
      Authentication authentication) {
    String searchTerm = trimToNull(query);
    if (!hasSearchableTerm(searchTerm)) {
      return ResponseEntity.ok(List.of());
    }

    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      return ResponseEntity.noContent().build();
    }

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    boolean federalOnly = usesFederalClientScope(roles);
    String normalizedCounterpartyClientNumber = normalizeClientNumber(counterpartyClientNumber);
    String allowedClientNumber =
        allowedClientNumber(authentication, federalOnly, normalizedCounterpartyClientNumber);

    return ResponseEntity.ok(
        clientLookupService.findClientSuggestions(searchTerm, federalOnly, allowedClientNumber).stream()
            .filter(
                suggestion ->
                    federalOnly
                        || provincialAuthorizationService.canCreateForClient(
                            authentication,
                            suggestion.clientNumber(),
                            normalizedCounterpartyClientNumber))
            .map(
                suggestion ->
                    new ClientSuggestionDto(
                        suggestion.clientNumber(),
                        suggestion.companyName(),
                        suggestion.clientAcronym()))
            .toList());
  }

  private boolean hasSearchableTerm(String searchTerm) {
    if (searchTerm == null
        || searchTerm.length() < MINIMUM_SEARCH_LENGTH
        || searchTerm.length() > MAXIMUM_SEARCH_LENGTH) {
      return false;
    }
    return !searchTerm.chars().allMatch(Character::isDigit)
        || searchTerm.length() <= CLIENT_NUMBER_LENGTH;
  }

  private boolean usesFederalClientScope(List<String> roles) {
    return authorizationService.canPerformAction(roles, "/federalApplicationSearch")
        && !authorizationService.hasProvincialStaffRole(roles)
        && !authorizationService.canPerformAction(roles, "createApplication");
  }

  private String allowedClientNumber(
      Authentication authentication, boolean federalOnly, String counterpartyClientNumber) {
    if (federalOnly) {
      return null;
    }
    String scopedClientNumber =
        normalizeClientNumber(provincialAuthorizationService.scopedForestClientNumber(authentication));
    return scopedClientNumber == null || scopedClientNumber.equals(counterpartyClientNumber)
        ? null
        : scopedClientNumber;
  }
}

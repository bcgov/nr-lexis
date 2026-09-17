package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.client.ClientSuggestionDto;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith(MockitoExtension.class)
class ClientSearchControllerTest {

  @Mock private ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  @Mock private ClientLookupService clientLookupService;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;

  private final Authentication authentication =
      new TestingAuthenticationToken("idir\\jsmith", "n/a");
  private ClientSearchController controller;

  @BeforeEach
  void setUp() {
    controller =
        new ClientSearchController(
            clientLookupServiceProvider,
            sessionService,
            authorizationService,
            provincialAuthorizationService);
  }

  @Test
  void searchClientsShouldSkipBlankShortAndOverlongTerms() {
    for (String query : java.util.Arrays.asList(null, "  ", "ab", "123456789", "x".repeat(61))) {
      ResponseEntity<List<ClientSuggestionDto>> response =
          controller.searchClients(query, null, authentication);

      assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
      assertThat(response.getBody()).isEmpty();
    }
    verifyNoInteractions(clientLookupServiceProvider);
  }

  @Test
  void searchClientsShouldReturnNoContentWhenClientLookupIsUnavailable() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<List<ClientSuggestionDto>> response =
        controller.searchClients("Acme", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(sessionService, authorizationService, provincialAuthorizationService);
  }

  @Test
  void searchClientsShouldPassTheSelectedClientToLookupBeforeTheResultCap() {
    List<String> roles = List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881");
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/federalApplicationSearch")).thenReturn(false);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication)).thenReturn("77881");
    when(clientLookupService.findClientSuggestions("Acme", false, "00077881"))
        .thenReturn(
            List.of(
                new ClientLookupService.ClientSuggestion("00077881", "Acme Forestry", "ACME"),
                new ClientLookupService.ClientSuggestion("00055667", "Other Forestry", "OTHER")));
    when(
            provincialAuthorizationService.canCreateForClient(
                authentication, "00077881", "00055667"))
        .thenReturn(true);
    when(
            provincialAuthorizationService.canCreateForClient(
                authentication, "00055667", "00055667"))
        .thenReturn(false);

    ResponseEntity<List<ClientSuggestionDto>> response =
        controller.searchClients(" Acme ", "55667", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .containsExactly(new ClientSuggestionDto("00077881", "Acme Forestry", "ACME"));
    verify(clientLookupService).findClientSuggestions("Acme", false, "00077881");
  }

  @Test
  void searchClientsShouldLeaveTheLookupUnrestrictedForAnAuthorizedCounterparty() {
    List<String> roles = List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881");
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/federalApplicationSearch")).thenReturn(false);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication)).thenReturn("77881");
    when(clientLookupService.findClientSuggestions("Other", false, null))
        .thenReturn(
            List.of(new ClientLookupService.ClientSuggestion("00055667", "Other Forestry", "OTHER")));
    when(
            provincialAuthorizationService.canCreateForClient(
                authentication, "00055667", "00077881"))
        .thenReturn(true);

    ResponseEntity<List<ClientSuggestionDto>> response =
        controller.searchClients("Other", "77881", authentication);

    assertThat(response.getBody())
        .containsExactly(new ClientSuggestionDto("00055667", "Other Forestry", "OTHER"));
    verify(clientLookupService).findClientSuggestions("Other", false, null);
  }

  @Test
  void searchClientsShouldUseFederalRecordsForPureFederalReadOnlyUsers() {
    List<String> roles = List.of("LEXIS_FEDERAL_READ_ONLY");
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/federalApplicationSearch")).thenReturn(true);
    when(authorizationService.hasProvincialStaffRole(roles)).thenReturn(false);
    when(authorizationService.canPerformAction(roles, "createApplication")).thenReturn(false);
    when(clientLookupService.findClientSuggestions("Acme", true, null))
        .thenReturn(
            List.of(new ClientLookupService.ClientSuggestion("00077881", "Acme Forestry", "ACME")));

    ResponseEntity<List<ClientSuggestionDto>> response =
        controller.searchClients("Acme", null, authentication);

    assertThat(response.getBody())
        .containsExactly(new ClientSuggestionDto("00077881", "Acme Forestry", "ACME"));
    verify(clientLookupService).findClientSuggestions("Acme", true, null);
    verify(provincialAuthorizationService, never())
        .canCreateForClient(authentication, "00077881", null);
  }

  @Test
  void searchClientsShouldPreserveProvincialStaffScopeWhenFederalReadOnlyIsAdditive() {
    List<String> roles = List.of("LEXIS_FEDERAL_READ_ONLY", "LEXIS_READ_ONLY");
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/federalApplicationSearch")).thenReturn(true);
    when(authorizationService.hasProvincialStaffRole(roles)).thenReturn(true);
    when(clientLookupService.findClientSuggestions("Acme", false, null))
        .thenReturn(
            List.of(new ClientLookupService.ClientSuggestion("00077881", "Acme Forestry", "ACME")));
    when(provincialAuthorizationService.canCreateForClient(authentication, "00077881", null))
        .thenReturn(true);

    ResponseEntity<List<ClientSuggestionDto>> response =
        controller.searchClients("Acme", null, authentication);

    assertThat(response.getBody())
        .containsExactly(new ClientSuggestionDto("00077881", "Acme Forestry", "ACME"));
    verify(clientLookupService).findClientSuggestions("Acme", false, null);
  }
}

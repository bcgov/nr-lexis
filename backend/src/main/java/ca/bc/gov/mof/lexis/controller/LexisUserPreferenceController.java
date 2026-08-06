package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.session.LexisUserPreferencesDto;
import ca.bc.gov.mof.lexis.dto.session.UpdateLexisUserPreferencesDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisUserPreferenceService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/lexis/session/preferences")
public class LexisUserPreferenceController {

  private final ObjectProvider<LexisUserPreferenceService> preferenceServiceProvider;
  private final LexisPrincipalService principalService;

  public LexisUserPreferenceController(
      ObjectProvider<LexisUserPreferenceService> preferenceServiceProvider,
      LexisPrincipalService principalService) {
    this.preferenceServiceProvider = preferenceServiceProvider;
    this.principalService = principalService;
  }

  @GetMapping
  public ResponseEntity<LexisUserPreferencesDto> findPreferences(
      Authentication authentication) {
    return ResponseEntity.ok(
        preferenceService().findPreferences(principalService.resolvePrincipalName(authentication)));
  }

  @PutMapping
  public ResponseEntity<LexisUserPreferencesDto> updatePreferences(
      @Valid @RequestBody UpdateLexisUserPreferencesDto request,
      Authentication authentication) {
    return ResponseEntity.ok(
        preferenceService()
            .updatePreferences(
                principalService.resolvePrincipalName(authentication), request.defaultRegion()));
  }

  private LexisUserPreferenceService preferenceService() {
    LexisUserPreferenceService service = preferenceServiceProvider.getIfAvailable();
    if (service == null) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE, "User preferences are temporarily unavailable.");
    }
    return service;
  }
}

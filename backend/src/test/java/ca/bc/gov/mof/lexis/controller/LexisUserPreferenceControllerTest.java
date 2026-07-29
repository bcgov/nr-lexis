package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.session.LexisUserPreferencesDto;
import ca.bc.gov.mof.lexis.dto.session.UpdateLexisUserPreferencesDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisUserPreferenceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class LexisUserPreferenceControllerTest {

  private static final String USER_ID = "IDIR\\JSMITH";

  @Mock private ObjectProvider<LexisUserPreferenceService> preferenceServiceProvider;
  @Mock private LexisUserPreferenceService preferenceService;
  @Mock private LexisPrincipalService principalService;

  @InjectMocks private LexisUserPreferenceController controller;

  @Test
  void findPreferencesShouldScopeTheReadToTheAuthenticatedIdentity() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(USER_ID, "n/a");
    when(preferenceServiceProvider.getIfAvailable()).thenReturn(preferenceService);
    when(principalService.resolvePrincipalName(authentication)).thenReturn(USER_ID);
    when(preferenceService.findPreferences(USER_ID))
        .thenReturn(new LexisUserPreferencesDto("RCO"));

    var response = controller.findPreferences(authentication);

    assertThat(response.getBody()).isEqualTo(new LexisUserPreferencesDto("RCO"));
    verify(preferenceService).findPreferences(USER_ID);
  }

  @Test
  void updatePreferencesShouldNotAcceptAUserIdentifierFromTheRequest() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(USER_ID, "n/a");
    UpdateLexisUserPreferencesDto request = new UpdateLexisUserPreferencesDto("RSI");
    when(preferenceServiceProvider.getIfAvailable()).thenReturn(preferenceService);
    when(principalService.resolvePrincipalName(authentication)).thenReturn(USER_ID);
    when(preferenceService.updatePreferences(USER_ID, "RSI"))
        .thenReturn(new LexisUserPreferencesDto("RSI"));

    var response = controller.updatePreferences(request, authentication);

    assertThat(response.getBody()).isEqualTo(new LexisUserPreferencesDto("RSI"));
    verify(preferenceService).updatePreferences(USER_ID, "RSI");
  }

  @Test
  void preferencesShouldBeUnavailableWithoutTheOracleService() {
    when(preferenceServiceProvider.getIfAvailable()).thenReturn(null);

    assertThatThrownBy(
            () ->
                controller.findPreferences(
                    new TestingAuthenticationToken(USER_ID, "n/a")))
        .isInstanceOf(ResponseStatusException.class)
        .satisfies(
            failure ->
                assertThat(((ResponseStatusException) failure).getStatusCode())
                    .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
  }
}

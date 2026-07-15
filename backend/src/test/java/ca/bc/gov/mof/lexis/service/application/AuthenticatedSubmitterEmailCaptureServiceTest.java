package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService.AuthenticatedEmailIdentity;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.AuthenticatedSubmitterContact;
import ca.bc.gov.mof.lexis.service.application.AuthenticatedSubmitterEmailCaptureService.CaptureResolution;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | AuthenticatedSubmitterEmailCaptureService")
class AuthenticatedSubmitterEmailCaptureServiceTest {

  private static final String UNAVAILABLE_WARNING =
      "The authenticated submitter email was unavailable and was not captured.";

  @Mock private LexisPrincipalService principalService;
  @Mock private Authentication authentication;

  @Test
  void shouldNotResolveIdentityWhenCaptureIsDisabled() {
    AuthenticatedSubmitterEmailCaptureService service = service(false);

    CaptureResolution result = service.resolveForOwner(authentication, null, null);

    assertThat(result.contact()).isEmpty();
    assertThat(result.warning()).isNull();
    verifyNoInteractions(principalService, authentication);
  }

  @Test
  void shouldCaptureBusinessBceidEmailAndFalseVerificationStatus() {
    AuthenticatedSubmitterEmailCaptureService service = service(true);
    when(principalService.resolveAuthenticatedIdentity(authentication))
        .thenReturn(
            Optional.of(
                new AuthenticatedEmailIdentity(
                    "submitter@example.com",
                    false,
                    "BCEIDBUSINESS",
                    "business-user-id")));

    CaptureResolution result = service.resolveForOwner(authentication, "1012", "ab");

    assertThat(result.warning()).isNull();
    assertThat(result.contact())
        .contains(
            new AuthenticatedSubmitterContact(
                "submitter@example.com",
                false,
                "BCEIDBUSINESS",
                "business-user-id",
                "00001012",
                "AB"));
  }

  @Test
  void shouldPreserveUnknownVerificationStatus() {
    AuthenticatedSubmitterEmailCaptureService service = service(true);
    when(principalService.resolveAuthenticatedIdentity(authentication))
        .thenReturn(
            Optional.of(
                new AuthenticatedEmailIdentity(
                    "submitter@example.com", null, "BCEIDBUSINESS", "business-user-id")));

    CaptureResolution result = service.resolveForOwner(authentication, "00001012", "00");

    assertThat(result.contact()).isPresent();
    assertThat(result.contact().orElseThrow().emailVerified()).isNull();
    assertThat(result.warning()).isNull();
  }

  @Test
  void shouldIgnoreNonBusinessBceidIdentity() {
    AuthenticatedSubmitterEmailCaptureService service = service(true);
    when(principalService.resolveAuthenticatedIdentity(authentication))
        .thenReturn(
            Optional.of(
                new AuthenticatedEmailIdentity(
                    "idir.user@gov.bc.ca", true, "IDIR", "idir-user-id")));

    CaptureResolution result = service.resolveForOwner(authentication, "00001012", "00");

    assertThat(result.contact()).isEmpty();
    assertThat(result.warning()).isNull();
  }

  @Test
  void shouldWarnWithoutContactWhenAuthenticatedEmailIsUnavailable() {
    AuthenticatedSubmitterEmailCaptureService service = service(true);
    when(principalService.resolveAuthenticatedIdentity(authentication))
        .thenReturn(
            Optional.of(
                new AuthenticatedEmailIdentity(null, null, "BCEIDBUSINESS", "business-user-id")));

    CaptureResolution result = service.resolveForOwner(authentication, "00001012", "00");

    assertThat(result.contact()).isEmpty();
    assertThat(result.warning()).isEqualTo(UNAVAILABLE_WARNING);
  }

  @Test
  void shouldWarnWithoutContactWhenIdentityEmailIsNotOracleSafe() {
    AuthenticatedSubmitterEmailCaptureService service = service(true);
    when(principalService.resolveAuthenticatedIdentity(authentication))
        .thenReturn(
            Optional.of(
                new AuthenticatedEmailIdentity(
                    "résumé@example.com", true, "BCEIDBUSINESS", "business-user-id")));

    CaptureResolution result = service.resolveForOwner(authentication, "00001012", "00");

    assertThat(result.contact()).isEmpty();
    assertThat(result.warning()).isEqualTo(UNAVAILABLE_WARNING);
  }

  private AuthenticatedSubmitterEmailCaptureService service(boolean enabled) {
    return new AuthenticatedSubmitterEmailCaptureService(principalService, enabled);
  }
}

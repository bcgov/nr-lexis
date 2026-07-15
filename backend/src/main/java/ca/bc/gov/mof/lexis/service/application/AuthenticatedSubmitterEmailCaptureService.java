package ca.bc.gov.mof.lexis.service.application;

import static ca.bc.gov.mof.lexis.util.TextUtils.normalizeClientNumber;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService.AuthenticatedEmailIdentity;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.AuthenticatedSubmitterContact;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class AuthenticatedSubmitterEmailCaptureService {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(AuthenticatedSubmitterEmailCaptureService.class);

  private final LexisPrincipalService principalService;
  private final boolean enabled;

  public AuthenticatedSubmitterEmailCaptureService(
      LexisPrincipalService principalService,
      @Value("${lexis.mail.applicant-email-capture-enabled:false}") boolean enabled) {
    this.principalService = principalService;
    this.enabled = enabled;
  }

  public CaptureResolution resolveForOwner(
      Authentication authentication, String ownerClientNumber, String ownerClientLocationCode) {
    if (!enabled) {
      return CaptureResolution.empty();
    }

    String clientNumber = normalizeClientNumber(ownerClientNumber);
    String locationCode = normalizedLocationCode(ownerClientLocationCode);
    if (clientNumber == null || locationCode == null) {
      throw new IllegalArgumentException(
          "A scoped owner client and location are required for submitter email capture.");
    }

    AuthenticatedEmailIdentity identity =
        principalService.resolveAuthenticatedIdentity(authentication).orElse(null);
    if (identity == null || !identity.businessBceid()) {
      return CaptureResolution.empty();
    }
    if (identity.emailAddress() == null) {
      LOGGER.warn(
          "event=lexis_submitter_email_capture outcome=unavailable reason=missing_identity_email");
      return CaptureResolution.unavailable();
    }

    if (!isOracleSafe(identity.emailAddress(), 254)
        || !isOracleSafe(identity.identityProviderCode(), 30)
        || !isOracleSafe(identity.identityUserId(), 255)
        || !isOracleSafe(clientNumber, 8)
        || !isOracleSafe(locationCode, 2)) {
      LOGGER.warn(
          "event=lexis_submitter_email_capture outcome=unavailable reason=oracle_unsafe_identity");
      return CaptureResolution.unavailable();
    }

    return new CaptureResolution(
        Optional.of(
            new AuthenticatedSubmitterContact(
                identity.emailAddress(),
                identity.emailVerified(),
                identity.identityProviderCode(),
                identity.identityUserId(),
                clientNumber,
                locationCode)),
        null);
  }

  public boolean enabled() {
    return enabled;
  }

  private boolean isOracleSafe(String value, int maxBytes) {
    return value != null
        && !value.isEmpty()
        && value.length() <= maxBytes
        && value.chars().allMatch(character -> character >= 0x20 && character <= 0x7e);
  }

  private String normalizedLocationCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  public record CaptureResolution(
      Optional<AuthenticatedSubmitterContact> contact, String warning) {

    private static final String UNAVAILABLE_WARNING =
        "The authenticated submitter email was unavailable and was not captured.";

    public CaptureResolution {
      contact = contact == null ? Optional.empty() : contact;
    }

    public static CaptureResolution empty() {
      return new CaptureResolution(Optional.empty(), null);
    }

    public static CaptureResolution unavailable() {
      return new CaptureResolution(Optional.empty(), UNAVAILABLE_WARNING);
    }
  }
}

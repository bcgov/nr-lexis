package ca.bc.gov.mof.lexis.service.application;

import static ca.bc.gov.mof.lexis.util.TextUtils.normalizeClientNumber;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.application.ApplicationNotificationContactRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationNotificationContactRepository.NotificationContactRow;
import ca.bc.gov.mof.lexis.service.client.AuthoritativeClientEmailResolver;
import ca.bc.gov.mof.lexis.service.mail.MailRecipientValidator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class ApplicationNotificationRecipientResolver {

  private static final String APPLICANT_TYPE_OWNER = "O";
  private static final String APPLICANT_TYPE_AGENT = "A";
  private static final String AUTHENTICATED_EMAIL_SOURCE = "AUTHENTICATED_USER";
  private static final String BUSINESS_BCEID_PROVIDER = "BCEIDBUSINESS";

  private final ApplicationNotificationContactRepository notificationContactRepository;
  private final AuthoritativeClientEmailResolver clientEmailResolver;
  private final boolean captureEnabled;

  public ApplicationNotificationRecipientResolver(
      ApplicationNotificationContactRepository notificationContactRepository,
      AuthoritativeClientEmailResolver clientEmailResolver,
      @Value("${lexis.mail.applicant-email-capture-enabled:false}") boolean captureEnabled) {
    this.notificationContactRepository = notificationContactRepository;
    this.clientEmailResolver = clientEmailResolver;
    this.captureEnabled = captureEnabled;
  }

  public Optional<String> resolve(
      Long applicationNumber,
      String applicantTypeCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode) {
    String applicantType = trimToNull(applicantTypeCode);
    if (APPLICANT_TYPE_OWNER.equalsIgnoreCase(applicantType)) {
      return resolveCapturedOwner(
              applicationNumber, ownerClientNumber, ownerClientLocationCode)
          .or(
              () ->
                  clientEmailResolver.resolve(
                      ownerClientNumber, ownerClientLocationCode));
    }
    if (APPLICANT_TYPE_AGENT.equalsIgnoreCase(applicantType)) {
      return clientEmailResolver.resolve(agentClientNumber, agentClientLocationCode);
    }
    return Optional.empty();
  }

  public Optional<String> resolveForLinkedOwnerApplications(
      List<Long> applicationNumbers, String clientNumber, String clientLocationCode) {
    Optional<Long> primaryApplication =
        applicationNumbers == null
            ? Optional.empty()
            : applicationNumbers.stream()
                .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
                .distinct()
                .sorted()
                .findFirst();
    return primaryApplication
        .flatMap(
            applicationNumber ->
                resolveCapturedOwner(applicationNumber, clientNumber, clientLocationCode))
        .or(() -> clientEmailResolver.resolve(clientNumber, clientLocationCode));
  }

  public Optional<String> resolveCapturedOwner(
      Long applicationNumber, String clientNumber, String clientLocationCode) {
    String normalizedClientNumber = normalizeClientNumber(clientNumber);
    String normalizedLocationCode = normalizeLocationCode(clientLocationCode);
    if (!captureEnabled
        || applicationNumber == null
        || applicationNumber < 1
        || normalizedClientNumber == null
        || normalizedLocationCode == null) {
      return Optional.empty();
    }

    Optional<NotificationContactRow> stored =
        notificationContactRepository.findForCurrentOwner(
            applicationNumber, normalizedClientNumber, normalizedLocationCode);
    if (stored.isEmpty()) {
      return Optional.empty();
    }

    NotificationContactRow row = stored.get();
    if (!matchesCurrentOwner(
        row, applicationNumber, normalizedClientNumber, normalizedLocationCode)) {
      throw new DataRetrievalFailureException(
          "The stored application notification contact is inconsistent.");
    }
    Optional<String> email = MailRecipientValidator.normalize(row.emailAddress());
    if (email.isEmpty()) {
      throw new DataRetrievalFailureException(
          "The stored application notification email is invalid.");
    }
    return email;
  }

  private boolean matchesCurrentOwner(
      NotificationContactRow row,
      Long applicationNumber,
      String clientNumber,
      String clientLocationCode) {
    return row != null
        && Objects.equals(applicationNumber, row.applicationNumber())
        && Objects.equals(clientNumber, normalizeClientNumber(row.clientNumber()))
        && Objects.equals(clientLocationCode, normalizeLocationCode(row.clientLocationCode()))
        && AUTHENTICATED_EMAIL_SOURCE.equals(trimToNull(row.emailSourceCode()))
        && BUSINESS_BCEID_PROVIDER.equals(trimToNull(row.identityProviderCode()))
        && trimToNull(row.identityUserId()) != null;
  }

  private String normalizeLocationCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }
}

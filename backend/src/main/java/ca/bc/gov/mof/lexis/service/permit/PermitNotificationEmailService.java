package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class PermitNotificationEmailService {

  private final EmailNotificationService notificationService;
  private final List<String> requestRecipients;

  public PermitNotificationEmailService(
      EmailNotificationService notificationService,
      @Value("${lexis.mail.permit-request-recipients:}") String requestRecipients) {
    this.notificationService = notificationService;
    this.requestRecipients = parseRecipients(requestRecipients);
  }

  public boolean sendRequest(Long permitNumber, String copyToAddress) {
    if (permitNumber == null || permitNumber < 1 || requestRecipients.isEmpty()) {
      return false;
    }
    // The caller-supplied copy address is untrusted. Review mail is restricted to the configured
    // reviewer recipients until role-based recipient discovery or a distribution list is adopted.
    notificationService.publish(
        new WorkflowEmailEvent.PermitReview(
            permitNumber,
            requestRecipients,
            List.of()));
    return true;
  }

  public boolean sendApproval(
      Long permitNumber, String permitStatusCode, List<String> packageNumbers, String recipient) {
    if (permitNumber == null || permitNumber < 1 || trimToNull(recipient) == null) {
      return false;
    }
    String packages = packageNumbers == null ? "" : String.join(", ", packageNumbers);
    boolean paymentPending = "PPD".equalsIgnoreCase(trimToNull(permitStatusCode));
    notificationService.publish(
        new WorkflowEmailEvent.PermitApproval(
            permitNumber,
            paymentPending,
            packages,
            recipient.trim()));
    return true;
  }

  private List<String> parseRecipients(String value) {
    if (trimToNull(value) == null) {
      return List.of();
    }
    return Arrays.stream(value.split("[,;]"))
        .map(String::trim)
        .filter(item -> !item.isEmpty())
        .distinct()
        .toList();
  }
}

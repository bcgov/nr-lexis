package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class PermitNotificationEmailService {

  private final EmailNotificationService notificationService;
  private final RegionalMailRecipientResolver regionalRecipientResolver;

  public PermitNotificationEmailService(
      EmailNotificationService notificationService,
      RegionalMailRecipientResolver regionalRecipientResolver) {
    this.notificationService = notificationService;
    this.regionalRecipientResolver = regionalRecipientResolver;
  }

  public boolean sendRequest(Long permitNumber, Long orgUnitNumber) {
    List<String> requestRecipients = regionalRecipientResolver.resolve(orgUnitNumber);
    if (permitNumber == null || permitNumber < 1 || requestRecipients.isEmpty()) {
      return false;
    }
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
}

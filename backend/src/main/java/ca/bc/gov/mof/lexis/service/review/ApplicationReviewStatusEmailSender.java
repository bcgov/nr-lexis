package ca.bc.gov.mof.lexis.service.review;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRoute;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ApplicationReviewStatusEmailSender {

  private final EmailNotificationService notificationService;

  public ApplicationReviewStatusEmailSender(EmailNotificationService notificationService) {
    this.notificationService = notificationService;
  }

  public boolean sendStatusEmail(
      long applicationNumber,
      String statusCode,
      String recipientAddress,
      String remark,
      Long orgUnitNumber) {
    return sendStatusEmail(
        applicationNumber, statusCode, List.of(recipientAddress), remark, orgUnitNumber);
  }

  /** Sends one message to every address, so a shared owner and agent address gets one email. */
  public boolean sendStatusEmail(
      long applicationNumber,
      String statusCode,
      List<String> recipientAddresses,
      String remark,
      Long orgUnitNumber) {
    RegionalMailRoute senderRoute = RegionalMailRoute.forOrgUnit(orgUnitNumber).orElse(null);
    if (senderRoute == null || recipientAddresses.isEmpty()) {
      return false;
    }
    String statusDescription = statusDescription(statusCode);
    notificationService.publish(
        new WorkflowEmailEvent.ApplicationStatus(
            applicationNumber,
            statusDescription,
            trimToNull(remark) == null ? "" : remark.trim(),
            recipientAddresses,
            senderRoute));
    return true;
  }

  private static String statusDescription(String statusCode) {
    String normalized = trimToNull(statusCode);
    if ("REJ".equalsIgnoreCase(normalized)) {
      return "REJECTED";
    }
    if ("WDN".equalsIgnoreCase(normalized)) {
      return "WITHDRAWN";
    }
    return normalized == null ? "UNKNOWN" : normalized.toUpperCase();
  }
}

package ca.bc.gov.mof.lexis.service.review;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import org.springframework.stereotype.Service;

@Service
public class ApplicationReviewStatusEmailSender {

  private final EmailNotificationService notificationService;

  public ApplicationReviewStatusEmailSender(EmailNotificationService notificationService) {
    this.notificationService = notificationService;
  }

  public void sendStatusEmail(
      long applicationNumber,
      String statusCode,
      String recipientAddress,
      String remark) {
    String statusDescription = statusDescription(statusCode);
    notificationService.publish(
        new WorkflowEmailEvent.ApplicationStatus(
            applicationNumber,
            statusDescription,
            trimToNull(remark) == null ? "" : remark.trim(),
            recipientAddress));
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

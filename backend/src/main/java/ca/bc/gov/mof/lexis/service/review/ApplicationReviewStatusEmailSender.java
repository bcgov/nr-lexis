package ca.bc.gov.mof.lexis.service.review;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class ApplicationReviewStatusEmailSender {

  private static final String DEFAULT_FROM_ADDRESS = "Provincial.Log.Export.Analyst@gov.bc.ca";

  private final JavaMailSender mailSender;
  private final String fromAddress;

  public ApplicationReviewStatusEmailSender(
      JavaMailSender mailSender,
      @Value("${lexis.mail.from:" + DEFAULT_FROM_ADDRESS + "}") String fromAddress) {
    this.mailSender = mailSender;
    this.fromAddress = trimToNull(fromAddress) == null ? DEFAULT_FROM_ADDRESS : fromAddress.trim();
  }

  public void sendStatusEmail(
      long applicationNumber,
      String statusCode,
      String recipientAddress,
      String remark) {
    String statusDescription = statusDescription(statusCode);
    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(fromAddress);
    message.setTo(recipientAddress);
    message.setSubject("Application #" + applicationNumber + " status to " + statusDescription);
    message.setText(
        "Application #"
            + applicationNumber
            + " status was changed to "
            + statusDescription
            + " with the following reason:\n\n"
            + (trimToNull(remark) == null ? "" : remark.trim()));
    mailSender.send(message);
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

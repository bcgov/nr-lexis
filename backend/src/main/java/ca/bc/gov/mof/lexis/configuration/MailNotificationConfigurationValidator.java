package ca.bc.gov.mof.lexis.configuration;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Fails startup when enabled mail would silently discard a workflow notification. */
@Component
public class MailNotificationConfigurationValidator {

  private static final Pattern RECIPIENT_SEPARATOR = Pattern.compile("[,;]");

  public MailNotificationConfigurationValidator(
      @Value("${lexis.mail.enabled:false}") boolean enabled,
      @Value("${lexis.mail.non-production:true}") boolean nonProduction,
      @Value("${lexis.mail.from:Provincial.Log.Export.Analyst@gov.bc.ca}") String fromAddress,
      @Value("${lexis.mail.override-recipients:}") String overrideRecipients,
      @Value("${lexis.mail.permit-request-recipients:}") String permitRequestRecipients) {
    if (!enabled) {
      return;
    }

    requireSingleAddress(fromAddress, "Enabled mail requires one valid from address.");
    if (nonProduction) {
      requireAddressList(
          overrideRecipients,
          "Enabled non-production mail requires valid override recipients.");
    }
    requireAddressList(
        permitRequestRecipients,
        "Enabled mail requires valid permit-review recipients.");
  }

  private void requireAddressList(String csv, String failureMessage) {
    String normalizedCsv = trimToNull(csv);
    if (normalizedCsv == null) {
      throw new IllegalStateException(failureMessage);
    }

    String[] recipients = RECIPIENT_SEPARATOR.split(normalizedCsv, -1);
    if (recipients.length == 0) {
      throw new IllegalStateException(failureMessage);
    }
    for (String recipient : recipients) {
      requireSingleAddress(recipient, failureMessage);
    }
  }

  private void requireSingleAddress(String value, String failureMessage) {
    String normalized = trimToNull(value);
    if (normalized == null || normalized.length() > 254) {
      throw new IllegalStateException(failureMessage);
    }
    try {
      InternetAddress address = new InternetAddress(normalized, true);
      address.validate();
    } catch (AddressException ignored) {
      throw new IllegalStateException(failureMessage);
    }
  }
}

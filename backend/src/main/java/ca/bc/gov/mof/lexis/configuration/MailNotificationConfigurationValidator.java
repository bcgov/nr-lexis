package ca.bc.gov.mof.lexis.configuration;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Fails startup when mail configuration could discard or misroute a notification. */
@Component
public class MailNotificationConfigurationValidator {

  private static final Pattern RECIPIENT_SEPARATOR = Pattern.compile("[,;]");

  public MailNotificationConfigurationValidator(
      @Value("${lexis.mail.enabled:false}") boolean enabled,
      @Value("${lexis.mail.non-production:true}") boolean nonProduction,
      @Value("${lexis.mail.from:}") String fromAddress,
      @Value("${lexis.mail.override-recipients:}") String overrideRecipients,
      @Value("${lexis.mail.permit-request-recipients:}") String permitRequestRecipients,
      @Value("${lexis.mail.region-rco-recipients:}") String rcoRecipients,
      @Value("${lexis.mail.region-rni-recipients:}") String rniRecipients,
      @Value("${lexis.mail.region-rsi-recipients:}") String rsiRecipients) {
    if (!nonProduction && trimToNull(overrideRecipients) != null) {
      throw new IllegalStateException(
          "Production mail must not configure override recipients.");
    }
    if (!enabled) {
      return;
    }

    requireSingleAddress(fromAddress, "Enabled mail requires one valid from address.");
    if (nonProduction) {
      requireAddressList(
          overrideRecipients,
          "Enabled non-production mail requires valid override recipients.");
    }
    boolean hasFallback =
        validateOptionalAddressList(
            permitRequestRecipients,
            "Enabled mail requires valid fallback permit-review recipients.");
    boolean hasRco =
        validateOptionalAddressList(
            rcoRecipients, "Enabled mail requires valid RCO recipients.");
    boolean hasRni =
        validateOptionalAddressList(
            rniRecipients, "Enabled mail requires valid RNI recipients.");
    boolean hasRsi =
        validateOptionalAddressList(
            rsiRecipients, "Enabled mail requires valid RSI recipients.");

    if (!hasFallback && !(hasRco && hasRni && hasRsi)) {
      throw new IllegalStateException(
          "Enabled mail requires all regional recipient lists or fallback permit-review recipients.");
    }
  }

  private boolean validateOptionalAddressList(String csv, String failureMessage) {
    if (trimToNull(csv) == null) {
      return false;
    }
    requireAddressList(csv, failureMessage);
    return true;
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

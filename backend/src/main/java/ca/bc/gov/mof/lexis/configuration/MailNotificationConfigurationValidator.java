package ca.bc.gov.mof.lexis.configuration;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Fails startup when mail configuration could discard or misroute a notification. */
@Component
@Profile("oracle")
public class MailNotificationConfigurationValidator {

  private static final Pattern RECIPIENT_SEPARATOR = Pattern.compile("[,;]");

  public MailNotificationConfigurationValidator(
      @Value("${lexis.mail.non-production:true}") boolean nonProduction,
      @Value("${lexis.mail.from:}") String fromAddress,
      @Value("${lexis.mail.override-recipients:}") String overrideRecipients,
      @Value("${lexis.mail.region-rco-address:}") String rcoAddress,
      @Value("${lexis.mail.region-rni-address:}") String rniAddress,
      @Value("${lexis.mail.region-rsi-address:}") String rsiAddress) {
    if (!nonProduction && trimToNull(overrideRecipients) != null) {
      throw new IllegalStateException(
          "Production mail must not configure override recipients.");
    }

    requireSingleAddress(fromAddress, "Mail requires one valid from address.");
    requireSingleAddress(rcoAddress, "Mail requires one valid RCO positional mailbox address.");
    requireSingleAddress(rniAddress, "Mail requires one valid RNI positional mailbox address.");
    requireSingleAddress(rsiAddress, "Mail requires one valid RSI positional mailbox address.");
    if (nonProduction) {
      validateOptionalAddressList(
          overrideRecipients,
          "Non-production mail override recipients must be valid when configured.");
    }
  }

  private void validateOptionalAddressList(String csv, String failureMessage) {
    if (trimToNull(csv) == null) {
      return;
    }
    requireAddressList(csv, failureMessage);
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

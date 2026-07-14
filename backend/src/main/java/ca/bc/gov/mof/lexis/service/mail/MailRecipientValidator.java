package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.Optional;

public final class MailRecipientValidator {

  private MailRecipientValidator() {}

  public static Optional<String> normalize(String value) {
    String normalized = trimToNull(value);
    if (normalized == null || normalized.length() > 254) {
      return Optional.empty();
    }
    try {
      InternetAddress address = new InternetAddress(normalized, true);
      address.validate();
      return Optional.of(address.getAddress());
    } catch (AddressException ignored) {
      return Optional.empty();
    }
  }
}

package ca.bc.gov.mof.lexis.service.client;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class AuthoritativeClientEmailResolver {

  private static final int MAX_EMAIL_ADDRESS_LENGTH = 254;
  private static final String NOT_ON_FILE = "Not on file";

  private final ClientLookupService clientLookupService;

  public AuthoritativeClientEmailResolver(ClientLookupService clientLookupService) {
    this.clientLookupService = clientLookupService;
  }

  /**
   * Resolves a recipient from the authoritative Oracle client record. Missing client references or
   * unusable email values are represented as empty; backing lookup failures intentionally propagate.
   */
  public Optional<String> resolve(String clientNumber, String locationCode) {
    String normalizedClientNumber = trimToNull(clientNumber);
    String normalizedLocationCode = trimToNull(locationCode);
    if (normalizedClientNumber == null || normalizedLocationCode == null) {
      return Optional.empty();
    }

    return clientLookupService
        .getClientDataRequired(normalizedClientNumber, normalizedLocationCode)
        .map(ClientLookupService.ClientData::email)
        .flatMap(AuthoritativeClientEmailResolver::validatedAddress);
  }

  private static Optional<String> validatedAddress(String rawValue) {
    String value = trimToNull(rawValue);
    if (value == null
        || value.length() > MAX_EMAIL_ADDRESS_LENGTH
        || NOT_ON_FILE.equalsIgnoreCase(value)
        || containsWhitespaceOrControl(value)) {
      return Optional.empty();
    }

    try {
      InternetAddress[] parsed = InternetAddress.parse(value, true);
      if (parsed.length != 1) {
        return Optional.empty();
      }
      InternetAddress address = parsed[0];
      address.validate();
      if (address.getPersonal() != null || !value.equals(address.getAddress())) {
        return Optional.empty();
      }
      return Optional.of(value);
    } catch (AddressException ex) {
      return Optional.empty();
    }
  }

  private static boolean containsWhitespaceOrControl(String value) {
    for (int index = 0; index < value.length(); index += 1) {
      char character = value.charAt(index);
      if (Character.isWhitespace(character) || Character.isISOControl(character)) {
        return true;
      }
    }
    return false;
  }
}

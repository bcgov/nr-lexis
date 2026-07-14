package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class RegionalMailRecipientResolver {

  private static final Set<Long> RCO_ORG_UNITS = Set.of(1835L, 1909L, 1910L);
  private static final Set<Long> RNI_ORG_UNITS = Set.of(1833L, 1905L, 1906L, 1908L);
  private static final Set<Long> RSI_ORG_UNITS = Set.of(1834L, 1903L, 1904L, 1907L);

  private final List<String> rcoRecipients;
  private final List<String> rniRecipients;
  private final List<String> rsiRecipients;
  private final List<String> fallbackRecipients;

  public RegionalMailRecipientResolver(
      @Value("${lexis.mail.region-rco-recipients:}") String rcoRecipients,
      @Value("${lexis.mail.region-rni-recipients:}") String rniRecipients,
      @Value("${lexis.mail.region-rsi-recipients:}") String rsiRecipients,
      @Value("${lexis.mail.permit-request-recipients:}") String fallbackRecipients) {
    this.rcoRecipients = parseRecipients(rcoRecipients);
    this.rniRecipients = parseRecipients(rniRecipients);
    this.rsiRecipients = parseRecipients(rsiRecipients);
    this.fallbackRecipients = parseRecipients(fallbackRecipients);
  }

  public List<String> resolve(Long orgUnitNumber) {
    List<String> regionalRecipients = recipientsFor(orgUnitNumber);
    return regionalRecipients.isEmpty() ? fallbackRecipients : regionalRecipients;
  }

  private List<String> recipientsFor(Long orgUnitNumber) {
    if (orgUnitNumber == null) {
      return List.of();
    }
    if (RCO_ORG_UNITS.contains(orgUnitNumber)) {
      return rcoRecipients;
    }
    if (RNI_ORG_UNITS.contains(orgUnitNumber)) {
      return rniRecipients;
    }
    if (RSI_ORG_UNITS.contains(orgUnitNumber)) {
      return rsiRecipients;
    }
    return List.of();
  }

  private static List<String> parseRecipients(String value) {
    if (trimToNull(value) == null) {
      return List.of();
    }
    return Arrays.stream(value.split("[,;]"))
        .map(RegionalMailRecipientResolver::normalizedRecipient)
        .filter(recipient -> recipient != null)
        .distinct()
        .toList();
  }

  private static String normalizedRecipient(String value) {
    return trimToNull(value);
  }
}

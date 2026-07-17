package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class RegionalMailRecipientResolver {

  private static final String REGION_RCO = "REGION_RCO";
  private static final String REGION_RNI = "REGION_RNI";
  private static final String REGION_RSI = "REGION_RSI";
  private static final String PERMIT_REQUEST = "PERMIT_REQUEST";

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

  public RecipientGroup resolveGroup(Long orgUnitNumber) {
    RecipientGroup regionalGroup = regionalGroupFor(orgUnitNumber);
    if (!regionalGroup.recipients().isEmpty()) {
      return regionalGroup;
    }
    return fallbackRecipients.isEmpty()
        ? regionalGroup
        : new RecipientGroup(PERMIT_REQUEST, fallbackRecipients);
  }

  private RecipientGroup regionalGroupFor(Long orgUnitNumber) {
    if (orgUnitNumber == null) {
      return RecipientGroup.empty();
    }
    if (RCO_ORG_UNITS.contains(orgUnitNumber)) {
      return new RecipientGroup(REGION_RCO, rcoRecipients);
    }
    if (RNI_ORG_UNITS.contains(orgUnitNumber)) {
      return new RecipientGroup(REGION_RNI, rniRecipients);
    }
    if (RSI_ORG_UNITS.contains(orgUnitNumber)) {
      return new RecipientGroup(REGION_RSI, rsiRecipients);
    }
    return RecipientGroup.empty();
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

  public record RecipientGroup(String label, List<String> recipients) {

    public RecipientGroup {
      recipients = recipients == null ? List.of() : List.copyOf(recipients);
    }

    private static RecipientGroup empty() {
      return new RecipientGroup(null, List.of());
    }
  }
}

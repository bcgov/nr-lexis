package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class RegionalMailRecipientResolver {

  private final String rcoAddress;
  private final String rniAddress;
  private final String rsiAddress;

  public RegionalMailRecipientResolver(
      @Value("${lexis.mail.region-rco-address:}") String rcoAddress,
      @Value("${lexis.mail.region-rni-address:}") String rniAddress,
      @Value("${lexis.mail.region-rsi-address:}") String rsiAddress) {
    this.rcoAddress = normalizedAddress(rcoAddress);
    this.rniAddress = normalizedAddress(rniAddress);
    this.rsiAddress = normalizedAddress(rsiAddress);
  }

  public RecipientGroup resolveGroup(Long orgUnitNumber) {
    return RegionalMailRoute.forOrgUnit(orgUnitNumber)
        .map(this::resolveGroupForRoute)
        .orElseGet(RecipientGroup::empty);
  }

  public RecipientGroup resolveGroupForRoute(RegionalMailRoute route) {
    return addressFor(route)
        .map(address -> new RecipientGroup(route, List.of(address)))
        .orElseGet(() -> new RecipientGroup(route, List.of()));
  }

  public Optional<String> addressFor(RegionalMailRoute route) {
    if (route == null) {
      return Optional.empty();
    }
    return switch (route) {
      case GENERAL -> Optional.empty();
      case RCO -> Optional.ofNullable(rcoAddress);
      case RNI -> Optional.ofNullable(rniAddress);
      case RSI -> Optional.ofNullable(rsiAddress);
    };
  }

  private static String normalizedAddress(String value) {
    return trimToNull(value);
  }

  public record RecipientGroup(RegionalMailRoute route, List<String> recipients) {

    public RecipientGroup {
      recipients = recipients == null ? List.of() : List.copyOf(recipients);
    }

    public String label() {
      return route == null ? null : route.label();
    }

    private static RecipientGroup empty() {
      return new RecipientGroup(null, List.of());
    }
  }
}

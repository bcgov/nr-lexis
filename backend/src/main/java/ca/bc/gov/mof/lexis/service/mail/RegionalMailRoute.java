package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/** Server-owned routing for provincial and regional positional mailboxes. */
public enum RegionalMailRoute {
  GENERAL("GENERAL"),
  RCO("REGION_RCO"),
  RNI("REGION_RNI"),
  RSI("REGION_RSI");

  private static final long SKEENA_ORG_UNIT = 1908L;
  private static final Set<Long> RCO_ORG_UNITS = Set.of(1835L, 1909L, 1910L);
  private static final Set<Long> RNI_ORG_UNITS = Set.of(1833L, 1905L, 1906L, SKEENA_ORG_UNIT);
  private static final Set<Long> RSI_ORG_UNITS = Set.of(1834L, 1903L, 1904L, 1907L);

  private final String label;

  RegionalMailRoute(String label) {
    this.label = label;
  }

  public String label() {
    return label;
  }

  public static Optional<RegionalMailRoute> forOrgUnit(Long orgUnitNumber) {
    if (orgUnitNumber == null) {
      return Optional.empty();
    }
    if (RCO_ORG_UNITS.contains(orgUnitNumber)) {
      return Optional.of(RCO);
    }
    if (RNI_ORG_UNITS.contains(orgUnitNumber)) {
      return Optional.of(RNI);
    }
    if (RSI_ORG_UNITS.contains(orgUnitNumber)) {
      return Optional.of(RSI);
    }
    return Optional.empty();
  }

  public static boolean isSkeena(Long orgUnitNumber) {
    return Long.valueOf(SKEENA_ORG_UNIT).equals(orgUnitNumber);
  }

  /**
   * Applies the legacy Skeena scale-grade exception used only by permit approvals and purchase
   * offers. Within each scale, an A-Y grade routes to RCO before a numeric grade can route to RNI;
   * Z is skipped.
   */
  public static RegionalMailRoute forPermitOrOffer(
      Long orgUnitNumber, List<String> scaleGradeCodes) {
    RegionalMailRoute baseRoute =
        forOrgUnit(orgUnitNumber)
            .orElseThrow(() -> new IllegalArgumentException("No regional mailbox route is available."));
    if (!isSkeena(orgUnitNumber)) {
      return baseRoute;
    }

    if (scaleGradeCodes != null) {
      for (String gradeCode : scaleGradeCodes) {
        String grade = trimToNull(gradeCode);
        if (grade == null) {
          continue;
        }
        String normalizedGrade = grade.toUpperCase(Locale.ROOT);
        if (normalizedGrade.chars().anyMatch(value -> value >= 'A' && value <= 'Y')) {
          return RCO;
        }
        if (normalizedGrade.chars().anyMatch(Character::isDigit)) {
          return RNI;
        }
      }
    }

    throw new IllegalArgumentException(
        "Skeena scale grades do not determine a regional mailbox route.");
  }
}

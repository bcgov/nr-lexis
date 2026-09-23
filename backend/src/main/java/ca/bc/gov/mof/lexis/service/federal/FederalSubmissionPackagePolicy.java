package ca.bc.gov.mof.lexis.service.federal;

import java.util.Set;

/** Package exceptions shared by XML validation and the validation before persistence. */
public final class FederalSubmissionPackagePolicy {

  // RNI, RSI, Cariboo, Kootenay-Boundary, North East, Omineca, Thompson-Okanagan, Skeena.
  private static final Set<Long> INTERIOR_ORG_UNITS =
      Set.of(1833L, 1834L, 1903L, 1904L, 1905L, 1906L, 1907L, 1908L);

  private FederalSubmissionPackagePolicy() {}

  public static boolean allowsWithoutPackage(
      String jurisdictionCode,
      String productTypeCode,
      Long orgUnitNumber,
      boolean hasSummaryOfScale) {
    if (!"F".equals(jurisdictionCode) || hasSummaryOfScale) {
      return false;
    }
    // INTENTIONAL_LEGACY_DIVERGENCE(FEDERAL_INTERIOR_HARVESTED_WITHOUT_PACKAGE):
    // Business permits Interior harvested applications without a summary of scale or boom number.
    return "S".equals(productTypeCode)
        || ("H".equals(productTypeCode)
            && orgUnitNumber != null
            && INTERIOR_ORG_UNITS.contains(orgUnitNumber));
  }
}

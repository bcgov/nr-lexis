package ca.bc.gov.mof.lexis.service.federal;

import ca.bc.gov.mof.lexis.util.TextUtils;
import java.util.Set;

/** Package exceptions shared by XML validation and the validation before persistence. */
public final class FederalSubmissionPackagePolicy {

  // Legacy Interior zones (RegionInfoUtils.zoneFromRegion): Cariboo, Kootenay-Boundary,
  // North East, Omineca, Thompson-Okanagan and Skeena.
  private static final Set<Long> INTERIOR_ORG_UNITS =
      Set.of(1903L, 1904L, 1905L, 1906L, 1907L, 1908L);

  private FederalSubmissionPackagePolicy() {}

  public static boolean allowsWithoutPackage(
      String jurisdictionCode,
      String productTypeCode,
      Long orgUnitNumber,
      boolean hasSummaryOfScale) {
    if (!"F".equals(TextUtils.trimToNull(jurisdictionCode)) || hasSummaryOfScale) {
      return false;
    }
    String productType = TextUtils.trimToNull(productTypeCode);
    // INTENTIONAL_LEGACY_DIVERGENCE(FEDERAL_INTERIOR_HARVESTED_WITHOUT_PACKAGE):
    // Business permits Interior harvested applications without a summary of scale or boom number.
    return "S".equals(productType)
        || ("H".equals(productType)
            && orgUnitNumber != null
            && INTERIOR_ORG_UNITS.contains(orgUnitNumber));
  }
}

package ca.bc.gov.mof.lexis.security;

import java.util.Arrays;
import java.util.Collection;
import java.util.Optional;
import java.util.Set;

/** A single FAM staff-role grant, retaining the region attached to that specific role. */
public record FamRegionGrant(String role, Region region) {

  private static final String SEPARATOR = "_REGION-";
  // A FAM role's scope is fixed when it is created, so the region-scoped variant of a role is
  // its own role, e.g. LEXIS_APPLICATION_APPROVER_REGION alongside LEXIS_APPLICATION_APPROVER.
  private static final String REGIONAL_ROLE_SUFFIX = "_REGION";
  private static final Set<String> REGIONAL_ROLES =
      Set.of("LEXIS_APPLICATION_APPROVER", "LEXIS_EXEMPTION_APPROVER", "LEXIS_READ_ONLY");

  public FamRegionGrant {
    if (role == null || !REGIONAL_ROLES.contains(role) || region == null) {
      throw new IllegalArgumentException("A supported regional staff role and region are required.");
    }
  }

  /**
   * Accept only the agreed FAM contract, {@code <ROLE>_REGION-<CODE>} or
   * {@code <ROLE>_REGION_REGION-<CODE>}; either grants ROLE within that region. Unknown regions,
   * Administrator, other scope types and compound scopes must not be collapsed into an unscoped
   * staff role.
   */
  public static Optional<FamRegionGrant> parse(String authority) {
    if (authority == null) {
      return Optional.empty();
    }
    int separator = authority.indexOf(SEPARATOR);
    if (separator < 0) {
      return Optional.empty();
    }
    String role = authority.substring(0, separator);
    if (role.endsWith(REGIONAL_ROLE_SUFFIX)) {
      role = role.substring(0, role.length() - REGIONAL_ROLE_SUFFIX.length());
    }
    if (!REGIONAL_ROLES.contains(role)) {
      return Optional.empty();
    }
    String baseRole = role;
    String regionCode = authority.substring(separator + SEPARATOR.length());
    return Arrays.stream(Region.values())
        .filter(region -> region.name().equals(regionCode))
        .findFirst()
        .map(region -> new FamRegionGrant(baseRole, region));
  }

  /** Whether any authority is a regional grant, i.e. whether region limits apply at all. */
  public static boolean anyIn(Collection<String> authorities) {
    return authorities != null
        && authorities.stream().anyMatch(authority -> parse(authority).isPresent());
  }

  /**
   * FAM uses Natural Resource Region names, while LEXIS uses Oracle organization-unit numbers.
   * These are the same eight regions used by LEXIS search options, not the RCO/RNI/RSI zone
   * preferences. Verified September 2026 against THE.ORG_UNIT in the TEST and PROD databases: all
   * eight are current Natural Resource Regions, and the only other current region-level unit
   * (889, Regional Forestry Office) holds no applications. PROD applications still tagged with
   * the obsolete forest regions (1833 RNI, 1834 RSI, 1835 RCO) are all older than three years.
   */
  public enum Region {
    CARIBOO(1903L),
    KOOTENAY_BOUNDARY(1904L),
    NORTHEAST(1905L),
    OMINECA(1906L),
    THOMPSON_OKANAGAN(1907L),
    SKEENA(1908L),
    SOUTH_COAST(1909L),
    WEST_COAST(1910L);

    private final long orgUnitNumber;

    Region(long orgUnitNumber) {
      this.orgUnitNumber = orgUnitNumber;
    }

    public long orgUnitNumber() {
      return orgUnitNumber;
    }
  }
}

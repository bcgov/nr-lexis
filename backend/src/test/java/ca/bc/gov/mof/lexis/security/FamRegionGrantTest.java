package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class FamRegionGrantTest {

  @ParameterizedTest
  @CsvSource({
    "CARIBOO, 1903",
    "KOOTENAY_BOUNDARY, 1904",
    "NORTHEAST, 1905",
    "OMINECA, 1906",
    "THOMPSON_OKANAGAN, 1907",
    "SKEENA, 1908",
    "SOUTH_COAST, 1909",
    "WEST_COAST, 1910"
  })
  void mapsFamRegionsToLexisOrganizationUnits(String code, long orgUnitNumber) {
    var grant = FamRegionGrant.parse("LEXIS_APPLICATION_APPROVER_REGION-" + code).orElseThrow();

    assertThat(grant.role()).isEqualTo("LEXIS_APPLICATION_APPROVER");
    assertThat(grant.region().name()).isEqualTo(code);
    assertThat(grant.region().orgUnitNumber()).isEqualTo(orgUnitNumber);
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "LEXIS_APPLICATION_APPROVER", "LEXIS_EXEMPTION_APPROVER", "LEXIS_READ_ONLY"
  })
  void supportsOnlyTheAgreedRegionalStaffRoles(String role) {
    assertThat(FamRegionGrant.parse(role + "_REGION-CARIBOO"))
        .contains(new FamRegionGrant(role, FamRegionGrant.Region.CARIBOO));
    // A FAM role's scope is fixed at creation, so the region-required variant is its own role.
    assertThat(FamRegionGrant.parse(role + "_REGION_REGION-CARIBOO"))
        .contains(new FamRegionGrant(role, FamRegionGrant.Region.CARIBOO));
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {
    "LEXIS_APPLICATION_APPROVER",
    "LEXIS_APPLICATION_APPROVER_REGION",
    "LEXIS_ADMIN_REGION-CARIBOO",
    "LEXIS_ADMIN_REGION_REGION-CARIBOO",
    "LEXIS_APPLICATION_APPROVER_REGION_REGION_REGION-CARIBOO",
    "LEXIS_APPLICATION_APPROVER_REGIONAL_REGION-CARIBOO",
    "LEXIS_PROVINCIAL_SUBMITTER_REGION-CARIBOO",
    "LEXIS_FEDERAL_READ_ONLY_REGION-CARIBOO",
    "APPLICATION_APPROVER_REGION-CARIBOO",
    "LEXIS_UNKNOWN_REGION-CARIBOO",
    "LEXIS_APPLICATION_APPROVER_REGION-",
    "LEXIS_APPLICATION_APPROVER_REGION-UNKNOWN",
    "LEXIS_APPLICATION_APPROVER_REGION-RSI",
    "LEXIS_APPLICATION_APPROVER_REGION-1903",
    "LEXIS_APPLICATION_APPROVER_REGION-CARIBOO,SKEENA",
    "LEXIS_APPLICATION_APPROVER_REGION-CARIBOO_REGION-SKEENA",
    "LEXIS_APPLICATION_APPROVER_DISTRICT-DCC_REGION-CARIBOO",
    "LEXIS_APPLICATION_APPROVER_REGION-CARIBOO_FOREST_CLIENT-00001018",
    "LEXIS_APPLICATION_APPROVER_REGION-cariboo",
    "lexis_application_approver_REGION-CARIBOO",
    " LEXIS_APPLICATION_APPROVER_REGION-CARIBOO",
    "LEXIS_APPLICATION_APPROVER_REGION-CARIBOO ",
    "FAM:EXPIRES:2026-09-30:LEXIS_APPLICATION_APPROVER_REGION-CARIBOO"
  })
  void rejectsUnsupportedOrMalformedGrantsWithoutLosingTheirScope(String authority) {
    assertThat(FamRegionGrant.parse(authority)).isEmpty();
  }
}

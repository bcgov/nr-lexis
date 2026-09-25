package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import ca.bc.gov.mof.lexis.configuration.LexisFeatureProperties;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LexisStaffRegionConstraintTest {

  private static final String READ = "/applicationDetails";
  private static final String WRITE = "createApplication";
  private static final String APPROVE = "approveExemption";
  private static final String REGIONAL_APP = "LEXIS_APPLICATION_APPROVER_REGION-CARIBOO";
  private final LexisSessionService sessionService = new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
  private final LexisFeatureProperties features = new LexisFeatureProperties();
  private final LexisAuthorizationService service = service();

  @Test
  void provinceWideReadOnlyDoesNotWidenRegionalWriteAccess() {
    var authorities = List.of("LEXIS_READ_ONLY", REGIONAL_APP);

    assertThat(service.resolveStaffRegionConstraint(authorities, READ).restricted()).isFalse();
    var writes = service.resolveStaffRegionConstraint(authorities, WRITE);
    assertThat(writes.restricted()).isTrue();
    assertThat(writes.orgUnitNumbers()).containsExactly(1903L);
    assertThat(writes.allows(1903L)).isTrue();
    assertThat(writes.allows(1908L)).isFalse();
    assertThat(service.resolveStaffRegionConstraint(authorities, APPROVE).denied()).isTrue();
  }

  @Test
  void differentRolesKeepTheirOwnRegionsForSharedReadAndSeparateWriteActions() {
    var authorities = List.of(
        REGIONAL_APP, "LEXIS_EXEMPTION_APPROVER_REGION-SKEENA");

    assertThat(service.resolveStaffRegionConstraint(authorities, READ).orgUnitNumbers())
        .containsExactly(1903L, 1908L);
    assertThat(service.resolveStaffRegionConstraint(authorities, WRITE).orgUnitNumbers())
        .containsExactly(1903L);
    assertThat(service.resolveStaffRegionConstraint(authorities, APPROVE).orgUnitNumbers())
        .containsExactly(1908L);
  }

  @Test
  void multipleRegionsForOneRoleAreCombinedAndDeduplicated() {
    var constraint = service.resolveStaffRegionConstraint(
        List.of(REGIONAL_APP, "LEXIS_APPLICATION_APPROVER_REGION-SOUTH_COAST", REGIONAL_APP), WRITE);

    assertThat(constraint.restricted()).isTrue();
    assertThat(constraint.orgUnitNumbers()).containsExactly(1903L, 1909L);
  }

  @Test
  void regionalGrantLimitsItsRoleEvenWhenTheRoleIsAlsoGrantedProvinceWide() {
    for (var authorities : List.of(
        List.of(REGIONAL_APP, "LEXIS_APPLICATION_APPROVER"),
        List.of("LEXIS_APPLICATION_APPROVER", REGIONAL_APP))) {
      var writes = service.resolveStaffRegionConstraint(authorities, WRITE);
      assertThat(writes.restricted()).isTrue();
      assertThat(writes.orgUnitNumbers()).containsExactly(1903L);
      assertThat(service.resolveStaffRegionConstraintForRoles(
              authorities, List.of("LEXIS_APPLICATION_APPROVER")).orgUnitNumbers())
          .containsExactly(1903L);
      assertThat(service.resolveActionRegions(authorities, List.of(READ, WRITE)))
          .containsEntry(READ, List.of(1903L))
          .containsEntry(WRITE, List.of(1903L));
    }
    // A different province-wide role keeps its own reach.
    var withReadOnly = List.of("LEXIS_READ_ONLY", "LEXIS_APPLICATION_APPROVER", REGIONAL_APP);
    assertThat(service.resolveStaffRegionConstraint(withReadOnly, READ).restricted()).isFalse();
    assertThat(service.resolveStaffRegionConstraint(withReadOnly, WRITE).orgUnitNumbers())
        .containsExactly(1903L);
  }

  @Test
  void unrelatedUnscopedRoleDoesNotWidenAnotherRolesApprovalRegion() {
    var constraint = service.resolveStaffRegionConstraint(
        List.of("LEXIS_APPLICATION_APPROVER", "LEXIS_EXEMPTION_APPROVER_REGION-SKEENA"), APPROVE);

    assertThat(constraint.restricted()).isTrue();
    assertThat(constraint.orgUnitNumbers()).containsExactly(1908L);
  }

  @Test
  void administratorRemainsGlobalWithinItsEnabledActions() {
    var authorities = List.of("LEXIS_ADMIN", REGIONAL_APP);
    assertThat(service.resolveStaffRegionConstraint(authorities, WRITE).restricted()).isFalse();
    assertThat(service.resolveStaffRegionConstraint(authorities, APPROVE).restricted()).isFalse();

    features.setProdRtmOnly(true);
    assertThat(service.resolveStaffRegionConstraint(authorities, WRITE).denied()).isTrue();
    assertThat(service.resolveStaffRegionConstraint(authorities, "/lexisAgentAdmin").restricted()).isFalse();
  }

  @Test
  void missingMalformedOrOtherIdentityGrantsCannotBecomeUnrestrictedStaffAccess() {
    for (var authorities : List.of(
        List.<String>of(),
        List.of("LEXIS_APPLICATION_APPROVER_REGION-UNKNOWN"),
        List.of("LEXIS_APPLICATION_APPROVER_REGION-RSI"),
        List.of("LEXIS_ADMIN_REGION-CARIBOO"),
        List.of("LEXIS_PROVINCIAL_SUBMITTER_00001018"),
        List.of("LEXIS_FEDERAL_READ_ONLY"),
        List.of("SCOPE_lexis:federal-submission:submit"),
        Arrays.asList(null, "FAM:EXPIRES:2026-09-30:" + REGIONAL_APP))) {
      var constraint = service.resolveStaffRegionConstraint(authorities, WRITE);
      assertThat(constraint.denied()).isTrue();
      assertThat(constraint.allows(1903L)).isFalse();
    }
    assertThat(service.resolveStaffRegionConstraint(null, WRITE).denied()).isTrue();
  }

  @Test
  void unknownActionsAndNullRecordRegionsAreDenied() {
    var authorities = List.of(REGIONAL_APP);
    assertThat(service.resolveStaffRegionConstraint(authorities, "unknownAction").denied()).isTrue();
    assertThat(service.resolveStaffRegionConstraint(authorities, null).denied()).isTrue();
    assertThat(service.resolveStaffRegionConstraint(authorities, WRITE).allows(null)).isFalse();
    assertThat(service.resolveStaffRegionConstraint(authorities, WRITE).allows(0L)).isFalse();
  }

  @Test
  void regionalGrantActivatesItsRoleWhileRecordChecksLimitItsRegions() {
    var authorities = sessionService.parseGrantedAuthorities(List.of(REGIONAL_APP));
    assertThat(authorities).containsExactly(REGIONAL_APP);
    assertThat(service.resolveGrantedActions(authorities)).containsExactly(READ, WRITE);
    assertThat(service.hasKnownRole(authorities)).isTrue();
    assertThat(service.canPerformAction(authorities, WRITE)).isTrue();
    assertThat(sessionService.resolveWelcomeRoute("IDIR\\staff.user", authorities).welcomeTarget())
        .isEqualTo("applicationApprover");
  }

  @Test
  void regionalApproverAlongsideProvinceWideReadOnlyHoldsBothRoles() {
    var authorities = sessionService.parseGrantedAuthorities(List.of("LEXIS_READ_ONLY", REGIONAL_APP));
    assertThat(authorities).containsExactly("LEXIS_READ_ONLY", REGIONAL_APP);
    assertThat(service.resolveGrantedActions(authorities)).containsExactly(READ, WRITE);
    var welcome = sessionService.resolveWelcomeRoute("IDIR\\staff.user", authorities);
    assertThat(welcome.roles()).containsExactly("LEXIS_READ_ONLY", "LEXIS_APPLICATION_APPROVER");
    assertThat(service.resolveStaffRegionConstraint(authorities, WRITE).orgUnitNumbers())
        .containsExactly(1903L);
  }

  @Test
  void separateRegionRoleCodesGrantTheSameRoleForAnyActionOfASurface() {
    var authorities = List.of(
        "LEXIS_APPLICATION_APPROVER_REGION_REGION-CARIBOO",
        "LEXIS_APPLICATION_APPROVER_REGION_REGION-SKEENA");
    assertThat(service.resolveStaffRegionConstraintForAny(authorities, List.of(APPROVE, WRITE))
            .orgUnitNumbers())
        .containsExactly(1903L, 1908L);
    assertThat(service.resolveStaffRegionConstraintForAny(authorities, List.of(APPROVE)).denied())
        .isTrue();
  }

  private LexisAuthorizationService service() {
    var properties = new LexisAuthorizationProperties();
    properties.setRoleActions(Map.of(
        "LEXIS_ADMIN", List.of("*"),
        "LEXIS_READ_ONLY", List.of(READ),
        "LEXIS_APPLICATION_APPROVER", List.of(READ, WRITE),
        "LEXIS_EXEMPTION_APPROVER", List.of(READ, APPROVE)));
    return new LexisAuthorizationService(properties, features, sessionService);
  }
}

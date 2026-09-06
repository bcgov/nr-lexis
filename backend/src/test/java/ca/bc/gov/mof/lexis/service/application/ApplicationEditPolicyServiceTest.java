package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ApplicationEditContext;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService.ApplicationEditPolicy;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith(MockitoExtension.class)
class ApplicationEditPolicyServiceTest {

  private static final Long APPLICATION_NUMBER = 1000456L;
  private static final LocalDate TODAY = LocalDate.of(2026, 7, 10);

  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private ApplicationDetailsRpcService applicationService;

  private final TestingAuthenticationToken authentication =
      new TestingAuthenticationToken("user", "password");
  private ApplicationEditPolicyService policyService;

  @BeforeEach
  void setUp() {
    Clock clock =
        Clock.fixed(
            Instant.parse("2026-07-10T19:00:00Z"), LexisBusinessTime.ZONE);
    policyService = new ApplicationEditPolicyService(sessionService, authorizationService, clock);
    lenient().when(sessionService.getConfiguredIndustryRoles())
        .thenReturn(Set.of("LEXIS_PROVINCIAL_SUBMITTER"));
  }

  @Test
  void industryNewApplicationUsesScheduleAndAllowsAllItemMutations() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER_00012345");
    context("NEW", TODAY, false, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
    assertThat(policy.industryUser()).isTrue();
  }

  @Test
  void industryApprovedApplicationWithPreApprovalPackageCanOnlyAddScales() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER");
    context("APP", TODAY.plusDays(1), true, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isFalse();
    assertThat(policy.canAddPackages()).isFalse();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isFalse();
  }

  @Test
  void industryApprovedApplicationWithPreApprovalScaleCannotMutateItems() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER");
    context("APP", TODAY.plusDays(1), true, true, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditPackages()).isFalse();
    assertThat(policy.canAddPackages()).isFalse();
    assertThat(policy.canAddScales()).isFalse();
  }

  @Test
  void approverCanEditApprovedSummaryWithinSixDaysAndItemsWithoutCompletePermit() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("APP", TODAY.minusDays(5), true, true, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
  }

  @Test
  void approverSummaryAndRenameWindowEndsAtSixDaysButItemEditingDoesNot() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("APP", TODAY.minusDays(6), true, true, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isFalse();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isFalse();
  }

  @Test
  void completePermitDeniesApproverItemMutations() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("NEW", TODAY.plusDays(1), false, false, true);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isFalse();
    assertThat(policy.canAddPackages()).isFalse();
    assertThat(policy.canAddScales()).isFalse();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_ADMIN",
        "LEXIS_APPLICATION_APPROVER",
        "LEXIS_PROVINCIAL_SUBMITTER_00012345"
      })
  void authorizedRolesCanUseInteriorMinisterialRemainingVolumeItemOverride(String role) {
    allowRoles(role);
    context("PMT", TODAY.minusDays(30), true, true, true, true);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canEditApplicationDetails()).isFalse();
    assertThat(policy.canUpdatePackageNumber()).isFalse();
  }

  @ParameterizedTest
  @ValueSource(strings = {"LEXIS_READ_ONLY", "LEXIS_EXEMPTION_APPROVER"})
  void restrictiveRolesCannotUseInteriorMinisterialItemOverride(String restrictiveRole) {
    allowRoles("LEXIS_APPLICATION_APPROVER", restrictiveRole);
    context("PMT", TODAY.minusDays(30), true, true, true, true);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.anyEditable()).isFalse();
  }

  @Test
  void administratorUsesStaffApplicationEditPolicy() {
    allowRoles("LEXIS_ADMIN");
    context("APP", TODAY.minusDays(5), true, true, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
  }

  @Test
  void standingTimberAllowsSummaryEditsButDeniesPackageAndScaleMutations() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("NEW", TODAY.plusDays(1), false, false, false, false, "S");

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isFalse();
    assertThat(policy.canAddPackages()).isFalse();
    assertThat(policy.canAddScales()).isFalse();
    assertThat(policy.canUpdatePackageNumber()).isFalse();
    assertThatThrownBy(
            () ->
                policyService.requirePackageAddOrDelete(
                    authentication, applicationService, APPLICATION_NUMBER))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    assertThatThrownBy(
            () ->
                policyService.requireScaleAddOrDelete(
                    authentication, applicationService, APPLICATION_NUMBER))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
  }

  @Test
  void unmanufacturedTimberAllowsPackageMutationsButDeniesScaleMutations() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("NEW", TODAY.plusDays(1), false, false, false, false, "T");

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isFalse();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
    assertThatThrownBy(
            () ->
                policyService.requireScaleAddOrDelete(
                    authentication, applicationService, APPLICATION_NUMBER))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_ADMIN",
        "LEXIS_APPLICATION_APPROVER",
        "LEXIS_PROVINCIAL_SUBMITTER_00012345"
      })
  void interiorMinisterialOverrideKeepsUnmanufacturedTimberScaleMutationsDenied(String role) {
    allowRoles(role);
    context("PMT", TODAY.minusDays(30), true, true, true, true, "T");

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isFalse();
  }

  @Test
  void administratorDominatesConcurrentRestrictiveAndSubmitterRoles() {
    allowRoles(
        "LEXIS_ADMIN",
        "LEXIS_READ_ONLY",
        "LEXIS_EXEMPTION_APPROVER",
        "LEXIS_PROVINCIAL_SUBMITTER_00012345");
    context("APP", TODAY.minusDays(5), true, true, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
    assertThat(policy.industryUser()).isFalse();
    assertThat(policy.readOnly()).isFalse();
    assertThat(policy.exemptionApprover()).isFalse();
  }

  @Test
  void exemptionApproverAndReadOnlyRolesAreDenied() {
    allowRoles("LEXIS_EXEMPTION_APPROVER", "LEXIS_READ_ONLY");
    context("NEW", TODAY.plusDays(1), false, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.anyEditable()).isFalse();
    assertThat(policy.exemptionApprover()).isTrue();
    assertThat(policy.readOnly()).isTrue();
  }

  @Test
  void readOnlyIsAbsoluteDenyWhenCombinedWithApplicationApprover() {
    allowRoles("LEXIS_READ_ONLY", "LEXIS_APPLICATION_APPROVER");
    context("NEW", TODAY.plusDays(1), false, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.anyEditable()).isFalse();
    assertThat(policy.readOnly()).isTrue();
  }

  @Test
  void missingContextOrActionFailsClosed() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(applicationService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(Optional.empty());

    assertThat(
            policyService
                .resolve(authentication, applicationService, APPLICATION_NUMBER)
                .anyEditable())
        .isFalse();
  }

  @Test
  void provincialPolicyDeniesFederalApplicationContext() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(applicationService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(
            Optional.of(
                new ApplicationEditContext(
                    APPLICATION_NUMBER,
                    "NEW",
                    "F",
                    "H",
                    12L,
                    TODAY.plusDays(1),
                    false,
                    false,
                    false,
                    null,
                    true)));

    assertThat(
            policyService
                .resolve(authentication, applicationService, APPLICATION_NUMBER)
                .anyEditable())
        .isFalse();
  }

  @Test
  void provincialPolicyDeniesSystemOwnedBlanketOicApplicationContext() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(applicationService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(
            Optional.of(
                new ApplicationEditContext(
                    APPLICATION_NUMBER,
                    "NEW",
                    "P",
                    "H",
                    12L,
                    TODAY.plusDays(1),
                    false,
                    false,
                    false,
                    "Y",
                    true)));

    assertThat(
            policyService
                .resolve(authentication, applicationService, APPLICATION_NUMBER)
                .anyEditable())
        .isFalse();
  }

  @Test
  void lookupFailurePropagatesBeforeMutationAuthorization() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(applicationService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenThrow(new IllegalStateException("Oracle unavailable"));

    assertThatThrownBy(
            () ->
                policyService.requirePackageEdit(
                    authentication, applicationService, APPLICATION_NUMBER))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Oracle unavailable");
  }

  private void allowRoles(String... roles) {
    List<String> grantedRoles = List.of(roles);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(grantedRoles);
    when(authorizationService.canPerformAction(grantedRoles, "createApplication"))
        .thenReturn(true);
  }

  private void context(
      String status,
      LocalDate advertisingDate,
      boolean hasPackageBeforeApproval,
      boolean hasScaleBeforeApproval,
      boolean hasCompletePermit) {
    context(
        status,
        advertisingDate,
        hasPackageBeforeApproval,
        hasScaleBeforeApproval,
        hasCompletePermit,
        false,
        "H");
  }

  private void context(
      String status,
      LocalDate advertisingDate,
      boolean hasPackageBeforeApproval,
      boolean hasScaleBeforeApproval,
      boolean hasCompletePermit,
      boolean interiorMinisterialItemOverrideEligible) {
    context(
        status,
        advertisingDate,
        hasPackageBeforeApproval,
        hasScaleBeforeApproval,
        hasCompletePermit,
        interiorMinisterialItemOverrideEligible,
        "H");
  }

  private void context(
      String status,
      LocalDate advertisingDate,
      boolean hasPackageBeforeApproval,
      boolean hasScaleBeforeApproval,
      boolean hasCompletePermit,
      boolean interiorMinisterialItemOverrideEligible,
      String productTypeCode) {
    when(applicationService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(
            Optional.of(
                new ApplicationEditContext(
                    APPLICATION_NUMBER,
                    status,
                    "P",
                    productTypeCode,
                    12L,
                    advertisingDate,
                    hasPackageBeforeApproval,
                    hasScaleBeforeApproval,
                    hasCompletePermit,
                    null,
                    interiorMinisterialItemOverrideEligible)));
  }
}

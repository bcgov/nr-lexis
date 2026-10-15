package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ApplicationEditContext;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService.ApplicationEditPolicy;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
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
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith(MockitoExtension.class)
class ApplicationEditPolicyServiceTest {

  private static final Long APPLICATION_NUMBER = 1000456L;
  private static final LocalDate TODAY = LocalDate.of(2026, 7, 10);

  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private ApplicationDetailsRpcService applicationService;
  @Mock private ApplicationDetailsRpcRepository applicationRepository;
  @Mock private ExemptionService exemptionService;

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
  void industryApprovedApplicationWithPreApprovalPackageKeepsItemChangesWhileDetailsAreEditable() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER");
    context("APP", TODAY.plusDays(1), true, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canDeletePackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canDeleteScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isFalse();
  }

  @Test
  void industryApprovedApplicationWithPreApprovalScaleCanAddButNotDeleteScales() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER");
    context("APP", TODAY.plusDays(1), true, true, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canDeletePackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canDeleteScales()).isFalse();
    assertThatThrownBy(
            () ->
                policyService.requireScaleDelete(
                    authentication, applicationService, APPLICATION_NUMBER))
        .hasMessageContaining("Scale deletion");
  }

  @Test
  void industryApprovedApplicationWithPreApprovalScaleCannotChangeItemsAfterTheListDate() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER");
    context("APP", TODAY, true, true, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isFalse();
    assertThat(policy.anyEditable()).isFalse();
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
  void completePermitDeniesApproverItemMutationsOnceDetailsAreLocked() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("EXE", TODAY.minusDays(30), false, false, true);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isFalse();
    assertThat(policy.anyEditable()).isFalse();
  }

  @Test
  void completePermitKeepsItemChangesExceptScaleDeletionWhileDetailsAreEditable() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("NEW", TODAY.plusDays(1), false, false, true);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canDeletePackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canDeleteScales()).isFalse();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_ADMIN",
        "LEXIS_APPLICATION_APPROVER",
        "LEXIS_PROVINCIAL_SUBMITTER_00012345"
      })
  void expiredApplicationDeniesPackageAndScaleChanges(String role) {
    allowRoles(role);
    context("EXP", TODAY.minusDays(30), false, false, false, true);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.anyEditable()).isFalse();
    assertThatThrownBy(
            () ->
                policyService.requirePackageEdit(
                    authentication, applicationService, APPLICATION_NUMBER))
        .hasMessageContaining("Package editing");
    assertThatThrownBy(
            () ->
                policyService.requireScaleAdd(
                    authentication, applicationService, APPLICATION_NUMBER))
        .hasMessageContaining("Scale creation");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_ADMIN",
        "LEXIS_APPLICATION_APPROVER",
        "LEXIS_PROVINCIAL_SUBMITTER_00012345"
      })
  void authorizedRolesCanUseMinisterialRemainingVolumeItemOverride(String role) {
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

  @Test
  void exemptionApproverChangesExistingItemsWithMinisterialItemOverrideButCannotCreatePackages() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    context("PMT", TODAY.minusDays(30), true, true, true, true);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isFalse();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isFalse();
    assertThat(policy.canDeletePackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canDeleteScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isFalse();
    assertThatThrownBy(
            () ->
                policyService.requirePackageAdd(
                    authentication, applicationService, APPLICATION_NUMBER))
        .hasMessageContaining("Package creation");
  }

  @Test
  void exemptionApproverWithoutMinisterialItemOverrideCannotChangeItems() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    context("PMT", TODAY.minusDays(30), true, true, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.anyEditable()).isFalse();
  }

  @ParameterizedTest
  @ValueSource(strings = {"LEXIS_ADMIN", "LEXIS_APPLICATION_APPROVER"})
  void approverCanChangeTheAgentWhileTheMinisterialPermitIsNotCompleteOrCancelled(String role) {
    allowRoles(role);
    when(authorizationService.canPerformAction(List.of(role), "/changeApplicantType"))
        .thenReturn(true);
    agentPermitContext("EXE");

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isFalse();
    assertThat(policy.canChangeAgent()).isTrue();
    assertThat(policy.anyEditable()).isTrue();
    assertThat(
            policyService.allowsAgentChangeOnly(
                authentication, applicationService, APPLICATION_NUMBER))
        .isTrue();
  }

  @ParameterizedTest
  @CsvSource({
    "LEXIS_APPLICATION_APPROVER, PPD, true",
    "LEXIS_APPLICATION_APPROVER, COM, false",
    "LEXIS_PROVINCIAL_SUBMITTER_00012345, PPD, false"
  })
  void onlyAnApproverChangesTheAgentAloneWhileTheMinisterialPermitIsPaymentPending(
      String role, String permitStatus, boolean agentChangeOnly) {
    allowRoles(role);
    lenient()
        .when(authorizationService.canPerformAction(List.of(role), "/changeApplicantType"))
        .thenReturn(true);
    when(applicationRepository.findApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationEditContextRow(
                    APPLICATION_NUMBER,
                    "PMT",
                    "P",
                    "H",
                    12L,
                    TODAY.minusDays(30),
                    null,
                    null,
                    "EX-205",
                    1903L)));
    when(applicationRepository.findPackageMutationsByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(List.of());
    when(applicationRepository.findScaleMutationsByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ScaleMutationRow(
                    "S-1",
                    "TM001",
                    10L,
                    5.0d,
                    "PKG-1",
                    "FI",
                    "1",
                    APPLICATION_NUMBER,
                    7000123L,
                    "idir\\creator",
                    Instant.EPOCH)));
    when(applicationRepository.findPermitStatusCodeByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitStatus));
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(ministerialExemption("EX-205")));
    OracleApplicationDetailsRpcService oracleApplicationService =
        new OracleApplicationDetailsRpcService(applicationRepository, null, exemptionService);

    assertThat(
            policyService.allowsAgentChangeOnly(
                authentication, oracleApplicationService, APPLICATION_NUMBER))
        .isEqualTo(agentChangeOnly);
  }

  @Test
  void agentChangeNeedsTheApplicantTypeAction() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "/changeApplicantType"))
        .thenReturn(false);
    agentPermitContext("EXE");

    assertThat(
            policyService.allowsAgentChangeOnly(
                authentication, applicationService, APPLICATION_NUMBER))
        .isFalse();
  }

  @Test
  void submitterCannotChangeTheAgentOnAPermittedApplication() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER_00012345");
    agentPermitContext("EXE");

    assertThat(
            policyService
                .resolve(authentication, applicationService, APPLICATION_NUMBER)
                .canChangeAgent())
        .isFalse();
  }

  @Test
  void agentChangeEndsWhenTheApplicationExpires() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    agentPermitContext("EXP");

    assertThat(
            policyService
                .resolve(authentication, applicationService, APPLICATION_NUMBER)
                .canChangeAgent())
        .isFalse();
  }

  @Test
  void approverUpdatesExistingRemarksAfterTheDetailsLock() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    context("PMT", TODAY.minusDays(30), true, true, true);

    assertThatCode(
            () ->
                policyService.requireRemarkUpdate(
                    authentication, applicationService, APPLICATION_NUMBER))
        .doesNotThrowAnyException();
  }

  @Test
  void readOnlyCannotUpdateRemarks() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_READ_ONLY"));
    context("PMT", TODAY.minusDays(30), true, true, true);

    assertThatThrownBy(
            () ->
                policyService.requireRemarkUpdate(
                    authentication, applicationService, APPLICATION_NUMBER))
        .hasMessageContaining("Remark editing");
  }

  @Test
  void remarksOnAnExpiredApplicationCannotBeUpdated() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    context("EXP", TODAY.minusDays(30), true, true, false);

    assertThatThrownBy(
            () ->
                policyService.requireRemarkUpdate(
                    authentication, applicationService, APPLICATION_NUMBER))
        .hasMessageContaining("Remark editing");
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

  @ParameterizedTest
  @CsvSource({
    "LEXIS_APPLICATION_APPROVER,S",
    "LEXIS_APPLICATION_APPROVER,T",
    "LEXIS_PROVINCIAL_SUBMITTER_00012345,S",
    "LEXIS_PROVINCIAL_SUBMITTER_00012345,T"
  })
  void standingAndUnmanufacturedTimberAllowPackageAndScaleMutations(
      String role, String productTypeCode) {
    allowRoles(role);
    context("NEW", TODAY.plusDays(1), false, false, false, false, productTypeCode);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
    assertThatCode(
            () -> {
              policyService.requirePackageEdit(
                  authentication, applicationService, APPLICATION_NUMBER);
              policyService.requirePackageAdd(
                  authentication, applicationService, APPLICATION_NUMBER);
              policyService.requirePackageDelete(
                  authentication, applicationService, APPLICATION_NUMBER);
              policyService.requireScaleAdd(
                  authentication, applicationService, APPLICATION_NUMBER);
              policyService.requireScaleDelete(
                  authentication, applicationService, APPLICATION_NUMBER);
              policyService.requirePackageNumberUpdate(
                  authentication, applicationService, APPLICATION_NUMBER);
            })
        .doesNotThrowAnyException();
  }

  @Test
  void standingTimberKeepsCompletePermitItemLock() {
    allowRoles("LEXIS_APPLICATION_APPROVER");
    context("PMT", TODAY.minusDays(30), true, true, true, false, "S");

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

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
  void ministerialOverrideAllowsUnmanufacturedTimberScaleMutations(String role) {
    allowRoles(role);
    context("PMT", TODAY.minusDays(30), true, true, true, true, "T");

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
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
    assertThat(policy.readOnly()).isFalse();
  }

  @Test
  void applicationApproverAndReadOnlyRetainApplicationEditPolicy() {
    allowRoles("LEXIS_READ_ONLY", "LEXIS_APPLICATION_APPROVER");
    context("NEW", TODAY.plusDays(1), false, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
    assertThat(policy.readOnly()).isFalse();
  }

  @Test
  void provincialSubmitterAndReadOnlyRetainIndustryApplicationEditPolicy() {
    allowRoles("LEXIS_PROVINCIAL_SUBMITTER_00012345", "LEXIS_READ_ONLY");
    context("NEW", TODAY.plusDays(1), false, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.canEditApplicationDetails()).isTrue();
    assertThat(policy.canEditPackages()).isTrue();
    assertThat(policy.canAddPackages()).isTrue();
    assertThat(policy.canAddScales()).isTrue();
    assertThat(policy.canUpdatePackageNumber()).isTrue();
    assertThat(policy.industryUser()).isTrue();
    assertThat(policy.readOnly()).isFalse();
  }

  @Test
  void pureReadOnlyRoleCannotEditApplications() {
    allowRoles("LEXIS_READ_ONLY");
    context("NEW", TODAY.plusDays(1), false, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.anyEditable()).isFalse();
    assertThat(policy.readOnly()).isTrue();
  }

  @Test
  void mixedReadOnlyRolesStillRequireCreateApplicationAction() {
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER", "LEXIS_READ_ONLY");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    context("NEW", TODAY.plusDays(1), false, false, false);

    ApplicationEditPolicy policy =
        policyService.resolve(authentication, applicationService, APPLICATION_NUMBER);

    assertThat(policy.anyEditable()).isFalse();
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

  @ParameterizedTest
  @CsvSource({"1, false", "0, true", "-1, true"})
  void listDateIsReachedFromTheListDateItself(long daysFromToday, boolean reached) {
    context("NEW", TODAY.plusDays(daysFromToday), false, false, false);

    assertThat(policyService.listDateReached(applicationService, APPLICATION_NUMBER))
        .isEqualTo(reached);
  }

  @Test
  void listDateIsNotReachedWithoutAListDateOrApplication() {
    context("NEW", null, false, false, false);

    assertThat(policyService.listDateReached(applicationService, APPLICATION_NUMBER)).isFalse();
    assertThat(policyService.listDateReached(applicationService, null)).isFalse();
  }

  @Test
  void listDateFollowsBusinessTimeRatherThanUtc() {
    ApplicationEditPolicyService lateEveningPolicyService =
        new ApplicationEditPolicyService(
            sessionService,
            authorizationService,
            Clock.fixed(Instant.parse("2026-07-11T06:30:00Z"), LexisBusinessTime.ZONE));
    context("NEW", TODAY.plusDays(1), false, false, false);

    assertThat(lateEveningPolicyService.listDateReached(applicationService, APPLICATION_NUMBER))
        .isFalse();
  }

  private void allowRoles(String... roles) {
    List<String> grantedRoles = List.of(roles);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(grantedRoles);
    when(authorizationService.canPerformAction(grantedRoles, "createApplication"))
        .thenReturn(true);
  }

  @ParameterizedTest
  @CsvSource({"5, true", "6, false"})
  void approvedReviewWindowShouldCloseSixDaysAfterTheListDate(long daysAgo, boolean open) {
    context("APP", TODAY.minusDays(daysAgo), false, false, false);

    assertThat(policyService.approvedReviewWindowOpen(applicationService, APPLICATION_NUMBER))
        .isEqualTo(open);
  }

  @Test
  void approvedReviewWindowShouldStayOpenForAnOicApplicationWithinSixDays() {
    when(applicationService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(
            Optional.of(
                new ApplicationEditContext(
                    APPLICATION_NUMBER,
                    "APP",
                    "P",
                    "H",
                    12L,
                    TODAY.minusDays(2),
                    false,
                    false,
                    false,
                    "Y",
                    false)));

    assertThat(policyService.approvedReviewWindowOpen(applicationService, APPLICATION_NUMBER))
        .isTrue();
  }

  private ExemptionDetailDto ministerialExemption(String exemptionNumber) {
    return new ExemptionDetailDto(
        exemptionNumber,
        "M",
        null,
        "ACT",
        null,
        null,
        null,
        APPLICATION_NUMBER,
        "PMT",
        null,
        null,
        100.0d,
        100.0d,
        0.0d,
        null,
        false,
        List.of(),
        List.of());
  }

  private void agentPermitContext(String status) {
    when(applicationService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(
            Optional.of(
                new ApplicationEditContext(
                    APPLICATION_NUMBER,
                    status,
                    "P",
                    "H",
                    12L,
                    TODAY.minusDays(30),
                    true,
                    true,
                    false,
                    null,
                    false,
                    true)));
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
      boolean ministerialItemOverrideEligible) {
    context(
        status,
        advertisingDate,
        hasPackageBeforeApproval,
        hasScaleBeforeApproval,
        hasCompletePermit,
        ministerialItemOverrideEligible,
        "H");
  }

  private void context(
      String status,
      LocalDate advertisingDate,
      boolean hasPackageBeforeApproval,
      boolean hasScaleBeforeApproval,
      boolean hasCompletePermit,
      boolean ministerialItemOverrideEligible,
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
                    ministerialItemOverrideEligible)));
  }
}

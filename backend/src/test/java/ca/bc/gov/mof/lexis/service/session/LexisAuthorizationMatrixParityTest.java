package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.LexisApiApplication;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
    classes = LexisApiApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = {
      "spring.profiles.active=stub-reports,stub-services",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json"
    })
class LexisAuthorizationMatrixParityTest {

  private static final List<String> PROVINCIAL_VIEW_ACTIONS =
      List.of(
          "/applicationSearch",
          "/applicationDetails",
          "/exemptionSearch",
          "/exemptionDetails",
          "/offersSearch",
          "/offerDetails",
          "/permitSearch",
          "/permitDetails");

  private static final List<String> REPORT_ACTIONS =
      List.of(
          "mofrListing",
          "/applicationReport",
          "/offerReport",
          "/teacReport",
          "/exemptionReport",
          "/permitReport",
          "/permitLedgerReport",
          "/transportReport",
          "/speciesGradeReport",
          "/feeReport",
          "/tenureReport",
          "/approvedExemptionReport");

  private static final List<String> NON_PERMIT_REPORT_ACTIONS =
      REPORT_ACTIONS.stream().filter(action -> !"/permitReport".equals(action)).toList();

  private static final List<String> LEGACY_STAFF_REPORT_ACTIONS =
      REPORT_ACTIONS.stream()
          .filter(
              action ->
                  !"/applicationReport".equals(action)
                      && !"/approvedExemptionReport".equals(action))
          .toList();

  private static final List<String> FEDERAL_READ_ACTIONS =
      List.of(
          "/federalApplicationSearch",
          "/federalApplicationDetails",
          "viewFederalApplication");

  @Autowired
  private LexisAuthorizationService authorizationService;

  @Test
  void everyLegacyActionShouldHaveAtLeastOneConfiguredRole() {
    List<String> uncoveredActions =
        authorizationService.getKnownActions().stream()
            .filter(action -> authorizationService.resolveRolesForAction(action).isEmpty())
            .toList();

    assertThat(uncoveredActions).isEmpty();
  }

  @Test
  void configuredRolesShouldContainFinalFamRoleModel() {
    assertThat(authorizationService.getConfiguredRoles())
        .contains(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_APPLICATION_APPROVER",
            "LEXIS_EXEMPTION_APPROVER",
            "LEXIS_PROVINCIAL_SUBMITTER")
        .doesNotContain("LEXIS_DELEGATED_ADMIN");
  }

  @Test
  void adminRoleShouldHaveEveryKnownAction() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_ADMIN")))
        .containsExactlyElementsOf(authorizationService.getKnownActions());

    assertThat(authorizationService.getKnownActions())
        .allSatisfy(
            action ->
                assertThat(authorizationService.resolveRolesForAction(action))
                    .contains("LEXIS_ADMIN"));
  }

  @Test
  void provincialSubmitterShouldCreateApplicationsOffersAndLegacyPermitReports() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_PROVINCIAL_SUBMITTER")))
        .containsAll(PROVINCIAL_VIEW_ACTIONS)
        .contains(
            "/summary",
            "createApplication",
            "createOffer",
            "createPermit",
            "savePermit",
            "/permitReport")
        .contains("uploadApplicationSubmission")
        .contains(
            "/fileApplicationUpload",
            "/fileExemptionUpload",
            "/fileInvoiceUpload",
            "/filePermitUpload")
        .doesNotContain(
            "/changeApplicantType",
            "/applicationRemarks",
            "/createExemption",
            "approveExemption",
            "saveExemption",
            "uploadFederalSubmission")
        .doesNotContainAnyElementsOf(FEDERAL_READ_ACTIONS)
        .doesNotContainAnyElementsOf(NON_PERMIT_REPORT_ACTIONS);
  }

  @Test
  void scopedProvincialSubmitterShouldUseProvincialSubmitterGrants() {
    assertThat(
            authorizationService.resolveGrantedActions(
                List.of("LEXIS_PROVINCIAL_SUBMITTER_00012345")))
        .containsAll(PROVINCIAL_VIEW_ACTIONS)
        .contains(
            "/summary",
            "createApplication",
            "createOffer",
            "createPermit",
            "savePermit",
            "/permitReport")
        .contains("uploadApplicationSubmission")
        .contains(
            "/fileApplicationUpload",
            "/fileExemptionUpload",
            "/fileInvoiceUpload",
            "/filePermitUpload")
        .doesNotContain(
            "/changeApplicantType",
            "saveExemption",
            "uploadFederalSubmission")
        .doesNotContainAnyElementsOf(FEDERAL_READ_ACTIONS)
        .doesNotContainAnyElementsOf(NON_PERMIT_REPORT_ACTIONS);
  }

  @Test
  void applicationApplicantTypeSelectionShouldRemainSeparatelyAuthorized() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_PROVINCIAL_SUBMITTER")))
        .contains("createApplication")
        .doesNotContain("/changeApplicantType");
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_APPLICATION_APPROVER")))
        .contains("createApplication", "/changeApplicantType");
  }

  @Test
  void knownRoleDetectionShouldNormalizeScopedProvincialSubmitters() {
    assertThat(authorizationService.hasKnownRole(List.of("LEXIS_PROVINCIAL_SUBMITTER_00012345")))
        .isTrue();
    assertThat(authorizationService.hasKnownRole(List.of("LEXIS_DELEGATED_ADMIN"))).isFalse();
    assertThat(authorizationService.hasKnownRole(List.of("LEXIS_UNKNOWN"))).isFalse();
  }

  @Test
  void applicationRemarksShouldBeVisibleToReadOnlyAndEditableRoles() {
    assertThat(authorizationService.resolveRolesForAction("/applicationRemarks"))
        .contains(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_APPLICATION_APPROVER")
        .doesNotContain(
            "LEXIS_EXEMPTION_APPROVER",
            "LEXIS_PROVINCIAL_SUBMITTER");
  }

  @Test
  void supportingDocumentUploadsShouldFollowLegacyGroupNineRoles() {
    List.of(
            "/fileApplicationUpload",
            "/fileExemptionUpload",
            "/fileInvoiceUpload",
            "/filePermitUpload")
        .forEach(
            action ->
                assertThat(authorizationService.resolveRolesForAction(action))
                    .containsExactlyInAnyOrder(
                        "LEXIS_ADMIN",
                        "LEXIS_APPLICATION_APPROVER",
                        "LEXIS_PROVINCIAL_SUBMITTER"));
  }

  @Test
  void unknownRoleShouldGrantNoActions() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_UNKNOWN_ROLE")))
        .isEmpty();
    assertThat(authorizationService.hasKnownRole(List.of("LEXIS_UNKNOWN_ROLE"))).isFalse();
  }

  @Test
  void dedicatedFederalUploadActionShouldBeScopeOnlyForNonAdminCallers() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_ADMIN")))
        .doesNotContain("uploadFederalSubmission");

    assertThat(authorizationService.resolveRolesForAction("uploadFederalSubmission"))
        .isEmpty();

    assertThat(authorizationService.resolveRolesForAction("uploadApplicationSubmission"))
        .doesNotContain("SCOPE_lexis:federal-submission:submit");
  }

  @Test
  void federalUploadScopeShouldOnlyUseDedicatedFederalUploadAction() {
    List<String> authorities = List.of("SCOPE_lexis:federal-submission:submit");

    assertThat(authorizationService.resolveGrantedActions(authorities))
        .containsExactly("uploadFederalSubmission");
    assertThat(authorizationService.hasKnownRole(authorities)).isFalse();
    assertThat(authorizationService.canPerformAction(authorities, "uploadFederalSubmission"))
        .isTrue();
    assertThat(authorizationService.canPerformAction(authorities, "uploadApplicationSubmission"))
        .isFalse();
    assertThat(authorizationService.canPerformAction(authorities, "/federalApplicationDetails"))
        .isFalse();
    assertThat(
            authorizationService.canPerformAction(
                List.of("SCOPE_lexis/federalSubmission/submit"), "uploadFederalSubmission"))
        .isFalse();
  }

  @Test
  void applicationApproverShouldEditProvincialWorkAndReadFederalApplications() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_APPLICATION_APPROVER")))
        .containsAll(PROVINCIAL_VIEW_ACTIONS)
        .containsAll(FEDERAL_READ_ACTIONS)
        .containsAll(LEGACY_STAFF_REPORT_ACTIONS)
        .contains(
            "/applicationsReview",
            "/changeApplicantType",
            "/applicationRemarks",
            "/editCompletedApplications",
            "/createExemption",
            "/permitsReview",
            "createApplication",
            "createOffer",
            "createPermit",
            "saveExemption",
            "savePermit",
            "manageFederalApplication",
            "uploadApplicationSubmission",
            "/fileApplicationUpload",
            "/fileExemptionUpload",
            "/fileInvoiceUpload",
            "/filePermitUpload")
        .doesNotContain(
            "/summary",
            "/applicationReport",
            "/approvedExemptionReport",
            "/lexisAgentAdmin",
            "/lexisFILAdmin",
            "/lexisPolicyAdmin",
            "approveExemption");
  }

  @Test
  void exemptionApproverShouldManageExemptionsWithoutFederalAccess() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_EXEMPTION_APPROVER")))
        .contains(
            "/applicationDetails",
            "/exemptionSearch",
            "/exemptionDetails",
            "approveExemption",
            "saveExemption")
        .doesNotContain(
            "/applicationsReview",
            "/applicationSearch",
            "/createExemption",
            "/offersSearch",
            "/permitSearch",
            "createApplication",
            "createOffer",
            "createPermit",
            "/federalApplicationSearch",
            "/federalApplicationDetails",
            "viewFederalApplication",
            "manageFederalApplication",
            "savePermit",
            "uploadApplicationSubmission")
        .doesNotContainAnyElementsOf(REPORT_ACTIONS);
  }

  @Test
  void readOnlyRoleShouldViewSearchesDetailsRemarksAndReportsWithoutMutatingActions() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_READ_ONLY")))
        .containsAll(PROVINCIAL_VIEW_ACTIONS)
        .containsAll(FEDERAL_READ_ACTIONS)
        .containsAll(REPORT_ACTIONS)
        .contains("/applicationRemarks")
        .doesNotContain(
            "/summary",
            "/applicationsReview",
            "/editCompletedApplications",
            "/createExemption",
            "/fileApplicationUpload",
            "/fileExemptionUpload",
            "/fileInvoiceUpload",
            "/filePermitUpload",
            "/lexisAgentAdmin",
            "/lexisFILAdmin",
            "/lexisPolicyAdmin",
            "approveExemption",
            "createApplication",
            "createOffer",
            "createPermit",
            "saveExemption",
            "savePermit",
            "uploadApplicationSubmission");
  }

  @Test
  void createPermitShouldBeAvailableToLegacyPermitCreators() {
    assertThat(authorizationService.resolveRolesForAction("createPermit"))
        .containsExactlyInAnyOrder(
            "LEXIS_ADMIN", "LEXIS_APPLICATION_APPROVER", "LEXIS_PROVINCIAL_SUBMITTER");
  }
}

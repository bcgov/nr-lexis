package ca.bc.gov.mof.lexis.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito-idp.ca-central-1.amazonaws.com/test",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json",
      "ALLOWED_ORIGINS=http://localhost:3000"
    })
@AutoConfigureMockMvc
class LexisRouteAuthorizationIntegrationTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void applicationsSearchShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/applications/search")).andExpect(status().isUnauthorized());
  }

  @Test
  void legacyShowWelcomeShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/showWelcome.do")).andExpect(status().isUnauthorized());
  }

  @Test
  void legacyShowWelcomeShouldAllowKnownRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/showWelcome.do")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.welcomeTarget").value("adminUser"));
  }

  @Test
  void sessionShouldAllowDelegatedAdminButNotGrantApplicationRoutes() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/welcome")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_DELEGATED_ADMIN"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.welcomeTarget").value("noAccess"));

    mockMvc.perform(
            get("/api/lexis/application-reviews/search")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_DELEGATED_ADMIN"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyAccessDeniedForwardShouldRemainPublic() throws Exception {
    mockMvc
        .perform(get("/api/lexis/accessDenied.do"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
  }

  @Test
  void corsPreflightShouldAllowConfiguredOriginOnProtectedRoute() throws Exception {
    mockMvc
        .perform(
            options("/api/lexis/applications/search")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "Authorization"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
        .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
  }

  @Test
  void corsPreflightShouldRejectDisallowedOriginOnProtectedRoute() throws Exception {
    mockMvc
        .perform(
            options("/api/lexis/applications/search")
                .header("Origin", "https://disallowed.example.com")
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "Authorization"))
        .andExpect(status().isForbidden())
        .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
  }

  @Test
  void applicationsSearchShouldAllowCanonicalReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/applications/search")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk());
  }

  @Test
  void applicationsSearchShouldRejectLegacyReadOnlyAlias() throws Exception {
    mockMvc.perform(
            get("/api/lexis/applications/search")
                .with(jwt().authorities(new SimpleGrantedAuthority("READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyApplicationSearchRouteShouldAllowCanonicalReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/applicationSearch")
                .param("actionMapping", "view")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().is2xxSuccessful());
  }

  @Test
  void legacyApplicationDetailsAddShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/applicationDetails")
                .param("actionMapping", "add")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyApplicationDetailsAddShouldAllowProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/applicationDetails")
                .param("actionMapping", "add")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void applicationDetailsRpcShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/rpc/application-details/document-details")).andExpect(status().isUnauthorized());
  }

  @Test
  void applicationDetailsRpcShouldAllowCanonicalReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/rpc/application-details/document-details")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void exemptionDetailsRpcShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/rpc/exemption-details/applications")).andExpect(status().isUnauthorized());
  }

  @Test
  void exemptionDetailsRpcShouldAllowCanonicalExemptionApproverRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/rpc/exemption-details/applications")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyOfferDetailsRpcShouldRequireAuthentication() throws Exception {
    mockMvc
        .perform(get("/api/lexis/offerDetailsRPC").param("actionMapping", "getApplicationVolume"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void legacyOfferDetailsRpcShouldAllowIndustryRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/offerDetailsRPC")
                .param("actionMapping", "getApplicationVolume")
                .param("applicationNumber", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isOk());
  }

  @Test
  void legacyOfferDetailsRpcShouldRejectLegacyIndustryAlias() throws Exception {
    mockMvc.perform(
            get("/api/lexis/offerDetailsRPC")
                .param("actionMapping", "getApplicationVolume")
                .param("applicationNumber", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("INDUSTRY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyOfferDetailsRpcShouldAllowClientLookupAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/offerDetailsRPC")
                .param("actionMapping", "getClientLocations")
                .param("clientNumber", "77881")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyExemptionDetailsRpcShouldAllowClientLookupAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/exemptionDetailsRPC")
                .param("actionMapping", "getClientLocations")
                .param("clientNumber", "77881")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowClientLookupAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "getClientLocations")
                .param("clientNumber", "77881")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowCodeListAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "getSpeciesCodes")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowSpeciesEndUseAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "getSpeciesForApplication")
                .param("applicationNumber", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowEndUseForSpeciesRegionAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "getEndUseForSpeciesRegion")
                .param("speciesJSON", "[\"FI\",\"HE\"]")
                .param("region", "11")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowRemainingSpeciesAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "getRemainingSpecies")
                .param("speciesJSON", "[\"FI\"]")
                .param("region", "11")
                .param("productType", "S")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowPermitLookupAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "findPermit")
                .param("applicationNumber", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowPackageScaleLookupAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "getScalesForPackage")
                .param("packageNumber", "PKG-903")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowReadOnlyPackageDetailsAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "getPackageDetails")
                .param("packageNumber", "PKG-903")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowDeleteScaleAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "deleteScaleById")
                .param("scaleId", "55")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcDeleteScaleShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "deleteScaleById")
                .param("scaleId", "55")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyApplicationDetailsRpcShouldAllowDeletePackageAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "deletePackageById")
                .param("packageNumber", "PKG-903")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcDeletePackageShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "deletePackageById")
                .param("packageNumber", "PKG-903")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void modernApplicationDetailsWriteShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/application-details/application")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyExemptionDetailsRpcShouldAllowApproveExemptionsAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/exemptionDetailsRPC")
                .param("actionMapping", "approveExemptions")
                .param("exemptionNumbers", "EX-205")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyOfferDetailsAddShouldAllowProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/offerDetails")
                .param("actionMapping", "add")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyPermitDetailsRpcShouldAllowReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/permitDetailsRPC")
                .param("actionMapping", "getPackageList")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyPermitDetailsRpcShouldAllowCountryListAction() throws Exception {
    mockMvc.perform(
            post("/api/lexis/permitDetailsRPC")
                .param("actionMapping", "getCountryList")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyPermitDetailsRpcWriteActionShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/permitDetailsRPC")
                .param("actionMapping", "updateShipping")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyPermitDetailsRpcWriteActionShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/permitDetailsRPC")
                .param("actionMapping", "updateShipping")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyPermitDetailsRpcWriteActionShouldAllowProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/permitDetailsRPC")
                .param("actionMapping", "updateShipping")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernPermitDetailsWriteActionShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/update-shipping")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyPermitDetailsAddShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/permitDetails")
                .param("actionMapping", "add")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyPermitDetailsAddShouldAllowProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/permitDetails")
                .param("actionMapping", "add")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyIndianReservePermitCreateShouldAllowApplicationApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/indianReservePermitDetails")
                .param("actionMapping", "saveReservePermit")
                .param("permitNumber", "111")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernIndianReservePermitCreateShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/indian-reserve/permits")
                .param("permitNumber", "111")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyExemptionDetailsCreateShouldAllowExemptionApproverRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/exemptionDetails")
                .param("actionMapping", "create")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void applicationReviewSearchShouldRejectIndustryRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/application-reviews/search")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void applicationReviewApproveShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/application-reviews/1000123/approve")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void applicationReviewApproveShouldRejectLegacyApproverAlias() throws Exception {
    mockMvc.perform(
            post("/api/lexis/application-reviews/1000123/approve")
                .with(jwt().authorities(new SimpleGrantedAuthority("APPLICATION_APPROVER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyApplicationReviewApproveShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationsReview.do")
                .param("actionMapping", "approve")
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationReviewApproveShouldRejectIndustryRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationsReview.do")
                .param("actionMapping", "approve")
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyAgentAdminShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/lexisAgentAdmin.do")
                .param("actionMapping", "view")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyAgentAdminShouldAllowAdminRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/lexisAgentAdmin.do")
                .param("actionMapping", "view")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().is2xxSuccessful());
  }

  @Test
  void legacyPolicyAdminRpcShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/lexisPolicyAdminRPC")
                .param("actionMapping", "view")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyPolicyAdminRpcShouldAllowAdminRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/lexisPolicyAdminRPC")
                .param("actionMapping", "view")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().is2xxSuccessful());
  }

  @Test
  void modernFeePoliciesShouldAllowAdminRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/admin/policies/fee")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().is2xxSuccessful());
  }

  @Test
  void modernFeePoliciesShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/admin/policies/fee")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyFilAdminRpcShouldAllowAdminRoleForDoRoute() throws Exception {
    mockMvc.perform(
            get("/api/lexis/lexisFILAdminRPC.do")
                .param("actionMapping", "view")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().is2xxSuccessful());
  }

  @Test
  void modernFilPoliciesShouldAllowAdminRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/admin/policies/fil")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().is2xxSuccessful());
  }

  @Test
  void adminApplicationUploadShouldAllowAdminRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/applications")
                .file(file)
                .param("applicationNumber", "1000123")
                .param("fileDescription", "Application evidence")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk());
  }

  @Test
  void adminPermitUploadShouldRejectReadOnlyRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "permit.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/permits")
                .file(file)
                .param("permitNumber", "7000123")
                .param("fileDescription", "Permit document")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void lexisXmlUploadShouldAllowCreateApplicationRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/lexis-xml")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void lexisXmlUploadShouldRejectReadOnlyRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/lexis-xml")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void sessionWelcomeShouldUseTokenAuthoritiesForRoleResolution() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/welcome")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isOk());
  }

  @Test
  void sessionCanPerformActionShouldEvaluateTokenAuthorities() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/summary")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_FEDERAL_SUBMITTER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(true));
  }

  @Test
  void sessionCanPerformActionShouldAllowCreateExemptionForProvincialSubmitter() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/createExemption")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(true));
  }

  @Test
  void sessionCanPerformActionShouldRejectCreateExemptionForReadOnly() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/createExemption")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(false));
  }

  @Test
  void sessionCanPerformActionShouldAllowApproveExemptionForExemptionApprover() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "approveExemption")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(true));
  }

  @Test
  void legacySummaryRouteShouldAllowPostForIndustryRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/summary")
                .param("actionMapping", "getApplications")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyReportRouteShouldRejectAnonymousRequests() throws Exception {
    mockMvc
        .perform(
            post("/api/lexis/offerReport")
                .param("actionMapping", "generate")
                .param("outputFormat", "CSV")
                .with(csrf()))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void reportOptionsShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/reports/options")).andExpect(status().isUnauthorized());
  }

  @Test
  void reportOptionsShouldAllowKnownRoleWithoutTeacReportGrant() throws Exception {
    mockMvc.perform(
            get("/api/lexis/reports/options")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyReportRouteShouldAllowAdminRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/offerReport")
                .param("actionMapping", "generate")
                .param("outputFormat", "CSV")
                .param("fromDate", "2026-01-01")
                .param("toDate", "2026-01-31")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk());
  }

  @Test
  void legacyReportRouteShouldAllowViewWithAdminRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/offerReport.do")
                .param("actionMapping", "view")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyReportRouteShouldAllowReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/offerReport")
                .param("actionMapping", "generate")
                .param("outputFormat", "CSV")
                .param("fromDate", "2026-01-01")
                .param("toDate", "2026-01-31")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk());
  }

  @Test
  void legacyOfferReportShouldRejectProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/offerReport")
                .param("actionMapping", "generate")
                .param("outputFormat", "CSV")
                .param("fromDate", "2026-01-01")
                .param("toDate", "2026-01-31")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyBiweeklyListingShouldAllowProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/biweeklyListing")
                .param("actionMapping", "generate")
                .param("outputFormat", "CSV")
                .param("fromDate", "2026-01-01")
                .param("toDate", "2026-01-31")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isOk());
  }
}

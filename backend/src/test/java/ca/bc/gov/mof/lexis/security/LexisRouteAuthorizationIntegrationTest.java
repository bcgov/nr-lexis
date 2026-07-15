package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@SpringBootTest(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito-idp.ca-central-1.amazonaws.com/test",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json",
      "ALLOWED_ORIGINS=http://localhost:3000"
    })
@AutoConfigureMockMvc
class LexisRouteAuthorizationIntegrationTest {

  private static final Pattern PATH_VARIABLE_PATTERN = Pattern.compile("\\{[^/]+}");
  private static final Pattern ACTION_MAPPING_PARAM_PATTERN =
      Pattern.compile("actionMapping=([^,\\]]+)");
  private static final Map<String, String> SAMPLE_PATH_VARIABLES =
      Map.of(
          "applicationNumber", "1000123",
          "exemptionNumber", "EX-100",
          "offerNumber", "3000123",
          "permitNumber", "7000123",
          "exportScheduleId", "1001",
          "policyId", "123");

  @Autowired private MockMvc mockMvc;

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  private RequestMappingHandlerMapping handlerMapping;

  @Test
  @DisplayName("Every Lexis controller endpoint has an explicit authorization rule")
  void everyLexisControllerEndpointShouldHaveExplicitAuthorizationRule() {
    List<EndpointAuthorizationLookup> lookups =
        handlerMapping.getHandlerMethods().entrySet().stream()
            .filter(entry -> isLexisController(entry.getValue().getBeanType()))
            .flatMap(
                entry ->
                    authorizationLookups(entry.getKey()).stream()
                        .map(lookup -> lookup.withHandler(entry.getValue().toString())))
            .toList();

    assertThat(lookups.stream().filter(lookup -> lookup.actionMapping() != null).count())
        .isGreaterThan(40);

    List<String> uncoveredMappings =
        lookups.stream()
            .filter(
                lookup ->
                    LexisApiAuthorizationRules.findRule(
                            lookup.method(), lookup.path(), lookup.actionMapping())
                        .isEmpty())
            .map(EndpointAuthorizationLookup::description)
            .sorted()
            .toList();

    assertThat(uncoveredMappings).isEmpty();
  }

  @Test
  @DisplayName("Known modern and legacy entry points resolve to expected authorization actions")
  void knownModernAndLegacyEntryPointsShouldResolveExpectedActions() {
    List.of(
            expected(HttpMethod.GET, "/api/lexis/applications/search", null, "/applicationSearch"),
            expected(HttpMethod.GET, "/api/lexis/applicationSearch.do", "view", "/applicationSearch"),
            expected(HttpMethod.GET, "/api/lexis/federal/applications/search", null, "/federalApplicationSearch"),
            expected(HttpMethod.GET, "/api/lexis/federal/applications/9001", null, "/federalApplicationDetails"),
            expected(HttpMethod.POST, "/api/lexis/application-submissions", null, "uploadApplicationSubmission"),
            expected(
                HttpMethod.POST,
                "/api/lexis/application-submissions/validation",
                null,
                "uploadApplicationSubmission"),
            expected(HttpMethod.POST, "/api/lexis/federal/submissions", null, "uploadFederalSubmission"),
            expected(
                HttpMethod.POST,
                "/api/lexis/federal/submissions/validation",
                null,
                "uploadFederalSubmission"),
            expected(
                HttpMethod.POST,
                "/api/lexis/applicationDetailsRPC.do",
                "getDocument",
                "/applicationDetails"),
            expected(
                HttpMethod.POST,
                "/api/lexis/applicationDetailsRPC.do",
                "removeDocument",
                "/fileApplicationUpload"),
            expected(
                HttpMethod.POST,
                "/api/lexis/permitDetailsRPC.do",
                "getCountryList",
                "/permitDetails"),
            expected(
                HttpMethod.POST,
                "/api/lexis/permitDetailsRPC.do",
                "updateShipping",
                "savePermit"),
            expected(HttpMethod.POST, "/api/lexis/lexisPolicyAdminRPC.do", null, "/lexisPolicyAdmin"),
            expected(HttpMethod.POST, "/api/lexis/lexisFILAdminRPC.do", null, "/lexisFILAdmin"),
            expected(HttpMethod.GET, "/api/lexis/offerReport.do", "view", "/offerReport"),
            expected(HttpMethod.POST, "/api/lexis/reports/biweeklyListing", null, "mofrListing"))
        .forEach(ExpectedAuthorizationRoute::assertResolved);

    assertThat(
            LexisApiAuthorizationRules.findRule(
                HttpMethod.GET, "/api/lexis/biweeklyListing.do", "generateIndustryPDF"))
        .isEmpty();
  }

  @Test
  void applicationsSearchShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/applications/search")).andExpect(status().isUnauthorized());
  }

  @Test
  void protectedRoutesShouldRejectAnonymousGetPostPutAndDeleteRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/applications/search")).andExpect(status().isUnauthorized());
    mockMvc
        .perform(post("/api/lexis/rpc/application-details/application").with(csrf()))
        .andExpect(status().isUnauthorized());
    mockMvc
        .perform(put("/api/lexis/admin/policies/fee/123").with(csrf()))
        .andExpect(status().isUnauthorized());
    mockMvc
        .perform(delete("/api/lexis/rpc/application-details/package").with(csrf()))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void actuatorShouldRequireAuthenticationAndAdminAuthorization() throws Exception {
    mockMvc.perform(get("/actuator/health")).andExpect(status().isUnauthorized());

    mockMvc
        .perform(
            get("/actuator/health")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
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
  void legacyAccessDeniedForwardShouldRejectAnonymousRequests() throws Exception {
    mockMvc
        .perform(get("/api/lexis/accessDenied.do"))
        .andExpect(status().isUnauthorized());
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
  void retiredLegacyMenuRoutesShouldRejectEvenAdminUsers() throws Exception {
    SimpleGrantedAuthority admin = new SimpleGrantedAuthority("LEXIS_ADMIN");

    mockMvc
        .perform(
            get("/api/lexis/indianReservePermitDetails.do")
                .param("actionMapping", "add")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            get("/api/lexis/indianReservePermitSearch.do")
                .param("actionMapping", "view")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            get("/api/lexis/biweeklyListing.do")
                .param("actionMapping", "generateIndustryPDF")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            get("/api/lexis/biweeklyListing.do")
                .param("actionMapping", "generateIndustryCSV")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());
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
  void federalApplicationSearchShouldAllowReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/federal/applications/search")
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
  void legacyOfferDetailsRpcShouldRejectOfferMutationWithoutCreateOfferGrant() throws Exception {
    mockMvc.perform(
            post("/api/lexis/offerDetailsRPC")
                .param("actionMapping", "addOffer")
                .param("applicationNumber", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
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
  void legacyExemptionDetailsRpcReadActionShouldAllowReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/exemptionDetailsRPC")
                .param("actionMapping", "getApplications")
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyExemptionDetailsRpcSaveActionShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/exemptionDetailsRPC")
                .param("actionMapping", "addExemption")
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyExemptionDetailsRpcApprovalActionShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/exemptionDetailsRPC")
                .param("actionMapping", "sendExemptionApprovalEmail")
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
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
  void legacyApplicationDetailsRpcRemarkShouldRequireApplicationRemarksGrant() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "persistRemark")
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyApplicationDetailsRpcRemarkShouldAllowApplicationApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "persistRemark")
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyApplicationDetailsRpcWithdrawnEmailShouldRequireReviewGrant() throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "sendApplWithdrawnEmail")
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyApplicationDetailsRpcWithdrawnEmailShouldAllowApplicationApproverRole()
      throws Exception {
    mockMvc.perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "sendApplWithdrawnEmail")
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernApplicationDetailsWriteShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/application-details/application")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void readOnlyRoleShouldRejectRepresentativeMutationRoutes() throws Exception {
    SimpleGrantedAuthority readOnly = new SimpleGrantedAuthority("LEXIS_READ_ONLY");

    mockMvc
        .perform(
            post("/api/lexis/rpc/application-details/application-summary")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/rpc/application-details/package")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/rpc/application-details/package-scale")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            delete("/api/lexis/rpc/application-details/scale")
                .param("scaleId", "55")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/rpc/exemption-details/exemption")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/rpc/exemption-details/approve-exemptions")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            delete("/api/lexis/rpc/exemption-details/document")
                .param("documentId", "55")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/rpc/offer-details/offer")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/rpc/permit-details/update-shipping")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/application-reviews/1000123/approve")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            post("/api/lexis/applicationDetailsRPC")
                .param("actionMapping", "sendApplRejectEmail")
                .param("applicationNumber", "1000123")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            put("/api/lexis/admin/policies/fee/123")
                .with(csrf())
                .with(jwt().authorities(readOnly)))
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
  void legacyOfferDetailsAddShouldRejectProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/offerDetails")
                .param("actionMapping", "add")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
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
  void legacyPermitDetailsRpcWriteActionShouldRejectProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/permitDetailsRPC")
                .param("actionMapping", "updateShipping")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
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
  void modernPermitDetailsWriteActionShouldRejectProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/update-permit")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void modernPermitDetailsWriteActionShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/update-permit")
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernPermitScaleAttachmentShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/update-scale-attachment")
                .param("permitNumber", "7000123")
                .param("scaleId", "101")
                .param("attachInd", "true")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernPermitApplicationAddShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/add-applications-to-permit")
                .param("permitNumber", "7000123")
                .param("selectedApplications", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernPermitApplicationRemoveShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/remove-application-from-permit")
                .param("permitNumber", "7000123")
                .param("applicationNumber", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernPermitBlanketOicScaleAddShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/add-boic-scale")
                .param("permitNumber", "7000123")
                .param("packageNumber", "PKG-903")
                .param("timberMark", "TM1")
                .param("scaleVolume", "12.5")
                .param("scalePieces", "7")
                .param("speciesCode", "HE")
                .param("gradeCode", "A")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void modernPermitBlanketOicScaleDeleteShouldAllowCanonicalApproverRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/rpc/permit-details/delete-boic-scale")
                .param("permitNumber", "7000123")
                .param("scaleId", "101")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
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
  void legacyPermitDetailsAddShouldRejectProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/permitDetails")
                .param("actionMapping", "add")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
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
  void famUserAccessLookupShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/admin/fam-users").param("search", "smith"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void famUserAccessLookupShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/admin/fam-users")
                .param("search", "smith")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void famUserAccessLookupShouldRejectDelegatedAdminRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/admin/fam-users")
                .param("search", "smith")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_DELEGATED_ADMIN"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void famUserAccessLookupShouldAllowLexisAdminRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/admin/fam-users")
                .param("search", "smith")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.configured").value(false));
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
  void modernExportSchedulesShouldAllowPolicyAdminMutationsForAdminRole() throws Exception {
    mockMvc.perform(
            put("/api/lexis/admin/schedules/1001")
                .with(csrf())
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().is2xxSuccessful());

    mockMvc.perform(
            delete("/api/lexis/admin/schedules/1001")
                .with(csrf())
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().is2xxSuccessful());
  }

  @Test
  void modernExportSchedulesShouldRejectReadOnlyMutations() throws Exception {
    mockMvc.perform(
            put("/api/lexis/admin/schedules/1001")
                .with(csrf())
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());

    mockMvc.perform(
            delete("/api/lexis/admin/schedules/1001")
                .with(csrf())
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
  void adminApplicationUploadShouldRejectScopedProvincialSubmitterRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/applications")
                .file(file)
                .param("applicationNumber", "1000123")
                .param("fileDescription", "Application evidence")
                .with(
                    jwt()
                        .authorities(
                            new SimpleGrantedAuthority(
                                "LEXIS_PROVINCIAL_SUBMITTER_00012345"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void adminApplicationUploadValidationShouldAllowAdminRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/applications/validation")
                .file(file)
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk());
  }

  @Test
  void adminApplicationUploadValidationShouldRejectReadOnlyRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/applications/validation")
                .file(file)
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void adminPermitUploadValidationShouldAllowAdminRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "permit.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/permits/validation")
                .file(file)
                .param("permitNumber", "7000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk());
  }

  @Test
  void adminExemptionUploadValidationShouldAllowAdminRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "exemption.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/exemptions/validation")
                .file(file)
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk());
  }

  @Test
  void adminInvoiceUploadValidationShouldAllowAdminRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "invoice.pdf", "application/pdf", "content".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/invoices/validation")
                .file(file)
                .param("permitNumber", "7000123")
                .param("salesInvoiceNumber", "INV-100")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isOk());
  }

  @Test
  void adminDocumentUploadValidationShouldRejectReadOnlyRole() throws Exception {
    SimpleGrantedAuthority readOnly = new SimpleGrantedAuthority("LEXIS_READ_ONLY");

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/permits/validation")
                .file(new MockMultipartFile("formFile", "permit.pdf", "application/pdf", "content".getBytes()))
                .param("permitNumber", "7000123")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/exemptions/validation")
                .file(new MockMultipartFile("formFile", "exemption.pdf", "application/pdf", "content".getBytes()))
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/invoices/validation")
                .file(new MockMultipartFile("formFile", "invoice.pdf", "application/pdf", "content".getBytes()))
                .param("permitNumber", "7000123")
                .param("salesInvoiceNumber", "INV-100")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
  }

  @Test
  void adminDocumentUploadValidationShouldRejectScopedProvincialSubmitterRole()
      throws Exception {
    SimpleGrantedAuthority scopedSubmitter =
        new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER_00012345");

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/applications/validation")
                .file(new MockMultipartFile("formFile", "application.pdf", "application/pdf", "content".getBytes()))
                .param("applicationNumber", "1000123")
                .with(jwt().authorities(scopedSubmitter)))
        .andExpect(status().isForbidden());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/permits/validation")
                .file(new MockMultipartFile("formFile", "permit.pdf", "application/pdf", "content".getBytes()))
                .param("permitNumber", "7000123")
                .with(jwt().authorities(scopedSubmitter)))
        .andExpect(status().isForbidden());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/exemptions/validation")
                .file(new MockMultipartFile("formFile", "exemption.pdf", "application/pdf", "content".getBytes()))
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(scopedSubmitter)))
        .andExpect(status().isForbidden());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/invoices/validation")
                .file(new MockMultipartFile("formFile", "invoice.pdf", "application/pdf", "content".getBytes()))
                .param("permitNumber", "7000123")
                .param("salesInvoiceNumber", "INV-100")
                .with(jwt().authorities(scopedSubmitter)))
        .andExpect(status().isForbidden());
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
  void applicationSubmissionUploadShouldAllowProvincialSubmitterRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void applicationSubmissionUploadShouldAllowAdminRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void legacyApplicationSubmissionUploadAliasShouldAllowCreateApplicationRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/admin/uploads/lexis-xml")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void applicationSubmissionUploadShouldRejectReadOnlyRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void applicationSubmissionUploadShouldRejectUnknownRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_UNKNOWN_ROLE"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectUnknownRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions")
                .param("userReference", "FED-REF-1")
                .param("originalFileName", "federal-submission.xml")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_UNKNOWN_ROLE"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectAdminRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions")
                .param("userReference", "FED-REF-1")
                .param("originalFileName", "federal-submission.xml")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionUploadShouldAllowFederalUploadScope() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions")
                .param("userReference", "FED-REF-1")
                .param("originalFileName", "federal-submission.xml")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectDraftFederalUploadScopeAlias() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions")
                .param("userReference", "FED-REF-1")
                .param("originalFileName", "federal-submission.xml")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(federalUploadDraftScopeJwt()))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionValidationShouldAcceptSoapXmlWithFederalUploadScope() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .param("originalFileName", "federal-soap-submission.xml")
                .contentType("application/soap+xml")
                .content(soapEnvelopeWithSubmissionData(xmlTextEscape(esfWrappedFederalLexisXml())))
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.payloadRootType").value("soap-envelope:escaped-esf-submission"))
        .andExpect(jsonPath("$.submissionSummary.jurisdictionCode").value("F"))
        .andExpect(jsonPath("$.submissionSummary.federalApplicationNumber").value(700123));
  }

  @Test
  void federalApplicationReadbackShouldRejectFederalUploadScope() throws Exception {
    mockMvc.perform(
            get("/api/lexis/federal/applications/9001")
                .with(federalUploadScopeJwt()))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationReadbackShouldRejectUnknownRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/federal/applications/9001")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_UNKNOWN_ROLE"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationReadbackShouldAllowReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/federal/applications/9001")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void federalApplicationPermitReadbackShouldRejectUnknownRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/federal/applications/9001/permit")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_UNKNOWN_ROLE"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationPermitReadbackShouldAllowReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/federal/applications/9001/permit")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectUnknownRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("file", "federal-submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/federal/submissions")
                .file(file)
                .param("userReference", "FED-REF-1")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_UNKNOWN_ROLE"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void applicationSubmissionUploadShouldRejectFederalUploadScope() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions")
                .file(file)
                .with(federalUploadScopeJwt()))
        .andExpect(status().isForbidden());
  }

  @Test
  void applicationSubmissionValidationShouldRejectFederalUploadScope() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions/validation")
                .file(file)
                .with(federalUploadScopeJwt()))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void applicationSubmissionValidationShouldAllowProvincialSubmitterRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions/validation")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectUnknownRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_UNKNOWN_ROLE"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectAdminRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionValidationShouldAllowFederalUploadScope() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectDraftFederalUploadScopeAlias() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_XML)
                .content("<xml />")
                .with(federalUploadDraftScopeJwt()))
        .andExpect(status().isForbidden());
  }

  @Test
  void federalApplicationSubmissionValidationShouldAcceptTextPlainXmlForCompatibility() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.TEXT_PLAIN)
                .content(bareFederalLexisXml())
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.status").value("rejected"))
        .andExpect(jsonPath("$.errors[0]").value("Application validation is unavailable for LEXIS application submission."))
        .andExpect(jsonPath("$.submissionSummary.jurisdictionCode").value("F"))
        .andExpect(jsonPath("$.submissionSummary.federalApplicationNumber").value(700123));
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectJsonContentTypeBeforeParsing() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(bareFederalLexisXml())
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnsupportedMediaType());
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectFormUrlEncodedPayload() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions")
                .param("userReference", "FED-REF-1")
                .param("xml", bareFederalLexisXml())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .with(federalUploadScopeJwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0]").value("Federal submission endpoint only accepts XML payloads."));
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectFormUrlEncodedPayload() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .param("xml", bareFederalLexisXml())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .with(federalUploadScopeJwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0]").value("Federal submission endpoint only accepts XML payloads."));
  }

  @Test
  void federalApplicationSubmissionValidationShouldParseEsfWrappedFederalPayload() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_XML)
                .content(esfWrappedFederalLexisXml())
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.status").value("rejected"))
        .andExpect(jsonPath("$.errors[0]").value("Application validation is unavailable for LEXIS application submission."))
        .andExpect(jsonPath("$.submissionSummary.jurisdictionCode").value("F"))
        .andExpect(jsonPath("$.submissionSummary.federalApplicationNumber").value(700123))
        .andExpect(jsonPath("$.submissionSummary.packageNumber").value("FED26-700123"));
  }

  @Test
  void federalApplicationSubmissionValidationShouldParseBareFederalPayload() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_XML)
                .content(bareFederalLexisXml())
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.status").value("rejected"))
        .andExpect(jsonPath("$.errors[0]").value("Application validation is unavailable for LEXIS application submission."))
        .andExpect(jsonPath("$.submissionSummary.jurisdictionCode").value("F"))
        .andExpect(jsonPath("$.submissionSummary.federalApplicationNumber").value(700123))
        .andExpect(jsonPath("$.submissionSummary.packageNumber").value("FED26-700123"));
  }

  @Test
  void federalApplicationSubmissionMultipartValidationShouldAllowFederalUploadScope()
      throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("file", "federal-submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/federal/submissions/validation")
                .file(file)
                .param("userReference", "FED-REF-1")
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectProvincialPayload() throws Exception {
    mockMvc.perform(
            post("/api/lexis/federal/submissions/validation")
                .param("userReference", "FED-REF-1")
                .contentType(MediaType.APPLICATION_XML)
                .content(esfWrappedProvincialLexisXml())
                .with(federalUploadScopeJwt()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.status").value("rejected"))
        .andExpect(
            jsonPath("$.errors[0]")
                .value(
                    "Federal submission endpoint only accepts jurisdictionCode=F. Provincial applications must use the modern provincial upload path."))
        .andExpect(jsonPath("$.submissionSummary.jurisdictionCode").value("P"))
        .andExpect(jsonPath("$.submissionSummary.packageNumber").value("PROV26-700123"));
  }

  @Test
  void applicationSubmissionValidationShouldAllowAdminRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions/validation")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"))))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void applicationSubmissionValidationShouldRejectReadOnlyRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions/validation")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void applicationSubmissionValidationShouldRejectUnknownRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions/validation")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_UNKNOWN_ROLE"))))
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
                .param("action", "uploadApplicationSubmission")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(true));
  }

  @Test
  void sessionCanPerformActionShouldAllowFederalReadForReadOnly() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/federalApplicationSearch")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(true));
  }

  @Test
  void sessionCanPerformActionShouldRejectCreateExemptionForProvincialSubmitter() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/createExemption")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(false));
  }

  @Test
  void sessionCanPerformActionShouldRejectDocumentUploadsForProvincialSubmitter()
      throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/fileApplicationUpload")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(false));
  }

  @Test
  void sessionCanPerformActionShouldRejectDocumentUploadsForScopedProvincialSubmitter()
      throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/filePermitUpload")
                .with(
                    jwt()
                        .authorities(
                            new SimpleGrantedAuthority(
                                "LEXIS_PROVINCIAL_SUBMITTER_00012345"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.granted").value(false));
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
  void legacySummaryRouteShouldRejectIndustryRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/summary")
                .param("actionMapping", "getApplications")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
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
  void legacyReportRouteShouldRejectReadOnlyRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/offerReport")
                .param("actionMapping", "generate")
                .param("outputFormat", "CSV")
                .param("fromDate", "2026-01-01")
                .param("toDate", "2026-01-31")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
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
  void legacyBiweeklyListingShouldRejectProvincialSubmitterRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/biweeklyListing")
                .param("actionMapping", "generate")
                .param("outputFormat", "CSV")
                .param("fromDate", "2026-01-01")
                .param("toDate", "2026-01-31")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER"))))
        .andExpect(status().isForbidden());
  }

  private static boolean isLexisController(Class<?> beanType) {
    return beanType.getPackageName().equals("ca.bc.gov.mof.lexis.controller")
        && beanType.getSimpleName().endsWith("Controller");
  }

  private static List<EndpointAuthorizationLookup> authorizationLookups(RequestMappingInfo info) {
    String actionMapping = actionMapping(info);
    return paths(info).stream()
        .flatMap(
            path ->
                methods(info).stream()
                    .map(
                        method ->
                            new EndpointAuthorizationLookup(
                                httpMethod(method), samplePath(path), actionMapping, null)))
        .toList();
  }

  private static Set<String> paths(RequestMappingInfo info) {
    if (info.getPathPatternsCondition() != null) {
      return info.getPathPatternsCondition().getPatternValues();
    }
    if (info.getPatternsCondition() != null) {
      return info.getPatternsCondition().getPatterns();
    }
    return Set.of();
  }

  private static Set<RequestMethod> methods(RequestMappingInfo info) {
    return info.getMethodsCondition().getMethods();
  }

  private static HttpMethod httpMethod(RequestMethod method) {
    return HttpMethod.valueOf(method.name());
  }

  private static String actionMapping(RequestMappingInfo info) {
    return info.getParamsCondition().getExpressions().stream()
        .map(Object::toString)
        .map(ACTION_MAPPING_PARAM_PATTERN::matcher)
        .filter(matcher -> matcher.find())
        .map(matcher -> matcher.group(1))
        .findFirst()
        .orElse(null);
  }

  private static String samplePath(String pattern) {
    String path = pattern;
    for (Map.Entry<String, String> sample : SAMPLE_PATH_VARIABLES.entrySet()) {
      path = path.replace("{" + sample.getKey() + "}", sample.getValue());
    }
    return PATH_VARIABLE_PATTERN.matcher(path).replaceAll("1");
  }

  private static RequestPostProcessor federalUploadScopeJwt() {
    return federalUploadScopeJwt("nexcol-service-client");
  }

  private static RequestPostProcessor federalUploadScopeJwt(String clientId) {
    return jwt()
        .jwt(
            token ->
                token
                    .claim("client_id", clientId)
                    .claim("scope", "lexis:federal-submission:submit"))
        .authorities(new SimpleGrantedAuthority("SCOPE_lexis:federal-submission:submit"));
  }

  private static RequestPostProcessor federalUploadDraftScopeJwt() {
    return jwt()
        .jwt(
            token ->
                token
                    .claim("client_id", "nexcol-service-client")
                    .claim("scope", "lexis/federalSubmission/submit"))
        .authorities(new SimpleGrantedAuthority("SCOPE_lexis/federalSubmission/submit"));
  }

  private static String esfWrappedFederalLexisXml() {
    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <esf:ESFSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/esf http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
          <esf:submissionContent>
            %s
          </esf:submissionContent>
        </esf:ESFSubmission>
        """
        .formatted(
            lexisSubmissionXml(
                "F",
                federalOfficeUseXml(),
                "FED26-700123"));
  }

  private static String soapEnvelopeWithSubmissionData(String submissionData) {
    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
          <soapenv:Body>
            <sub:makeSubmission xmlns:sub="http://submissions.ws.esf.mof.gov.bc.ca">
              <submissionType>LEXIS</submissionType>
              <userReference>FED-REF-1</userReference>
              <submissionData>%s</submissionData>
            </sub:makeSubmission>
          </soapenv:Body>
        </soapenv:Envelope>
        """
        .formatted(submissionData);
  }

  private static String xmlTextEscape(String value) {
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  private static String bareFederalLexisXml() {
    return lexisSubmissionXml("F", federalOfficeUseXml(), "FED26-700123");
  }

  private static String esfWrappedProvincialLexisXml() {
    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <esf:ESFSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/esf http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
          <esf:submissionContent>
            %s
          </esf:submissionContent>
        </esf:ESFSubmission>
        """
        .formatted(lexisSubmissionXml("P", "", "PROV26-700123"));
  }

  private static String lexisSubmissionXml(
      String jurisdictionCode, String federalOfficeUseElement, String packageNumber) {
    return """
        <lexis:LexisSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
          <lexis:applicant>
            <lexis:applicantDetails>
              <lexis:eicbNumber>123456</lexis:eicbNumber>
              <lexis:clientNumber>99887766</lexis:clientNumber>
              <lexis:clientLocnCode>99</lexis:clientLocnCode>
              <lexis:name>Sample Federal Applicant Ltd.</lexis:name>
              <lexis:address>555 Government Street</lexis:address>
              <lexis:city>Vancouver</lexis:city>
              <lexis:provinceState>BC</lexis:provinceState>
              <lexis:postalZipCode>V8V8V8</lexis:postalZipCode>
              <lexis:country>CA</lexis:country>
              <lexis:telephoneNumber>2505551212</lexis:telephoneNumber>
            </lexis:applicantDetails>
            <lexis:applicantContact>
              <lexis:contactSurname>SAMPLE</lexis:contactSurname>
              <lexis:contactFirstname>CONTACT</lexis:contactFirstname>
              <lexis:contactTelephoneNumber>2505551212</lexis:contactTelephoneNumber>
            </lexis:applicantContact>
            <lexis:declarationCanadianResident>true</lexis:declarationCanadianResident>
            <lexis:declarationSubmittedOffersPast90Days>false</lexis:declarationSubmittedOffersPast90Days>
          </lexis:applicant>
          <lexis:applicationDetail>
            <lexis:jurisdictionCode>%s</lexis:jurisdictionCode>
            <lexis:bcForestRegionCode>RSC</lexis:bcForestRegionCode>
            <lexis:applStatusCode>A</lexis:applStatusCode>
            <lexis:exemptionRsnCde>S</lexis:exemptionRsnCde>
            <lexis:applicantTypeCode>O</lexis:applicantTypeCode>
            <lexis:re-advertisement>false</lexis:re-advertisement>
            %s
          </lexis:applicationDetail>
          <lexis:productDetail>
            <lexis:productTypeCode>H</lexis:productTypeCode>
            <lexis:boomNumber>%s</lexis:boomNumber>
            <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
            <lexis:productLocation>Generic Federal Sample Location</lexis:productLocation>
            <lexis:ageClass>S</lexis:ageClass>
            <lexis:avgLength>6.7</lexis:avgLength>
            <lexis:avgDiameter>12.8</lexis:avgDiameter>
            <lexis:harvestedTimber>
              <lexis:timberMark>ZZ999</lexis:timberMark>
              <lexis:numberOfPieces>321</lexis:numberOfPieces>
              <lexis:species>HE</lexis:species>
              <lexis:grade>H</lexis:grade>
              <lexis:quantityVolume>123</lexis:quantityVolume>
            </lexis:harvestedTimber>
          </lexis:productDetail>
        </lexis:LexisSubmission>
        """
        .formatted(jurisdictionCode, federalOfficeUseElement, packageNumber);
  }

  private static String federalOfficeUseXml() {
    return """
        <lexis:officeUseOnly>
          <lexis:internalOfficeUseRefId>700123</lexis:internalOfficeUseRefId>
          <lexis:internalOfficeUseApplicationDate>2026-01-10</lexis:internalOfficeUseApplicationDate>
          <lexis:internalOfficeUseBiWeeklyListDate>2026-01-16</lexis:internalOfficeUseBiWeeklyListDate>
          <lexis:internalOfficeUseApplicantUserid>NEXCOL</lexis:internalOfficeUseApplicantUserid>
          <lexis:internalOfficeUseLanguage>E</lexis:internalOfficeUseLanguage>
        </lexis:officeUseOnly>
        """;
  }

  private record EndpointAuthorizationLookup(
      HttpMethod method, String path, String actionMapping, String handler) {
    EndpointAuthorizationLookup withHandler(String resolvedHandler) {
      return new EndpointAuthorizationLookup(method, path, actionMapping, resolvedHandler);
    }

    String description() {
      String params = actionMapping == null ? "" : "?actionMapping=" + actionMapping;
      return method + " " + path + params + " -> " + handler;
    }
  }

  private static ExpectedAuthorizationRoute expected(
      HttpMethod method, String path, String actionMapping, String requiredAction) {
    return new ExpectedAuthorizationRoute(method, path, actionMapping, requiredAction);
  }

  private record ExpectedAuthorizationRoute(
      HttpMethod method, String path, String actionMapping, String requiredAction) {

    void assertResolved() {
      var rule = LexisApiAuthorizationRules.findRule(method, path, actionMapping);
      assertThat(rule)
          .as("%s %s?actionMapping=%s", method, path, actionMapping)
          .isPresent();
      assertThat(rule.orElseThrow().requiredAction(actionMapping))
          .as("%s %s?actionMapping=%s", method, path, actionMapping)
          .isEqualTo(requiredAction);
    }
  }
}

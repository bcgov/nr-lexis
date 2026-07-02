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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
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
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_FEDERAL_SUBMITTER"))))
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
  void applicationSubmissionUploadShouldAllowFederalSubmitterRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_FEDERAL_SUBMITTER"))))
        .andExpect(status().isUnprocessableEntity());
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
  void applicationSubmissionValidationShouldAllowFederalSubmitterRole() throws Exception {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "submission.xml", "application/xml", "<xml />".getBytes());

    mockMvc.perform(
            multipart("/api/lexis/application-submissions/validation")
                .file(file)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_FEDERAL_SUBMITTER"))))
        .andExpect(status().isUnprocessableEntity());
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
                .param("action", "/federalApplicationSearch")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_FEDERAL_SUBMITTER"))))
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
}

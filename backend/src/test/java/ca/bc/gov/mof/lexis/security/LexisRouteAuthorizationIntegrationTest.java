package ca.bc.gov.mof.lexis.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "lexis.auth.cognito.enforce-route-auth=true"
    })
@AutoConfigureMockMvc
class LexisRouteAuthorizationIntegrationTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void applicationsSearchShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/applications/search")).andExpect(status().isForbidden());
  }

  @Test
  void applicationsSearchShouldAllowCanonicalReadOnlyRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/applications/search")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk());
  }

  @Test
  void applicationsSearchShouldAllowLegacyReadOnlyAliasDuringTransition() throws Exception {
    mockMvc.perform(
            get("/api/lexis/applications/search")
                .with(jwt().authorities(new SimpleGrantedAuthority("READ_ONLY"))))
        .andExpect(status().isOk());
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
  void applicationDetailsRpcShouldRejectAnonymousRequests() throws Exception {
    mockMvc.perform(get("/api/lexis/rpc/application-details/document-details")).andExpect(status().isForbidden());
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
    mockMvc.perform(get("/api/lexis/rpc/exemption-details/applications")).andExpect(status().isForbidden());
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
        .andExpect(status().isForbidden());
  }

  @Test
  void legacyOfferDetailsRpcShouldAllowIndustryRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/offerDetailsRPC")
                .param("actionMapping", "getApplicationVolume")
                .param("applicationNumber", "1000456")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_INDUSTRY"))))
        .andExpect(status().isOk());
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
  void applicationReviewSearchShouldRejectIndustryRole() throws Exception {
    mockMvc.perform(
            get("/api/lexis/application-reviews/search")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_INDUSTRY"))))
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
  void applicationReviewApproveShouldAllowLegacyApproverAliasDuringTransition() throws Exception {
    mockMvc.perform(
            post("/api/lexis/application-reviews/1000123/approve")
                .with(jwt().authorities(new SimpleGrantedAuthority("APPLICATION_APPROVER"))))
        .andExpect(status().isNoContent());
  }

  @Test
  void sessionWelcomeShouldUseTokenAuthoritiesForRoleResolution() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/welcome")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_INDUSTRY"))))
        .andExpect(status().isOk());
  }

  @Test
  void sessionCanPerformActionShouldEvaluateTokenAuthorities() throws Exception {
    mockMvc.perform(
            get("/api/lexis/session/canPerformAction")
                .param("action", "/summary")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_LOG_EXPORT_INDUSTRY"))))
        .andExpect(status().isOk());
  }

  @Test
  void legacySummaryRouteShouldAllowPostForIndustryRole() throws Exception {
    mockMvc.perform(
            post("/api/lexis/summary")
                .param("actionMapping", "getApplications")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_INDUSTRY"))))
        .andExpect(status().isNoContent());
  }
}

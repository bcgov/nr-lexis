package ca.bc.gov.mof.lexis.security;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.profiles.active=stub-reports,stub-services",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json",
      "ALLOWED_ORIGINS=http://localhost:3000",
      "LEXIS_PROD_RTM_ONLY=true"
    })
@AutoConfigureMockMvc
@DisplayName("Integration Test | PROD RTM-only authorization")
class LexisProdRtmOnlyAuthorizationIntegrationTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void prodRtmOnlyModeShouldExposeOnlyExactGetHealthProbes() throws Exception {
    SimpleGrantedAuthority admin = new SimpleGrantedAuthority("LEXIS_ADMIN");

    mockMvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
    mockMvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
    mockMvc.perform(get("/actuator/health")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/actuator/info")).andExpect(status().isUnauthorized());
    mockMvc
        .perform(get("/actuator/health/liveness/details"))
        .andExpect(status().isUnauthorized());
    mockMvc
        .perform(
            post("/actuator/health/liveness")
                .with(csrf())
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());
  }

  @Test
  void prodRtmOnlyModeShouldExposeRtmAmvTableAndRequiredSupportApisToAdmins()
      throws Exception {
    SimpleGrantedAuthority admin = new SimpleGrantedAuthority("LEXIS_ADMIN");
    String nextMonth =
        LexisBusinessTime.today().withDayOfMonth(1).plusMonths(1).toString();

    mockMvc
        .perform(get("/api/lexis/session/capabilities").with(jwt().authorities(admin)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.grantedActions").isArray())
        .andExpect(jsonPath("$.grantedActions.length()").value(1))
        .andExpect(jsonPath("$.grantedActions[0]").value("/lexisAgentAdmin"));

    mockMvc
        .perform(get("/api/lexis/rtm/emslogamv").with(jwt().authorities(admin)))
        .andExpect(status().isOk());

    mockMvc
        .perform(
            post("/api/lexis/rtm/emslogamv")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            post("/api/lexis/rtm/emslogamv/batch")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {
                      "values":[
                        {
                          "species":"BA",
                          "grade":"B",
                          "growthIndicator":"O",
                          "retrievalDate":"%s",
                          "updateDate":"%s",
                          "newValue":10.01,
                          "saveMode":"create"
                        }
                      ]
                    }
                    """.formatted(nextMonth, nextMonth))
                .with(jwt().authorities(admin)))
        .andExpect(status().isOk());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/preview")
                .with(jwt().authorities(admin)))
        .andExpect(status().isUnprocessableEntity());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/upload")
                .with(jwt().authorities(admin)))
        .andExpect(status().isUnprocessableEntity());

    mockMvc
        .perform(
            get("/api/lexis/rpc/application-details/species-codes")
                .with(jwt().authorities(admin)))
        .andExpect(status().is2xxSuccessful());

    mockMvc
        .perform(get("/api/lexis/applications/search").with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());
  }

  @Test
  void prodRtmOnlyModeShouldPreserveNormalReadOnlyAccess() throws Exception {
    SimpleGrantedAuthority readOnly = new SimpleGrantedAuthority("LEXIS_READ_ONLY");

    mockMvc
        .perform(get("/api/lexis/session/capabilities").with(jwt().authorities(readOnly)))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$.grantedActions")
                .value(
                    hasItems(
                        "/applicationSearch",
                        "/applicationDetails",
                        "/exemptionSearch",
                        "/permitDetails",
                        "/federalApplicationSearch",
                        "viewFederalApplication")))
        .andExpect(jsonPath("$.grantedActions").value(not(hasItem("/lexisAgentAdmin"))));

    mockMvc
        .perform(get("/api/lexis/applications/search").with(jwt().authorities(readOnly)))
        .andExpect(status().is2xxSuccessful());
    mockMvc
        .perform(
            get("/api/lexis/rpc/application-details/species-codes")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().is2xxSuccessful());
    mockMvc
        .perform(
            post("/api/lexis/exemptionDetailsRPC")
                .param("actionMapping", "getApplications")
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            post("/api/lexis/exemptionDetailsRPC")
                .param("actionMapping", "addExemption")
                .param("exemptionNumber", "EX-100")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
  }

  @Test
  void prodRtmOnlyModeShouldRejectOtherRolesAndKeepAdminPrecedence() throws Exception {
    SimpleGrantedAuthority admin = new SimpleGrantedAuthority("LEXIS_ADMIN");
    SimpleGrantedAuthority readOnly = new SimpleGrantedAuthority("LEXIS_READ_ONLY");
    SimpleGrantedAuthority approver = new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER");

    mockMvc
        .perform(get("/api/lexis/applications/search").with(jwt().authorities(approver)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            get("/api/lexis/applications/search").with(jwt().authorities(admin, readOnly)))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(get("/api/lexis/rtm/emslogamv").with(jwt().authorities(admin, readOnly)))
        .andExpect(status().isOk());
  }

  @Test
  void prodRtmOnlyModeShouldRejectRtmForNonAdminRoles() throws Exception {
    SimpleGrantedAuthority readOnly = new SimpleGrantedAuthority("LEXIS_READ_ONLY");

    mockMvc
        .perform(
            get("/api/lexis/rtm/emslogamv")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            post("/api/lexis/rtm/emslogamv")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            post("/api/lexis/rtm/emslogamv/batch")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"values\":[]}")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/preview")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/upload")
                .with(jwt().authorities(readOnly)))
        .andExpect(status().isForbidden());
  }

  private static JwtRequestPostProcessor jwt() {
    return SecurityMockMvcRequestPostProcessors.jwt()
        .jwt(
            token ->
                token
                    .claim("custom:idp_name", "idir")
                    .claim("custom:idp_username", "lexis-test-user"));
  }
}

package ca.bc.gov.mof.lexis.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

    mockMvc
        .perform(get("/api/lexis/session/capabilities").with(jwt().authorities(admin)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.grantedActions").isArray())
        .andExpect(jsonPath("$.grantedActions.length()").value(1))
        .andExpect(jsonPath("$.grantedActions[0]").value("/rtmEmsLogAmvAdmin"));

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
                          "grade":"A",
                          "growthIndicator":"O",
                          "retrievalDate":"2099-01-01",
                          "updateDate":"2099-01-01",
                          "newValue":10.01,
                          "saveMode":"create"
                        }
                      ]
                    }
                    """)
                .with(jwt().authorities(admin)))
        .andExpect(status().isOk());

    mockMvc
        .perform(
            post("/api/lexis/rtm/emslogamv/preview")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            post("/api/lexis/rtm/emslogamv/upload")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            get("/api/lexis/rpc/application-details/species-codes")
                .with(jwt().authorities(admin)))
        .andExpect(status().is2xxSuccessful());

    mockMvc
        .perform(get("/api/lexis/applications/search").with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(get("/api/lexis/admin/fam-users").with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());
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

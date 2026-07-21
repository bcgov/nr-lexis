package ca.bc.gov.mof.lexis.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.profiles.active=stub-reports,stub-services",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json"
    })
@AutoConfigureMockMvc
class LexisApplicationControllerTests {

  @Autowired private MockMvc mockMvc;

  @Test
  void searchReturnsPagedResults() throws Exception {
    mockMvc
        .perform(
            get("/api/lexis/applications/search")
                .param("applicationStatus", "REV")
                .param("page", "0")
                .param("size", "10")
                .with(
                    jwt("orgUnitNo", 12L)
                        .authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.results[0].application").value(1000456));
  }

  @Test
  void searchFiltersByExportScheduleId() throws Exception {
    mockMvc
        .perform(
            get("/api/lexis/applications/search")
                .param("exportScheduleId", "1002")
                .param("page", "0")
                .param("size", "10")
                .with(
                    jwt("orgUnitNo", 11L)
                        .authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.results[0].application").value(1000123));
  }

  @Test
  void detailReturnsSingleApplication() throws Exception {
    mockMvc
        .perform(
            get("/api/lexis/applications/1000123")
                .with(
                    jwt("orgUnitNo", 11L)
                        .authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.applicationNumber").value(1000123))
        .andExpect(jsonPath("$.ownerClientNumber").value("00012345"));
  }

  @Test
  void verifyClientsEndpointReturnsBooleanPayload() throws Exception {
    mockMvc
        .perform(
            get("/api/lexis/applications/search/verify-clients")
                .param("applications", "1000123,1000456")
                .with(
                    jwt("orgUnitNos", java.util.List.of(11L, 12L))
                        .authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.clientsMatch").value(false));
  }

  private static JwtRequestPostProcessor jwt(String orgUnitClaim, Object orgUnitValue) {
    return SecurityMockMvcRequestPostProcessors.jwt()
        .jwt(
            token ->
                token
                    .claim("custom:idp_name", "idir")
                    .claim("custom:idp_username", "lexis-test-user")
                    .claim(orgUnitClaim, orgUnitValue));
  }
}

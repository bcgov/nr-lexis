package ca.bc.gov.mof.lexis.controller;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito-idp.ca-central-1.amazonaws.com/test",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json"
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
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.results[0].application").value(1000456));
  }

  @Test
  void detailReturnsSingleApplication() throws Exception {
    mockMvc
        .perform(
            get("/api/lexis/applications/1000123")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
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
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.clientsMatch").value(false));
  }
}

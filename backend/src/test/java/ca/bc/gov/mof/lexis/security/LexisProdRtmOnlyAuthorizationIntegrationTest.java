package ca.bc.gov.mof.lexis.security;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito-idp.ca-central-1.amazonaws.com/test",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json",
      "ALLOWED_ORIGINS=http://localhost:3000",
      "LEXIS_PROD_RTM_ONLY=true"
    })
@AutoConfigureMockMvc
@DisplayName("Integration Test | PROD RTM-only authorization")
class LexisProdRtmOnlyAuthorizationIntegrationTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void prodRtmOnlyModeShouldExposeOnlyRtmUploadAndRequiredSupportApisToAdmins()
      throws Exception {
    SimpleGrantedAuthority admin = new SimpleGrantedAuthority("LEXIS_ADMIN");
    MockMultipartFile workbook =
        new MockMultipartFile(
            "formFile",
            "template.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "not a real workbook".getBytes());

    mockMvc
        .perform(get("/api/lexis/session/capabilities").with(jwt().authorities(admin)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.grantedActions").isArray())
        .andExpect(jsonPath("$.grantedActions.length()").value(1))
        .andExpect(jsonPath("$.grantedActions[0]").value("/lexisAgentAdmin"));

    mockMvc
        .perform(get("/api/lexis/rtm/emslogamv").with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            post("/api/lexis/rtm/emslogamv")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/preview")
                .file(workbook)
                .with(jwt().authorities(admin)))
        .andExpect(status().isUnprocessableEntity());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/upload")
                .file(workbook)
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

    mockMvc
        .perform(get("/api/lexis/admin/fam-users").with(jwt().authorities(admin)))
        .andExpect(status().isForbidden());
  }

  @Test
  void prodRtmOnlyModeShouldRejectRtmForNonAdminRoles() throws Exception {
    MockMultipartFile workbook =
        new MockMultipartFile(
            "formFile",
            "template.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "not a real workbook".getBytes());

    mockMvc
        .perform(
            get("/api/lexis/rtm/emslogamv")
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/preview")
                .file(workbook)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            multipart("/api/lexis/rtm/emslogamv/upload")
                .file(workbook)
                .with(jwt().authorities(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))))
        .andExpect(status().isForbidden());
  }
}

package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest(properties = {
    "spring.profiles.active=stub-reports,stub-services",
    "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
    "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json"
})
@AutoConfigureMockMvc
class FederalReadOnlyAuthorizationIntegrationTest {
  @Autowired private MockMvc mvc;
  @Autowired private ObjectMapper mapper;
  @Autowired private LexisSessionService sessionService;
  @MockitoBean private LexisApplicationService applications;
  @MockitoBean private FederalApplicationService federalApplications;
  @MockitoBean private ApplicationDetailsRpcService applicationDetails;

  @BeforeEach
  void setUp() throws Exception {
    when(applications.findAccessByApplicationNumber(9001L))
        .thenReturn(Optional.of(new ApplicationAccessContextDto(9001L, "F", null, null, null)));
    when(applications.findAccessByApplicationNumber(1001L))
        .thenReturn(Optional.of(new ApplicationAccessContextDto(1001L, "P", null, null, null)));
    when(applications.findByApplicationNumber(9001L)).thenReturn(Optional.of(
        mapper.readValue("{\"applicationNumber\":9001,\"jurisdictionCode\":\"F\"}", LexisApplicationDetailDto.class)));
    when(applications.findByApplicationNumber(1001L)).thenReturn(Optional.of(
        mapper.readValue("{\"applicationNumber\":1001,\"jurisdictionCode\":\"P\"}", LexisApplicationDetailDto.class)));
  }

  @Test
  void businessBceidWithoutClientShouldReceiveOnlyFederalCapabilitiesAndReadOnlyDetail() throws Exception {
    mvc.perform(get("/api/lexis/session/capabilities").with(federalReader()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.roles[0]").value("LEXIS_FEDERAL_READ_ONLY"))
        .andExpect(jsonPath("$.grantedActions.length()").value(3))
        .andExpect(jsonPath("$.forestClientSelectionRequired").value(false))
        .andExpect(jsonPath("$.availableForestClientNumbers").isEmpty());
    var detail = mapper.readValue("""
        {"applicationNumber":9001,"federalApplicationNumber":"FED-9001","statusCode":"APP",
         "packages":[],"remarks":[],"offers":[]}
        """, FederalApplicationDetailDto.class);
    when(federalApplications.findByApplicationNumber(9001L)).thenReturn(Optional.of(detail));
    mvc.perform(get("/api/lexis/federal/applications/9001").with(federalReader()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.federalApplicationNumber").value("FED-9001"))
        .andExpect(jsonPath("$.readOnly").value(true));
    when(federalApplications.search(any())).thenReturn(
        new FederalApplicationSearchResponseDto(List.of(), 0, 0, 25));
    mvc.perform(get("/api/lexis/federal/applications/search").with(federalReader()))
        .andExpect(status().isOk());
    verify(federalApplications).search(org.mockito.ArgumentMatchers.argThat(criteria -> {
      assertThat(criteria.ownerClientNumber()).isNull();
      assertThat(criteria.agentClientNumber()).isNull();
      return true;
    }));
  }

  @ParameterizedTest
  @ValueSource(strings = {"/api/lexis/applications/search", "/api/lexis/applications/1001",
      "/api/lexis/exemptions/search", "/api/lexis/exemptions/EX-1",
      "/api/lexis/purchase-offers/search", "/api/lexis/permits/search",
      "/api/lexis/reports/options", "/api/lexis/reports/permitReport",
      "/api/lexis/rtm/emslogamv", "/api/lexis/admin/notifications", "/api/lexis/notifications",
      "/api/lexis/session/preferences", "/api/lexis/rpc/application-details/application-summary",
      "/api/lexis/rpc/application-details/client-details",
      "/api/lexis/applicationDetailsRPC?actionMapping=getDocumentDetails&applicationNumber=9001"})
  void shouldDenyOtherBusinessAndLegacyEndpoints(String path) throws Exception {
    mvc.perform(get(URI.create(path)).with(federalReader())).andExpect(status().isForbidden());
  }

  @Test
  void shouldDenyEveryFederalAndSharedMutationVerb() throws Exception {
    for (String path : List.of("/api/lexis/federal/applications/9001/status",
        "/api/lexis/federal/applications/9001/permit", "/api/lexis/federal/applications/9001/remarks",
        "/api/lexis/federal/applications/9001/remarks/1", "/api/lexis/federal/submissions",
        "/api/lexis/federal/submissions/validation", "/api/lexis/federal/submissions/prevalidation",
        "/api/lexis/rpc/application-details/document", "/api/lexis/rpc/application-details/package",
        "/api/lexis/rpc/application-details/package-scale", "/api/lexis/rpc/application-details/release-lock")) {
      for (HttpMethod method : List.of(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE)) {
        mvc.perform(request(method, path).with(csrf()).with(federalReader()))
            .andExpect(status().isForbidden());
      }
    }
  }

  @Test
  void sharedDocumentReadsShouldRequireFederalOwnershipAndHideProvincialPermitDocuments() throws Exception {
    var direct = new ApplicationDetailsRpcService.DocumentItem(
        11L, "federal.pdf", "Federal application", "PDF", "application", 9001L, null, true);
    var permit = new ApplicationDetailsRpcService.DocumentItem(
        12L, "provincial.pdf", "Provincial permit", "PDF", "permit", null, 7001L, false);
    when(applicationDetails.getDocumentDetails(9001L)).thenReturn(List.of(direct, permit));
    mvc.perform(get("/api/lexis/rpc/application-details/document-details")
            .param("applicationNumber", "9001").with(federalReader()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].name").value("federal.pdf"));
    mvc.perform(get("/api/lexis/rpc/application-details/document-details")
            .param("applicationNumber", "1001").with(federalReader()))
        .andExpect(status().isForbidden());
    verify(applicationDetails, never()).getDocumentDetails(1001L);
    when(applicationDetails.findDocumentForApplication(11L, 9001L)).thenReturn(Optional.of(direct));
    when(applicationDetails.streamDocument(11L)).thenReturn(Optional.of(output -> output.write(new byte[] {1, 2, 3})));
    var download = mvc.perform(get("/api/lexis/rpc/application-details/document")
        .param("applicationNumber", "9001").param("fileId", "11").with(federalReader()))
        .andExpect(status().isOk()).andReturn();
    mvc.perform(asyncDispatch(download)).andExpect(status().isOk())
        .andExpect(content().bytes(new byte[] {1, 2, 3}));
    when(applicationDetails.findDocumentForApplication(12L, 9001L)).thenReturn(Optional.of(permit));
    for (long fileId : List.of(12L, 99L)) {
      mvc.perform(get("/api/lexis/rpc/application-details/document")
              .param("applicationNumber", "9001").param("fileId", Long.toString(fileId))
              .with(federalReader()))
          .andExpect(status().isForbidden());
      verify(applicationDetails, never()).streamDocument(fileId);
    }
  }

  @Test
  void sharedPackageReadsShouldRejectProvincialAndUnknownParents() throws Exception {
    when(applicationDetails.findApplicationNumberForPackage("FED-PKG")).thenReturn(Optional.of(9001L));
    when(applicationDetails.findApplicationNumberForPackage("PROV-PKG")).thenReturn(Optional.of(1001L));
    mvc.perform(get("/api/lexis/rpc/application-details/package-scales")
            .param("packageNumber", "FED-PKG").with(federalReader()))
        .andExpect(status().isOk());
    for (String number : List.of("PROV-PKG", "UNKNOWN")) {
      mvc.perform(get("/api/lexis/rpc/application-details/package-scales")
              .param("packageNumber", number).with(federalReader()))
          .andExpect(status().isForbidden());
      verify(applicationDetails, never()).getScalesForPackage(number);
    }
  }

  private RequestPostProcessor federalReader() {
    String issuer = "https://cognito.example.test/user-pool";
    Jwt token = Jwt.withTokenValue("test-token").header("alg", "none")
        .issuer(issuer).subject("nexcol-reader")
        .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300))
        .claim("custom:idp_name", "bceidbusiness")
        .claim("custom:idp_username", "nexcol-reader")
        .claim("cognito:groups", List.of("LEXIS_FEDERAL_READ_ONLY")).build();
    var converter = new Oauth2SecurityCustomizer(issuer + "/.well-known/jwks.json", issuer,
        "", "", sessionService);
    return jwt().jwt(token).authorities(converter.normalizedAuthorities(token));
  }
}

package ca.bc.gov.mof.lexis.security;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/** Signed bearer tokens exercise the decoder, converter and security filter chain together. */
@SpringJUnitWebConfig(KeycloakBearerAuthenticationIntegrationTest.TestConfiguration.class)
class KeycloakBearerAuthenticationIntegrationTest {
  private static final String CLIENT = "lexis-test";
  private static final RSAKey SIGNING_KEY;
  private static final RSAKey WRONG_KEY;
  private static final HttpServer JWKS_SERVER;
  private static final String ISSUER;
  private static final String MACHINE_ISSUER;

  static {
    try {
      SIGNING_KEY = new RSAKeyGenerator(2048).keyID("test-key").generate();
      WRONG_KEY = new RSAKeyGenerator(2048).keyID("test-key").generate();
      JWKS_SERVER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      byte[] jwks =
          new JWKSet(SIGNING_KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
      JWKS_SERVER.createContext(
          "/",
          exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, jwks.length);
            try (var response = exchange.getResponseBody()) {
              response.write(jwks);
            }
          });
      JWKS_SERVER.start();
      String base = "http://127.0.0.1:" + JWKS_SERVER.getAddress().getPort();
      ISSUER = base + "/realms/standard";
      MACHINE_ISSUER = base + "/realms/forests";
    } catch (Exception exception) {
      throw new ExceptionInInitializerError(exception);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> ISSUER);
    registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri", () -> "");
    registry.add("lexis.auth.oidc.client-id", () -> CLIENT);
    registry.add("lexis.auth.keycloak.issuer-uri", () -> MACHINE_ISSUER);
  }

  @Autowired private WebApplicationContext context;
  private MockMvc mvc;

  @BeforeEach
  void setup() {
    mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
  }

  @AfterAll
  static void stopServer() {
    JWKS_SERVER.stop(0);
  }

  @ParameterizedTest
  @ValueSource(strings = {"idir", "azureidir"})
  void staffAccessTokenShouldKeepAuditIdentity(String provider) throws Exception {
    mvc.perform(
            get("/staff")
                .header("Authorization", bearer(b -> b.claim("identity_provider", provider))))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.principal").value("IDIR\\staff.user"));
  }

  @Test
  void bceidTokenShouldProduceConcreteForestClientScope() throws Exception {
    String token =
        bearer(
            b ->
                b.claim("identity_provider", "bceidbusiness")
                    .claim("bceid_username", "industry.user")
                    .claim(
                        "client_roles",
                        List.of("LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00001018")));
    mvc.perform(get("/clients").header("Authorization", token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.principal").value("BCEIDBUSINESS\\industry.user"))
        .andExpect(jsonPath("$.clients[0]").value("00001018"));
    mvc.perform(get("/staff").header("Authorization", token)).andExpect(status().isForbidden());
  }

  @Test
  void resourceAccessShouldUseOnlyTheExpectedClient() throws Exception {
    mvc.perform(
            get("/staff")
                .header(
                    "Authorization",
                    bearer(
                        b ->
                            b.claim("client_roles", null)
                                .claim(
                                    "resource_access",
                                    Map.of(CLIENT, Map.of("roles", List.of("LEXIS_READ_ONLY")))))))
        .andExpect(status().isOk());
    mvc.perform(
            get("/staff")
                .header(
                    "Authorization",
                    bearer(
                        b ->
                            b.claim("client_roles", null)
                                .claim(
                                    "resource_access",
                                    Map.of(
                                        "another-client",
                                        Map.of("roles", List.of("LEXIS_READ_ONLY")))))))
        .andExpect(status().isForbidden());
  }

  @Test
  void signedRegionalGrantCannotBecomeUnscopedReadAccess() throws Exception {
    String regional = "LEXIS_READ_ONLY_REGION-CARIBOO";
    mvc.perform(get("/staff").header("Authorization", bearer(b -> b.claim("client_roles", List.of(regional)))))
        .andExpect(status().isForbidden());
    mvc.perform(get("/staff").header("Authorization", bearer(b -> b.claim(
        "client_roles", List.of(regional, "LEXIS_READ_ONLY")))))
        .andExpect(status().isOk());
  }

  @Test
  void clientBindingAndTimeClaimsShouldBeValidated() throws Exception {
    unauthorized(b -> b.claim("azp", "another-client"));
    unauthorized(b -> b.claim("azp", null));
    unauthorized(b -> b.expirationTime(null));
    unauthorized(b -> b.expirationTime(Date.from(Instant.now().minusSeconds(120))));
    unauthorized(b -> b.notBeforeTime(Date.from(Instant.now().plusSeconds(120))));
  }

  @ParameterizedTest
  @ValueSource(strings = {"ID", "Refresh", "", "JWT"})
  void otherTokenTypesShouldBeRejectedEvenWithValidRolesAndClient(String type) throws Exception {
    unauthorized(b -> b.claim("typ", type));
  }

  @Test
  void missingTypeOrUnsupportedProviderShouldBeRejected() throws Exception {
    unauthorized(b -> b.claim("typ", null));
    unauthorized(b -> b.claim("identity_provider", "bceidbasic"));
    unauthorized(b -> b.claim("identity_provider", null));
  }

  @Test
  void unknownOrMissingIssuerShouldReturnUnauthorized() throws Exception {
    unauthorized(b -> b.issuer("https://unknown.example.test"));
    unauthorized(b -> b.issuer(null));
  }

  @Test
  void malformedTokenAndInvalidSignatureShouldReturnUnauthorized() throws Exception {
    mvc.perform(get("/staff").header("Authorization", "Bearer not-a-jwt"))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/staff").header("Authorization", sign(staffClaims(), WRONG_KEY)))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void machineAndInteractiveAuthoritiesShouldRemainIsolated() throws Exception {
    String machine =
        sign(
            new JWTClaimsSet.Builder()
                .issuer(MACHINE_ISSUER)
                .subject("service-id")
                .issueTime(Date.from(Instant.now()))
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .claim("azp", "nexcol-service-client")
                .claim("preferred_username", "service-account-nexcol-service-client")
                .claim("client_roles", List.of("LEXIS_ADMIN"))
                .claim("scope", "lexis:federal-submission:submit")
                .build(),
            SIGNING_KEY);
    mvc.perform(get("/machine").header("Authorization", machine))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.principal").value("SERVICE\\nexcol-service-client"));
    mvc.perform(get("/staff").header("Authorization", machine)).andExpect(status().isForbidden());
    mvc.perform(
            get("/machine")
                .header(
                    "Authorization",
                    bearer(b -> b.claim("scope", "lexis:federal-submission:submit"))))
        .andExpect(status().isForbidden());
  }

  private void unauthorized(Consumer<JWTClaimsSet.Builder> change) throws Exception {
    mvc.perform(get("/staff").header("Authorization", bearer(change)))
        .andExpect(status().isUnauthorized());
  }

  private String bearer(Consumer<JWTClaimsSet.Builder> change) throws Exception {
    JWTClaimsSet.Builder builder = new JWTClaimsSet.Builder(staffClaims());
    change.accept(builder);
    return sign(builder.build(), SIGNING_KEY);
  }

  private JWTClaimsSet staffClaims() {
    return new JWTClaimsSet.Builder()
        .issuer(ISSUER)
        .subject("user-guid")
        .audience("account")
        .issueTime(Date.from(Instant.now()))
        .expirationTime(Date.from(Instant.now().plusSeconds(300)))
        .claim("azp", CLIENT)
        .claim("typ", "Bearer")
        .claim("identity_provider", "idir")
        .claim("idir_username", "staff.user")
        .claim("preferred_username", "user-guid@idir")
        .claim("client_roles", List.of("LEXIS_READ_ONLY"))
        .build();
  }

  private String sign(JWTClaimsSet claims, RSAKey key) throws Exception {
    SignedJWT token =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256)
                .keyID(key.getKeyID())
                .type(JOSEObjectType.JWT)
                .build(),
            claims);
    token.sign(new RSASSASigner(key));
    return "Bearer " + token.serialize();
  }

  @Configuration
  @EnableWebMvc
  @EnableWebSecurity
  @Import({Oauth2SecurityCustomizer.class, LexisPrincipalService.class, ProbeController.class})
  static class TestConfiguration {
    @Bean
    LexisSessionService sessionService() {
      return new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, Oauth2SecurityCustomizer customizer)
        throws Exception {
      return http.authorizeHttpRequests(
              r ->
                  r.requestMatchers("/staff")
                      .hasAuthority("LEXIS_READ_ONLY")
                      .requestMatchers("/clients")
                      .hasAuthority("LEXIS_PROVINCIAL_SUBMITTER")
                      .requestMatchers("/machine")
                      .hasAuthority("SCOPE_lexis:federal-submission:submit")
                      .anyRequest()
                      .denyAll())
          .oauth2ResourceServer(customizer)
          .build();
    }
  }

  @RestController
  static class ProbeController {
    private final LexisPrincipalService principalService;
    private final LexisSessionService sessionService;

    ProbeController(LexisPrincipalService principalService, LexisSessionService sessionService) {
      this.principalService = principalService;
      this.sessionService = sessionService;
    }

    @GetMapping(
        value = {"/staff", "/clients", "/machine"},
        produces = MediaType.APPLICATION_JSON_VALUE)
    Map<String, Object> identity(Authentication authentication) {
      return Map.of(
          "principal", principalService.resolvePrincipalName(authentication),
          "clients", sessionService.resolveForestClientScope(authentication).availableClientNumbers());
    }
  }
}

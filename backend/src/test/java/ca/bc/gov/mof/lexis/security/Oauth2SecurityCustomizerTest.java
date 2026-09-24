package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

class Oauth2SecurityCustomizerTest {
  private static final String ISSUER = "https://loginproxy.example.test/auth/realms/standard";
  private static final String MACHINE_ISSUER = "https://loginproxy.example.test/auth/realms/forests";
  private static final String CLIENT = "lexis-test";
  private final LexisSessionService sessionService =
      new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
  private final Oauth2SecurityCustomizer customizer =
      new Oauth2SecurityCustomizer("", ISSUER, CLIENT, MACHINE_ISSUER, "", sessionService);

  @ParameterizedTest
  @ValueSource(strings = {"idir", "azureidir"})
  void staffRolesShouldRemainSeparateFromBceidAndMachineAuthorities(String provider) {
    assertThat(
            authorities(
                Map.of(
                    "identity_provider", provider,
                    "client_roles",
                        List.of(
                            "LEXIS_ADMIN",
                            "LEXIS_READ_ONLY",
                            "LEXIS_APPLICATION_APPROVER",
                            "LEXIS_EXEMPTION_APPROVER",
                            "LEXIS_FEDERAL_READ_ONLY",
                            "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00001018",
                            "DELEGATED_ADMIN",
                            "FAM:EXPIRES:2026-09-30:LEXIS_ADMIN"),
                    "scope", "lexis:federal-submission:submit")))
        .containsExactly(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_APPLICATION_APPROVER",
            "LEXIS_EXEMPTION_APPROVER");
  }

  @Test
  void roleSpellingShouldNotChangeWhatItGrants() {
    assertThat(
            authorities(
                Map.of("client_roles", List.of(" lexis_admin ", "Lexis_Read_Only_Region-Cariboo"))))
        .containsExactly("LEXIS_ADMIN", "LEXIS_READ_ONLY_REGION-CARIBOO");
    assertThat(
            authorities(
                Map.of(
                    "identity_provider", "bceidbusiness",
                    "client_roles",
                        List.of(
                            "lexis_provincial_submitter_forest_client-00001018",
                            " lexis_federal_read_only"))))
        .containsExactly(
            "LEXIS_PROVINCIAL_SUBMITTER_00001018",
            "LEXIS_PROVINCIAL_SUBMITTER",
            "LEXIS_FEDERAL_READ_ONLY");
  }

  @Test
  void bceidShouldTranslateForestClientRolesAndKeepMultipleClientSelection() {
    List<String> authorities =
        authorities(
            Map.of(
                "identity_provider", "bceidbusiness",
                "client_roles",
                    List.of(
                        "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00001018",
                        "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00002019",
                        "LEXIS_ADMIN",
                        "LEXIS_READ_ONLY",
                        "LEXIS_PROVINCIAL_SUBMITTER",
                        "LEXIS_FEDERAL_READ_ONLY")));
    assertThat(authorities)
        .containsExactly(
            "LEXIS_PROVINCIAL_SUBMITTER_00001018",
            "LEXIS_PROVINCIAL_SUBMITTER",
            "LEXIS_PROVINCIAL_SUBMITTER_00002019",
            "LEXIS_FEDERAL_READ_ONLY");
    var scope = sessionService.resolveForestClientScope(authorities);
    assertThat(scope.availableClientNumbers()).containsExactly("00001018", "00002019");
    assertThat(scope.selectionRequired()).isTrue();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_PROVINCIAL_SUBMITTER",
        "LEXIS_PROVINCIAL_SUBMITTER_00001018",
        "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-1018",
        "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-000010180",
        "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00001A18",
        "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-００００１０１８",
        "LEXIS_PROVINCIAL_SUBMITTER_DISTRICT-DQU",
        "LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00001018_EXTRA",
        "FAM:EXPIRES:2026-09-30:LEXIS_PROVINCIAL_SUBMITTER_FOREST_CLIENT-00001018",
        "LEXIS_DELEGATED_ADMIN"
      })
  void invalidOrBookkeepingRolesShouldNotBecomeAuthorities(String role) {
    assertThat(
            authorities(
                Map.of("identity_provider", "bceidbusiness", "client_roles", List.of(role))))
        .isEmpty();
  }

  @Test
  void resourceAccessShouldReadOnlyTheConfiguredClientAndIgnoreRealmRoles() {
    assertThat(
            authorities(
                Map.of(
                    "resource_access",
                        Map.of(
                            CLIENT, Map.of("roles", List.of("LEXIS_READ_ONLY")),
                            "other-client", Map.of("roles", List.of("LEXIS_ADMIN"))),
                    "realm_access", Map.of("roles", List.of("LEXIS_ADMIN")))))
        .containsExactly("LEXIS_READ_ONLY");
    assertThat(
            authorities(
                Map.of(
                    "resource_access",
                    Map.of("other-client", Map.of("roles", List.of("LEXIS_ADMIN"))))))
        .isEmpty();
  }

  @Test
  void clientRolesShouldTakePrecedenceAndMalformedClaimsShouldGrantNothing() {
    assertThat(
            authorities(
                Map.of(
                    "client_roles", List.of("LEXIS_READ_ONLY"),
                    "resource_access", Map.of(CLIENT, Map.of("roles", List.of("LEXIS_ADMIN"))))))
        .containsExactly("LEXIS_READ_ONLY");
    assertThat(
            authorities(
                Map.of("client_roles", "LEXIS_ADMIN", "resource_access", List.of("LEXIS_ADMIN"))))
        .isEmpty();
    assertThat(authorities(Map.of("client_roles", List.of(12, Map.of("roles", "LEXIS_ADMIN")))))
        .isEmpty();
  }

  @ParameterizedTest
  @ValueSource(strings = {"", "bceidbasic", "dev-bceidbusiness", "unknown"})
  void unsupportedIdentityProvidersShouldGrantNothing(String provider) {
    assertThat(
            authorities(
                Map.of("identity_provider", provider, "client_roles", List.of("LEXIS_ADMIN"))))
        .isEmpty();
  }

  @Test
  void unknownIssuerOrClientShouldGrantNothing() {
    assertThat(
            authorities(
                Map.of(
                    "iss", "https://unknown.example.test", "client_roles", List.of("LEXIS_ADMIN"))))
        .isEmpty();
    assertThat(authorities(Map.of("azp", "other-client", "client_roles", List.of("LEXIS_ADMIN"))))
        .isEmpty();
  }

  @Test
  void machineIssuerShouldContinueUsingScopesOnly() {
    assertThat(
            authorities(
                Map.of(
                    "iss", MACHINE_ISSUER,
                    "scope", "openid lexis:federal-submission:submit",
                    "scp", List.of("lexis:federal-submission:submit"),
                    "client_roles", List.of("LEXIS_ADMIN"),
                    "resource_access", Map.of(CLIENT, Map.of("roles", List.of("LEXIS_READ_ONLY"))))))
        .containsExactly("SCOPE_openid", "SCOPE_lexis:federal-submission:submit");
  }

  @Test
  void machineAccessTokenUseValidationShouldStayCompatible() {
    assertThat(
            Oauth2SecurityCustomizer.accessTokenUseValidator()
                .validate(jwt(Map.of("iss", MACHINE_ISSUER)))
                .hasErrors())
        .isFalse();
    assertThat(
            Oauth2SecurityCustomizer.accessTokenUseValidator()
                .validate(jwt(Map.of("token_use", "id")))
                .hasErrors())
        .isTrue();
  }

  @Test
  void configurationShouldFailClosedForMissingClientOrOverlappingIssuers() {
    assertThatThrownBy(
            () -> new Oauth2SecurityCustomizer("", ISSUER, "", MACHINE_ISSUER, "", sessionService))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("client-id");
    assertThatThrownBy(
            () -> new Oauth2SecurityCustomizer("", ISSUER, CLIENT, ISSUER + "/", "", sessionService))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("distinct");
    assertThat(Oauth2SecurityCustomizer.normalizeIssuerUri(ISSUER + "/")).isEqualTo(ISSUER);
  }

  @Test
  void signingKeyFetchShouldSurviveOneTransientSsoFailure() throws Exception {
    RSAKey key = new RSAKeyGenerator(2048).keyID("sso-key").generate();
    byte[] jwks = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
    AtomicInteger requests = new AtomicInteger();
    HttpServer sso = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    sso.createContext(
        "/",
        exchange -> {
          if (requests.incrementAndGet() == 1) {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
            return;
          }
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, jwks.length);
          try (var response = exchange.getResponseBody()) {
            response.write(jwks);
          }
        });
    sso.start();
    try {
      String issuer = "http://127.0.0.1:" + sso.getAddress().getPort() + "/realms/standard";
      JwtDecoder decoder =
          Oauth2SecurityCustomizer.createDecoder(
              issuer,
              issuer + "/protocol/openid-connect/certs",
              "issuer-uri",
              "jwk-set-uri",
              token -> OAuth2TokenValidatorResult.success());
      SignedJWT token =
          new SignedJWT(
              new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("sso-key").build(),
              new JWTClaimsSet.Builder()
                  .issuer(issuer)
                  .subject("user")
                  .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                  .build());
      token.sign(new RSASSASigner(key));

      // Spring's default decoder rejects this token outright when the key fetch fails.
      assertThat(decoder.decode(token.serialize()).getSubject()).isEqualTo("user");
      assertThat(requests).hasValue(2);
    } finally {
      sso.stop(0);
    }
  }

  private List<String> authorities(Map<String, Object> claims) {
    return customizer.normalizedAuthorities(jwt(claims)).stream()
        .map(GrantedAuthority::getAuthority)
        .toList();
  }

  @ParameterizedTest
  @ValueSource(strings = {"idir", "azureidir"})
  void regionalStaffAuthoritiesRetainTheRoleRegionPairWithoutGrantingAnUnscopedRole(String provider) {
    List<String> roles = List.of(
        "LEXIS_APPLICATION_APPROVER_REGION-CARIBOO",
        "LEXIS_EXEMPTION_APPROVER_REGION-SKEENA",
        "LEXIS_READ_ONLY_REGION-SOUTH_COAST");
    assertThat(authorities(Map.of("identity_provider", provider, "client_roles", roles)))
        .containsExactlyElementsOf(roles);
    assertThat(authorities(Map.of(
        "identity_provider", provider,
        "resource_access", Map.of(CLIENT, Map.of("roles", roles)))))
        .containsExactlyElementsOf(roles);
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "LEXIS_ADMIN_REGION-CARIBOO",
    "LEXIS_APPLICATION_APPROVER_REGION-UNKNOWN",
    "LEXIS_APPLICATION_APPROVER_REGION-CARIBOO_FOREST_CLIENT-00001018",
    "LEXIS_APPLICATION_APPROVER_DISTRICT-DCC",
    "FAM:EXPIRES:2026-09-30:LEXIS_READ_ONLY_REGION-CARIBOO"
  })
  void unsupportedRegionalStaffAuthoritiesAreNotPromotedToBaseRoles(String role) {
    assertThat(authorities(Map.of("client_roles", List.of(role)))).isEmpty();
  }

  @Test
  void bceidAndMachineTokensCannotObtainRegionalStaffAuthorities() {
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER_REGION-CARIBOO");
    assertThat(authorities(Map.of("identity_provider", "bceidbusiness", "client_roles", roles)))
        .isEmpty();
    assertThat(authorities(Map.of("iss", MACHINE_ISSUER, "client_roles", roles))).isEmpty();
    assertThat(authorities(Map.of("azp", "another-client", "client_roles", roles))).isEmpty();
  }

  private Jwt jwt(Map<String, Object> extra) {
    Map<String, Object> claims =
        new HashMap<>(
            Map.of("iss", ISSUER, "azp", CLIENT, "identity_provider", "idir", "typ", "Bearer"));
    claims.putAll(extra);
    return new Jwt(
        "token", Instant.now(), Instant.now().plusSeconds(300), Map.of("alg", "RS256"), claims);
  }
}

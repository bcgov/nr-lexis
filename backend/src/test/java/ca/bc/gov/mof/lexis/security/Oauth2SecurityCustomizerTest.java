package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

class Oauth2SecurityCustomizerTest {

  private static final String COGNITO_ISSUER = "https://cognito.example.test/user-pool";
  private static final String COGNITO_JWKS = COGNITO_ISSUER + "/.well-known/jwks.json";
  private static final String KEYCLOAK_ISSUER =
      "https://loginproxy.example.test/auth/realms/standard";
  private static final String KEYCLOAK_FORESTS_ISSUER =
      "https://loginproxy.example.test/auth/realms/forests";

  @Test
  void cognitoAuthoritiesShouldIncludeGroupsButIgnoreOauthScopes() {
    Oauth2SecurityCustomizer customizer =
        new Oauth2SecurityCustomizer(
            COGNITO_JWKS,
            COGNITO_ISSUER,
            KEYCLOAK_ISSUER,
            "",
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"));

    Jwt jwt =
        jwt(
            Map.of(
                "iss",
                COGNITO_ISSUER,
                "cognito:groups",
                List.of("LEXIS_READ_ONLY"),
                "scope",
                "lexis:federal-submission:submit openid",
                "scp",
                List.of("extra.scope")));

    assertThat(
            customizer.normalizedAuthorities(jwt).stream()
                .map(GrantedAuthority::getAuthority)
                .toList())
        .containsExactly("LEXIS_READ_ONLY");
  }

  @Test
  void keycloakAuthoritiesShouldIncludeOauthScopesButIgnoreCognitoGroups() {
    Oauth2SecurityCustomizer customizer =
        new Oauth2SecurityCustomizer(
            COGNITO_JWKS,
            COGNITO_ISSUER,
            KEYCLOAK_ISSUER,
            "",
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"));

    Jwt jwt =
        jwt(
            Map.of(
                "iss",
                KEYCLOAK_ISSUER,
                "cognito:groups",
                List.of("LEXIS_ADMIN"),
                "scope",
                "lexis:federal-submission:submit openid",
                "scp",
                List.of("extra.scope")));

    assertThat(
            customizer.normalizedAuthorities(jwt).stream()
                .map(GrantedAuthority::getAuthority)
                .toList())
        .containsExactly(
            "SCOPE_lexis:federal-submission:submit", "SCOPE_openid", "SCOPE_extra.scope");
  }

  @Test
  void normalizedAuthoritiesShouldPreserveConcreteFamClientScopeAndAddBaseRole() {
    Oauth2SecurityCustomizer customizer =
        new Oauth2SecurityCustomizer(
            COGNITO_JWKS,
            COGNITO_ISSUER,
            "",
            "",
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"));

    Jwt jwt =
        jwt(
            Map.of(
                "iss",
                COGNITO_ISSUER,
                "cognito:groups",
                List.of("LEXIS_PROVINCIAL_SUBMITTER_00012345")));

    assertThat(
            customizer.normalizedAuthorities(jwt).stream()
                .map(GrantedAuthority::getAuthority)
                .toList())
        .containsExactly(
            "LEXIS_PROVINCIAL_SUBMITTER_00012345", "LEXIS_PROVINCIAL_SUBMITTER");
  }

  @Test
  void normalizedAuthoritiesShouldNotTreatKeycloakClientRolesAsOauthScopes() {
    Oauth2SecurityCustomizer customizer =
        new Oauth2SecurityCustomizer(
            COGNITO_JWKS,
            COGNITO_ISSUER,
            KEYCLOAK_FORESTS_ISSUER,
            "",
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"));

    Jwt jwt =
        jwt(
            Map.of(
                "iss",
                KEYCLOAK_FORESTS_ISSUER,
                "resource_access",
                Map.of(
                    "ap-gw-lexis-default-dev",
                    Map.of("roles", List.of("lexis:federal-submission:submit"))),
                "client_roles",
                List.of("lexis:extra:read")));

    assertThat(
            customizer.normalizedAuthorities(jwt).stream()
                .map(GrantedAuthority::getAuthority)
                .toList())
        .isEmpty();
  }

  @Test
  void accessTokenUseValidatorShouldAllowKeycloakTokensWithoutTokenUseClaim() {
    Jwt jwt = jwt(Map.of("iss", KEYCLOAK_ISSUER));

    assertThat(Oauth2SecurityCustomizer.accessTokenUseValidator().validate(jwt).hasErrors())
        .isFalse();
  }

  @Test
  void accessTokenUseValidatorShouldRejectCognitoIdTokens() {
    Jwt jwt =
        jwt(
            Map.of(
                "iss",
                COGNITO_ISSUER,
                "token_use",
                "id"));

    assertThat(Oauth2SecurityCustomizer.accessTokenUseValidator().validate(jwt).hasErrors())
        .isTrue();
  }

  @Test
  void normalizeIssuerUriShouldStripTrailingSlashesForKeycloakIssuerMatching() {
    assertThat(
            Oauth2SecurityCustomizer.normalizeIssuerUri(
                KEYCLOAK_ISSUER + "/"))
        .isEqualTo(KEYCLOAK_ISSUER);
  }

  private Jwt jwt(Map<String, Object> claims) {
    Instant issuedAt = Instant.parse("2026-07-06T19:00:00Z");
    return new Jwt(
        "token",
        issuedAt,
        issuedAt.plusSeconds(300),
        Map.of("alg", "RS256"),
        claims);
  }
}

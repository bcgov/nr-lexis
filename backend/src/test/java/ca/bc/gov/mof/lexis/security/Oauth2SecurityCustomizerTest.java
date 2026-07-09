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

  @Test
  void normalizedAuthoritiesShouldIncludeCognitoGroupsAndKeycloakOauthScopes() {
    Oauth2SecurityCustomizer customizer =
        new Oauth2SecurityCustomizer(
            "https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json",
            "https://cognito-idp.ca-central-1.amazonaws.com/test",
            "https://dev.loginproxy.gov.bc.ca/auth/realms/standard",
            "",
            "",
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"));

    Jwt jwt =
        jwt(
            Map.of(
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
        .containsExactly(
            "LEXIS_READ_ONLY",
            "SCOPE_lexis:federal-submission:submit",
            "SCOPE_openid",
            "SCOPE_extra.scope");
  }

  @Test
  void normalizedAuthoritiesShouldMapKeycloakClientRolesToScopeAuthorities() {
    Oauth2SecurityCustomizer customizer =
        new Oauth2SecurityCustomizer(
            "https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json",
            "https://cognito-idp.ca-central-1.amazonaws.com/test",
            "https://dev.loginproxy.gov.bc.ca/auth/realms/forests",
            "https://dev.loginproxy.gov.bc.ca/auth/realms/apigw",
            "",
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"));

    Jwt jwt =
        jwt(
            Map.of(
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
        .containsExactly(
            "SCOPE_lexis:extra:read", "SCOPE_lexis:federal-submission:submit");
  }

  @Test
  void accessTokenUseValidatorShouldAllowKeycloakTokensWithoutTokenUseClaim() {
    Jwt jwt = jwt(Map.of("iss", "https://dev.loginproxy.gov.bc.ca/auth/realms/standard"));

    assertThat(Oauth2SecurityCustomizer.accessTokenUseValidator().validate(jwt).hasErrors())
        .isFalse();
  }

  @Test
  void accessTokenUseValidatorShouldRejectCognitoIdTokens() {
    Jwt jwt =
        jwt(
            Map.of(
                "iss",
                "https://cognito-idp.ca-central-1.amazonaws.com/test",
                "token_use",
                "id"));

    assertThat(Oauth2SecurityCustomizer.accessTokenUseValidator().validate(jwt).hasErrors())
        .isTrue();
  }

  @Test
  void normalizeIssuerUriShouldStripTrailingSlashesForKeycloakIssuerMatching() {
    assertThat(
            Oauth2SecurityCustomizer.normalizeIssuerUri(
                "https://dev.loginproxy.gov.bc.ca/auth/realms/standard/"))
        .isEqualTo("https://dev.loginproxy.gov.bc.ca/auth/realms/standard");
  }

  @Test
  void splitIssuerUrisShouldIgnoreBlankCommaSeparatedValues() {
    assertThat(
            Oauth2SecurityCustomizer.splitIssuerUris(
                " https://dev.loginproxy.gov.bc.ca/auth/realms/apigw, ,https://test.loginproxy.gov.bc.ca/auth/realms/apigw "))
        .containsExactly(
            "https://dev.loginproxy.gov.bc.ca/auth/realms/apigw",
            "https://test.loginproxy.gov.bc.ca/auth/realms/apigw");
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

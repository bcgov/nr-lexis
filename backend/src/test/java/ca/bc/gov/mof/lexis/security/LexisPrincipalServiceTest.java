package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

@DisplayName("Unit Test | LexisPrincipalService")
class LexisPrincipalServiceTest {

  private static final String SYNTHETIC_UUID_SUBJECT =
      "00000000-0000-4000-8000-000000000001";

  private final LexisPrincipalService service = new LexisPrincipalService();

  @Test
  void shouldResolveIdirUserFromAccessTokenClaims() {
    Jwt accessToken =
        jwt(
            SYNTHETIC_UUID_SUBJECT,
            Map.of(
                "custom:idp_name", "idir",
                "custom:idp_username", "amcdermid"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("IDIR\\amcdermid");
  }

  @Test
  void shouldResolveBusinessBceidUserFromAccessTokenClaims() {
    Jwt accessToken =
        jwt(
            SYNTHETIC_UUID_SUBJECT,
            Map.of(
                "custom:idp_name", "bceidbusiness",
                "custom:idp_username", "industry.user"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("BCEIDBUSINESS\\industry.user");
  }

  @Test
  void shouldResolveBceidUserIdWhenUsernameClaimIsMissing() {
    Jwt accessToken =
        jwt(
            SYNTHETIC_UUID_SUBJECT,
            Map.of(
                "custom:idp_name", "dev-bceidbusiness",
                "custom:idp_user_id", "ab123456"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("DEV-BCEIDBUSINESS\\ab123456");
  }

  @Test
  void shouldResolveBcscIdentityFromStableIdpUserId() {
    Jwt accessToken =
        jwt(
            SYNTHETIC_UUID_SUBJECT,
            Map.of(
                "custom:idp_name", "ca.bc.gov.flnr.fam.test",
                "custom:idp_user_id", "bcsc-user-guid"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("BCSC\\bcsc-user-guid");
  }

  @Test
  void shouldResolveCognitoM2mClientIdWithExplicitServicePrefix() {
    Jwt accessToken =
        jwt("opaque-service-subject", Map.of("client_id", "nexcol-service-client"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("SERVICE\\nexcol-service-client");
  }

  @Test
  void shouldResolveKeycloakM2mAzpWithExplicitServicePrefix() {
    Jwt accessToken =
        jwt(
            "opaque-service-subject",
            Map.of(
                "azp", "nexcol-service-client",
                "preferred_username", "service-account-nexcol-service-client"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("SERVICE\\nexcol-service-client");
  }

  @Test
  void shouldRejectOpaqueJwtSubjectWhenNoStableIdentityExists() {
    JwtAuthenticationToken authentication =
        new JwtAuthenticationToken(jwt(SYNTHETIC_UUID_SUBJECT));

    assertThatThrownBy(() -> service.resolvePrincipalName(authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("stable audit identity");
  }

  @Test
  void shouldPreserveNonJwtPrincipalNamesForTestsAndLocalUse() {
    String principalName =
        service.resolvePrincipalName(
            new TestingAuthenticationToken("local\\developer", "n/a"));

    assertThat(principalName).isEqualTo("local\\developer");
  }

  @Test
  void shouldResolveOrgUnitFromAccessTokenClaims() {
    Jwt accessToken = jwt(SYNTHETIC_UUID_SUBJECT, Map.of("custom:org_unit_no", "76"));

    String orgUnitNo = service.resolveOrgUnitNo(new JwtAuthenticationToken(accessToken));

    assertThat(orgUnitNo).isEqualTo("76");
  }

  @Test
  void shouldResolveDistinctOrgUnitsFromListAndDelimitedClaims() {
    Jwt accessToken =
        jwt(
            SYNTHETIC_UUID_SUBJECT,
            Map.of("custom:org_unit_nos", List.of("76", "1826, 76", "invalid")));

    assertThat(service.resolveOrgUnitNumbers(new JwtAuthenticationToken(accessToken)))
        .containsExactly(76L, 1826L);
  }

  private Jwt jwt(String subject) {
    return jwt(subject, Map.of());
  }

  private Jwt jwt(String subject, Map<String, Object> additionalClaims) {
    Instant now = Instant.now();
    Map<String, Object> claims = new java.util.HashMap<>(additionalClaims);
    claims.put("sub", subject);
    claims.put("token_use", "access");
    return new Jwt(
        "token",
        now,
        now.plusSeconds(3600),
        Map.of("alg", "none"),
        claims);
  }
}

package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisPrincipalService")
class LexisPrincipalServiceTest {

  private static final String SYNTHETIC_UUID_SUBJECT =
      "00000000-0000-4000-8000-000000000001";

  @Mock private CognitoUserInfoService userInfoService;

  @Test
  void shouldResolveIdirUserFromUserInfoClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt(SYNTHETIC_UUID_SUBJECT);

    when(userInfoService.getUserInfo(accessToken))
        .thenReturn(
            Map.of(
                "custom:idp_name", "idir",
                "custom:idp_username", "amcdermid"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("IDIR\\amcdermid");
  }

  @Test
  void shouldResolveBusinessBceidUserFromUserInfoClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt(SYNTHETIC_UUID_SUBJECT);

    when(userInfoService.getUserInfo(accessToken))
        .thenReturn(
            Map.of(
                "custom:idp_name", "bceidbusiness",
                "custom:idp_username", "industry.user"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("BCEIDBUSINESS\\industry.user");
  }

  @Test
  void shouldResolveBceidUserIdWhenUsernameClaimIsMissing() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt(SYNTHETIC_UUID_SUBJECT);

    when(userInfoService.getUserInfo(accessToken))
        .thenReturn(
            Map.of(
                "custom:idp_name", "dev-bceidbusiness",
                "custom:idp_user_id", "ab123456"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("DEV-BCEIDBUSINESS\\ab123456");
  }

  @Test
  void shouldPreferTokenIdpClaimsOverUserInfoClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken =
        jwt(
            "opaque-subject",
            Map.of(
                "custom:idp_name", "idir",
                "custom:idp_username", "token-user"));

    when(userInfoService.getUserInfo(accessToken))
        .thenReturn(
            Map.of(
                "custom:idp_name", "bceidbusiness",
                "custom:idp_username", "userinfo-user"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("IDIR\\token-user");
  }

  @Test
  void shouldResolveTokenOnlyIdirIdentity() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken =
        jwt(
            "opaque-subject",
            Map.of(
                "custom:idp_name", "idir",
                "custom:idp_username", "idir-user"));

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("IDIR\\idir-user");
  }

  @Test
  void shouldResolveTokenOnlyBcscIdentityFromStableIdpUserId() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken =
        jwt(
            "opaque-subject",
            Map.of(
                "custom:idp_name", "ca.bc.gov.flnr.fam.test",
                "custom:idp_user_id", "bcsc-user-guid"));

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("BCSC\\bcsc-user-guid");
  }

  @Test
  void shouldResolveCognitoM2mClientIdWithExplicitServicePrefix() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken =
        jwt("opaque-service-subject", Map.of("client_id", "nexcol-service-client"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("SERVICE\\nexcol-service-client");
    verifyNoInteractions(userInfoService);
  }

  @Test
  void shouldResolveKeycloakM2mAzpWithExplicitServicePrefix() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken =
        jwt(
            "opaque-service-subject",
            Map.of(
                "azp", "nexcol-service-client",
                "preferred_username", "service-account-nexcol-service-client"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("SERVICE\\nexcol-service-client");
    verifyNoInteractions(userInfoService);
  }

  @Test
  void shouldRejectOpaqueJwtSubjectWhenNoStableIdentityExists() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt(SYNTHETIC_UUID_SUBJECT);

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

    JwtAuthenticationToken authentication = new JwtAuthenticationToken(accessToken);

    assertThatThrownBy(() -> service.resolvePrincipalName(authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("stable audit identity");
  }

  @Test
  void shouldPreserveNonJwtPrincipalNamesForTestsAndLocalUse() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);

    String principalName =
        service.resolvePrincipalName(
            new TestingAuthenticationToken("local\\developer", "n/a"));

    assertThat(principalName).isEqualTo("local\\developer");
    verifyNoInteractions(userInfoService);
  }

  @Test
  void shouldResolveOrgUnitFromAccessTokenClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt(SYNTHETIC_UUID_SUBJECT, Map.of("custom:org_unit_no", "76"));

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

    String orgUnitNo = service.resolveOrgUnitNo(new JwtAuthenticationToken(accessToken));

    assertThat(orgUnitNo).isEqualTo("76");
  }

  @Test
  void shouldResolveOrgUnitFromUserInfoClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt(SYNTHETIC_UUID_SUBJECT);

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of("orgUnitNo", "1826"));

    String orgUnitNo = service.resolveOrgUnitNo(new JwtAuthenticationToken(accessToken));

    assertThat(orgUnitNo).isEqualTo("1826");
  }

  @Test
  void shouldResolveDistinctOrgUnitsFromListAndDelimitedClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken =
        jwt(
            SYNTHETIC_UUID_SUBJECT,
            Map.of("custom:org_unit_nos", List.of("76", "1826, 76", "invalid")));

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

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

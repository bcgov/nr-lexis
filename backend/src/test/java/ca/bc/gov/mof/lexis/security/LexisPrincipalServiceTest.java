package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisPrincipalService")
class LexisPrincipalServiceTest {

  @Mock private CognitoUserInfoService userInfoService;

  @Test
  void shouldResolveIdirUserFromUserInfoClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt("5cdd5598-30c1-708e-3288-187b41a253e8");

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
    Jwt accessToken = jwt("5cdd5598-30c1-708e-3288-187b41a253e8");

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
    Jwt accessToken = jwt("5cdd5598-30c1-708e-3288-187b41a253e8");

    when(userInfoService.getUserInfo(accessToken))
        .thenReturn(
            Map.of(
                "custom:idp_name", "dev-bceidbusiness",
                "custom:idp_user_id", "ab123456"));

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("DEV-BCEIDBUSINESS\\ab123456");
  }

  @Test
  void shouldFallbackToJwtSubjectWhenUserInfoHasNoProfileClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt("5cdd5598-30c1-708e-3288-187b41a253e8");

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("5cdd5598-30c1-708e-3288-187b41a253e8");
  }

  @Test
  void shouldResolveOrgUnitFromAccessTokenClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken =
        jwt("5cdd5598-30c1-708e-3288-187b41a253e8", Map.of("custom:org_unit_no", "76"));

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

    String orgUnitNo = service.resolveOrgUnitNo(new JwtAuthenticationToken(accessToken));

    assertThat(orgUnitNo).isEqualTo("76");
  }

  @Test
  void shouldResolveOrgUnitFromUserInfoClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt("5cdd5598-30c1-708e-3288-187b41a253e8");

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of("orgUnitNo", "1826"));

    String orgUnitNo = service.resolveOrgUnitNo(new JwtAuthenticationToken(accessToken));

    assertThat(orgUnitNo).isEqualTo("1826");
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

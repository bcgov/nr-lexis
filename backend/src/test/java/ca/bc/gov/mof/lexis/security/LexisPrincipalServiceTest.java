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
  void shouldFallbackToJwtSubjectWhenUserInfoHasNoProfileClaims() {
    LexisPrincipalService service = new LexisPrincipalService(userInfoService);
    Jwt accessToken = jwt("5cdd5598-30c1-708e-3288-187b41a253e8");

    when(userInfoService.getUserInfo(accessToken)).thenReturn(Map.of());

    String principalName = service.resolvePrincipalName(new JwtAuthenticationToken(accessToken));

    assertThat(principalName).isEqualTo("5cdd5598-30c1-708e-3288-187b41a253e8");
  }

  private Jwt jwt(String subject) {
    Instant now = Instant.now();
    return new Jwt(
        "token",
        now,
        now.plusSeconds(3600),
        Map.of("alg", "none"),
        Map.of("sub", subject, "token_use", "access"));
  }
}

package ca.bc.gov.mof.lexis.security;

import java.security.Principal;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;

@Service
public class LexisPrincipalService {

  private final CognitoUserInfoService userInfoService;

  public LexisPrincipalService(CognitoUserInfoService userInfoService) {
    this.userInfoService = userInfoService;
  }

  public String resolvePrincipalName(Principal principal) {
    if (principal == null) {
      return null;
    }

    if (principal instanceof JwtAuthenticationToken jwtAuthentication) {
      return resolveJwtPrincipalName(jwtAuthentication);
    }

    return blankToNull(principal.getName());
  }

  public String resolveOrgUnitNo(Principal principal) {
    if (!(principal instanceof JwtAuthenticationToken jwtAuthentication)) {
      return null;
    }

    Map<String, Object> claims = resolveJwtClaims(jwtAuthentication);
    return Stream.of(
            claimValue(claims, "custom:org_unit_no"),
            claimValue(claims, "org_unit_no"),
            claimValue(claims, "orgUnitNo"))
        .filter(value -> !value.isBlank())
        .findFirst()
        .orElse(null);
  }

  private String resolveJwtPrincipalName(JwtAuthenticationToken authentication) {
    Map<String, Object> claims = resolveJwtClaims(authentication);

    String userId = resolveUserId(claims);
    if (userId != null) {
      return userId;
    }

    return blankToNull(authentication.getName());
  }

  private Map<String, Object> resolveJwtClaims(JwtAuthenticationToken authentication) {
    Jwt accessToken = authentication.getToken();
    Map<String, Object> claims = new HashMap<>(userInfoService.getUserInfo(accessToken));
    claims.putAll(accessToken.getClaims());
    return claims;
  }

  private String resolveUserId(Map<String, Object> claims) {
    String username =
        Stream.of(
                claimValue(claims, "custom:idp_username"),
                claimValue(claims, "custom:idp_user_id"),
                claimValue(claims, "preferred_username"),
                claimValue(claims, "cognito:username"),
                claimValue(claims, "email"))
            .filter(value -> !value.isBlank())
            .findFirst()
            .orElse(null);

    if (username == null) {
      return null;
    }

    String provider = resolveProvider(claims);
    if (provider == null) {
      return username;
    }
    return provider + "\\" + username;
  }

  private String resolveProvider(Map<String, Object> claims) {
    String provider = claimValue(claims, "custom:idp_name");
    if (provider.isBlank()) {
      return null;
    }
    if (provider.startsWith("ca.bc.gov.flnr.fam.")) {
      return "BCSC";
    }
    return provider.toUpperCase(Locale.ROOT);
  }

  private String claimValue(Map<String, Object> claims, String claimName) {
    Object value = claims.get(claimName);
    return value == null ? "" : value.toString().trim();
  }

  private String blankToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value;
  }
}

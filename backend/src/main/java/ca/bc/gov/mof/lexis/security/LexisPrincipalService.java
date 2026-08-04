package ca.bc.gov.mof.lexis.security;

import java.security.Principal;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;

@Service
public class LexisPrincipalService {

  private static final String SERVICE_PRINCIPAL_PREFIX = "SERVICE\\";

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
    return resolveOrgUnitNumbers(principal).stream().findFirst().map(String::valueOf).orElse(null);
  }

  public List<Long> resolveOrgUnitNumbers(Principal principal) {
    if (!(principal instanceof JwtAuthenticationToken jwtAuthentication)) {
      return List.of();
    }

    Map<String, Object> claims = jwtAuthentication.getToken().getClaims();
    LinkedHashSet<Long> orgUnits = new LinkedHashSet<>();
    Stream.of(
            claims.get("custom:org_unit_no"),
            claims.get("org_unit_no"),
            claims.get("orgUnitNo"),
            claims.get("custom:org_unit_nos"),
            claims.get("org_unit_nos"),
            claims.get("orgUnitNos"))
        .forEach(value -> appendPositiveLongs(orgUnits, value));
    return List.copyOf(orgUnits);
  }

  private void appendPositiveLongs(LinkedHashSet<Long> values, Object claim) {
    if (claim == null) {
      return;
    }
    if (claim instanceof Collection<?> collection) {
      collection.forEach(value -> appendPositiveLongs(values, value));
      return;
    }
    for (String token : claim.toString().split("[,\\s]+")) {
      try {
        long parsed = Long.parseLong(token.trim());
        if (parsed > 0) {
          values.add(parsed);
        }
      } catch (NumberFormatException ignored) {
        // Ignore malformed optional organization-unit metadata; it is not an authorization scope.
      }
    }
  }

  private String resolveJwtPrincipalName(JwtAuthenticationToken authentication) {
    Map<String, Object> accessTokenClaims = authentication.getToken().getClaims();
    String serviceClientId = resolveServiceClientId(accessTokenClaims);
    if (serviceClientId != null) {
      return SERVICE_PRINCIPAL_PREFIX + serviceClientId;
    }

    Map<String, Object> claims = accessTokenClaims;

    String userId = resolveUserId(claims);
    if (userId != null) {
      return userId;
    }

    throw new AccessDeniedException(
        "Authenticated JWT does not contain a stable audit identity.");
  }

  private String resolveUserId(Map<String, Object> claims) {
    String username =
        Stream.of(
                claimValue(claims, "custom:idp_username"),
                claimValue(claims, "custom:idp_user_id"),
                claimValue(claims, "preferred_username"),
                claimValue(claims, "username"),
                claimValue(claims, "cognito:username"))
            .filter(value -> !value.isBlank())
            .filter(value -> !isServiceAccountUsername(value))
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

  private String resolveServiceClientId(Map<String, Object> claims) {
    String clientId =
        Stream.of(claimValue(claims, "client_id"), claimValue(claims, "azp"))
            .filter(value -> !value.isBlank())
            .findFirst()
            .orElse(null);
    if (clientId == null || hasInteractiveIdentitySignal(claims)) {
      return null;
    }
    return clientId;
  }

  private boolean hasInteractiveIdentitySignal(Map<String, Object> claims) {
    if (Stream.of(
            "custom:idp_name",
            "custom:idp_username",
            "custom:idp_user_id",
            "username",
            "cognito:username",
            "email",
            "cognito:groups")
        .map(claims::get)
        .anyMatch(this::hasClaimValue)) {
      return true;
    }

    String preferredUsername = claimValue(claims, "preferred_username");
    return !preferredUsername.isBlank() && !isServiceAccountUsername(preferredUsername);
  }

  private boolean hasClaimValue(Object claim) {
    if (claim == null) {
      return false;
    }
    if (claim instanceof Collection<?> values) {
      return !values.isEmpty();
    }
    return !claim.toString().isBlank();
  }

  private boolean isServiceAccountUsername(String username) {
    return username.toLowerCase(Locale.ROOT).startsWith("service-account-");
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

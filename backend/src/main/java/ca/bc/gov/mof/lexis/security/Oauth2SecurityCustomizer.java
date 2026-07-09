package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import com.nimbusds.jwt.SignedJWT;
import java.net.URI;
import java.text.ParseException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.oauth2.server.resource.OAuth2ResourceServerConfigurer;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class Oauth2SecurityCustomizer
    implements Customizer<OAuth2ResourceServerConfigurer<HttpSecurity>> {

  private final JwtDecoder jwtDecoder;
  private final LexisSessionService sessionService;

  public Oauth2SecurityCustomizer(
      @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}") String cognitoJwkSetUri,
      @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}") String cognitoIssuerUri,
      @Value("${lexis.auth.keycloak.issuer-uri:}") String keycloakIssuerUri,
      @Value("${lexis.auth.keycloak.additional-issuer-uris:}") String additionalKeycloakIssuerUris,
      @Value("${lexis.auth.keycloak.jwk-set-uri:}") String keycloakJwkSetUri,
      LexisSessionService sessionService) {

    String normalizedCognitoIssuerUri = normalizeIssuerUri(cognitoIssuerUri);
    Map<String, JwtDecoder> decoders = new LinkedHashMap<>();
    decoders.put(
        normalizedCognitoIssuerUri,
        createDecoder(
            normalizedCognitoIssuerUri,
            cognitoJwkSetUri,
            "spring.security.oauth2.resourceserver.jwt.issuer-uri",
            "spring.security.oauth2.resourceserver.jwt.jwk-set-uri"));

    if (StringUtils.hasText(keycloakIssuerUri)) {
      String normalizedKeycloakIssuerUri = normalizeIssuerUri(keycloakIssuerUri);
      String resolvedKeycloakJwkSetUri =
          resolveKeycloakJwkSetUri(normalizedKeycloakIssuerUri, keycloakJwkSetUri);
      decoders.put(
          normalizedKeycloakIssuerUri,
          createDecoder(
              normalizedKeycloakIssuerUri,
              resolvedKeycloakJwkSetUri,
              "lexis.auth.keycloak.issuer-uri",
              "lexis.auth.keycloak.jwk-set-uri"));
    }

    for (String additionalIssuerUri : splitIssuerUris(additionalKeycloakIssuerUris)) {
      String normalizedAdditionalIssuerUri = normalizeIssuerUri(additionalIssuerUri);
      decoders.putIfAbsent(
          normalizedAdditionalIssuerUri,
          createDecoder(
              normalizedAdditionalIssuerUri,
              resolveKeycloakJwkSetUri(normalizedAdditionalIssuerUri, ""),
              "lexis.auth.keycloak.additional-issuer-uris",
              "lexis.auth.keycloak.additional-issuer-uris"));
    }

    this.jwtDecoder = token -> decodeWithIssuer(decoders, token);
    this.sessionService = sessionService;
  }

  @Override
  public void customize(OAuth2ResourceServerConfigurer<HttpSecurity> customize) {
    customize.jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(converter()));
  }

  private Converter<Jwt, AbstractAuthenticationToken> converter() {
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(this::normalizedAuthorities);
    return converter;
  }

  List<GrantedAuthority> normalizedAuthorities(Jwt jwt) {
    LinkedHashSet<String> authorities = new LinkedHashSet<>();

    List<String> groups = jwt.getClaimAsStringList("cognito:groups");
    if (groups != null && !groups.isEmpty()) {
      authorities.addAll(sessionService.parseRoleHeader(String.join(",", groups)));
    }

    authorities.addAll(normalizedScopeAuthorities(jwt));

    return authorities.stream()
        .map(authority -> (GrantedAuthority) new SimpleGrantedAuthority(authority))
        .toList();
  }

  private List<String> normalizedScopeAuthorities(Jwt jwt) {
    LinkedHashSet<String> scopes = new LinkedHashSet<>();

    String scopeClaim = jwt.getClaimAsString("scope");
    if (StringUtils.hasText(scopeClaim)) {
      Arrays.stream(scopeClaim.split("\\s+"))
          .map(String::trim)
          .filter(scope -> !scope.isEmpty())
          .forEach(scopes::add);
    }

    List<String> scpClaim = jwt.getClaimAsStringList("scp");
    if (scpClaim != null && !scpClaim.isEmpty()) {
      scpClaim.stream()
          .map(String::trim)
          .filter(scope -> !scope.isEmpty())
          .forEach(scopes::add);
    }

    addClaimList(scopes, jwt.getClaimAsStringList("client_roles"));
    addResourceAccessRoles(scopes, jwt.getClaim("resource_access"));

    return scopes.stream()
        .map(scope -> "SCOPE_" + scope)
        .toList();
  }

  private static void addClaimList(LinkedHashSet<String> scopes, List<String> claimValues) {
    if (claimValues == null || claimValues.isEmpty()) {
      return;
    }
    claimValues.stream()
        .map(String::trim)
        .filter(scope -> !scope.isEmpty())
        .forEach(scopes::add);
  }

  private static void addResourceAccessRoles(LinkedHashSet<String> scopes, Object resourceAccess) {
    if (!(resourceAccess instanceof Map<?, ?> resourceAccessMap)) {
      return;
    }
    for (Object clientAccess : resourceAccessMap.values()) {
      if (!(clientAccess instanceof Map<?, ?> clientAccessMap)) {
        continue;
      }
      Object roles = clientAccessMap.get("roles");
      if (!(roles instanceof List<?> roleList)) {
        continue;
      }
      roleList.stream()
          .filter(String.class::isInstance)
          .map(String.class::cast)
          .map(String::trim)
          .filter(role -> !role.isEmpty())
          .forEach(scopes::add);
    }
  }

  private static Jwt decodeWithIssuer(Map<String, JwtDecoder> decoders, String token) {
    String issuer = tokenIssuer(token);
    JwtDecoder decoder = decoders.get(issuer);
    if (decoder == null) {
      throw new JwtException("Unsupported token issuer: " + issuer);
    }
    return decoder.decode(token);
  }

  private static String tokenIssuer(String token) {
    try {
      String issuer = SignedJWT.parse(token).getJWTClaimsSet().getIssuer();
      if (!StringUtils.hasText(issuer)) {
        throw new JwtException("JWT issuer is missing");
      }
      return issuer;
    } catch (ParseException exception) {
      throw new JwtException("Unable to parse JWT issuer", exception);
    }
  }

  private static JwtDecoder createDecoder(
      String issuerUri, String jwkSetUri, String issuerPropertyName, String jwkSetPropertyName) {
    requireAbsoluteUri(issuerUri, issuerPropertyName);
    requireAbsoluteUri(jwkSetUri, jwkSetPropertyName);

    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuerUri), accessTokenUseValidator()));
    return decoder;
  }

  static OAuth2TokenValidator<Jwt> accessTokenUseValidator() {
    return token -> {
      String tokenUse = token.getClaimAsString("token_use");
      if (StringUtils.hasText(tokenUse) && !"access".equals(tokenUse)) {
        return OAuth2TokenValidatorResult.failure(
            new OAuth2Error(
                "invalid_token",
                "Only access tokens are accepted (received token_use=" + tokenUse + ")",
                null));
      }
      return OAuth2TokenValidatorResult.success();
    };
  }

  private static String resolveKeycloakJwkSetUri(String issuerUri, String configuredJwkSetUri) {
    if (StringUtils.hasText(configuredJwkSetUri)) {
      return configuredJwkSetUri;
    }
    return issuerUri + "/protocol/openid-connect/certs";
  }

  static String normalizeIssuerUri(String issuerUri) {
    if (issuerUri == null) {
      return null;
    }
    return issuerUri.replaceAll("/+$", "");
  }

  static List<String> splitIssuerUris(String issuerUris) {
    if (!StringUtils.hasText(issuerUris)) {
      return List.of();
    }
    return Arrays.stream(issuerUris.split(","))
        .map(String::trim)
        .filter(StringUtils::hasText)
        .toList();
  }

  private static void requireAbsoluteUri(String value, String propertyName) {
    if (!StringUtils.hasText(value)) {
      throw new IllegalStateException(propertyName + " must be configured");
    }

    URI uri;
    try {
      uri = URI.create(value);
    } catch (IllegalArgumentException exception) {
      throw new IllegalStateException(propertyName + " must be a valid absolute URI", exception);
    }

    if (!uri.isAbsolute()) {
      throw new IllegalStateException(propertyName + " must be an absolute URI");
    }
  }
}

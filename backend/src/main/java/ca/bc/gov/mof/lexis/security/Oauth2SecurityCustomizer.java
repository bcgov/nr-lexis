package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.util.DefaultResourceRetriever;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import com.nimbusds.jwt.proc.JWTProcessor;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.text.ParseException;
import java.time.Duration;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class Oauth2SecurityCustomizer
    implements Customizer<OAuth2ResourceServerConfigurer<HttpSecurity>> {

  private static final Set<String> STAFF_IDENTITY_PROVIDERS = Set.of("idir", "azureidir");
  private static final String IDP_BCEID_BUSINESS = "bceidbusiness";
  private static final String ROLE_PROVINCIAL_SUBMITTER = "LEXIS_PROVINCIAL_SUBMITTER";
  private static final Set<String> STAFF_ROLES =
      Set.of(
          "LEXIS_ADMIN",
          "LEXIS_READ_ONLY",
          "LEXIS_APPLICATION_APPROVER",
          "LEXIS_EXEMPTION_APPROVER");
  private static final int JWKS_CONNECT_TIMEOUT_MILLIS = (int) Duration.ofSeconds(10).toMillis();
  private static final int JWKS_READ_TIMEOUT_MILLIS = (int) Duration.ofSeconds(15).toMillis();
  private static final int JWKS_SIZE_LIMIT_BYTES = 50 * 1024;

  private final JwtDecoder jwtDecoder;
  private final LexisSessionService sessionService;
  private final String interactiveIssuerUri;
  private final String expectedClientId;
  private final String keycloakIssuerUri;

  public Oauth2SecurityCustomizer(
      @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}") String interactiveJwkSetUri,
      @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}") String interactiveIssuerUri,
      @Value("${lexis.auth.oidc.client-id}") String expectedClientId,
      @Value("${lexis.auth.keycloak.issuer-uri:}") String keycloakIssuerUri,
      @Value("${lexis.auth.keycloak.jwk-set-uri:}") String keycloakJwkSetUri,
      LexisSessionService sessionService) {

    this.interactiveIssuerUri = normalizeIssuerUri(interactiveIssuerUri);
    if (!StringUtils.hasText(expectedClientId)) {
      throw new IllegalStateException("lexis.auth.oidc.client-id must be configured");
    }
    this.expectedClientId = expectedClientId;
    Map<String, JwtDecoder> decoders = new LinkedHashMap<>();
    decoders.put(
        this.interactiveIssuerUri,
        createDecoder(
            this.interactiveIssuerUri,
            resolveJwkSetUri(this.interactiveIssuerUri, interactiveJwkSetUri),
            "spring.security.oauth2.resourceserver.jwt.issuer-uri",
            "spring.security.oauth2.resourceserver.jwt.jwk-set-uri",
            interactiveTokenValidator()));

    String normalizedKeycloakIssuerUri = null;
    if (StringUtils.hasText(keycloakIssuerUri)) {
      normalizedKeycloakIssuerUri = normalizeIssuerUri(keycloakIssuerUri);
      if (this.interactiveIssuerUri.equals(normalizedKeycloakIssuerUri)) {
        throw new IllegalStateException("Interactive and machine JWT issuers must be distinct");
      }
      String resolvedKeycloakJwkSetUri =
          resolveJwkSetUri(normalizedKeycloakIssuerUri, keycloakJwkSetUri);
      decoders.put(
          normalizedKeycloakIssuerUri,
          createDecoder(
              normalizedKeycloakIssuerUri,
              resolvedKeycloakJwkSetUri,
              "lexis.auth.keycloak.issuer-uri",
              "lexis.auth.keycloak.jwk-set-uri",
              accessTokenUseValidator()));
    }

    this.keycloakIssuerUri = normalizedKeycloakIssuerUri;
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
    String tokenIssuer = normalizeIssuerUri(jwt.getClaimAsString("iss"));

    if (interactiveIssuerUri.equals(tokenIssuer)
        && expectedClientId.equals(jwt.getClaimAsString("azp"))) {
      authorities.addAll(
          sessionService.parseGrantedAuthorities(
              identityCompatibleFamRoles(clientRoles(jwt), jwt.getClaimAsString("identity_provider"))));
    } else if (keycloakIssuerUri != null && keycloakIssuerUri.equals(tokenIssuer)) {
      authorities.addAll(normalizedScopeAuthorities(jwt));
    }

    return authorities.stream()
        .map(authority -> (GrantedAuthority) new SimpleGrantedAuthority(authority))
        .toList();
  }

  private List<String> clientRoles(Jwt jwt) {
    List<String> roles = stringRoles(jwt.getClaim("client_roles"));
    if (!roles.isEmpty()) {
      return roles;
    }
    Object resourceAccess = jwt.getClaim("resource_access");
    if (resourceAccess instanceof Map<?, ?> byClient
        && byClient.get(expectedClientId) instanceof Map<?, ?> client) {
      return stringRoles(client.get("roles"));
    }
    return List.of();
  }

  private static List<String> stringRoles(Object claim) {
    // Case and padding are normalized so a role's spelling cannot change what it grants.
    return claim instanceof List<?> values
        ? values.stream()
            .filter(String.class::isInstance)
            .map(value -> ((String) value).trim().toUpperCase(Locale.ROOT))
            .filter(role -> !role.isEmpty())
            .toList()
        : List.of();
  }

  private static boolean isStaffIdentityProvider(String identityProvider) {
    return identityProvider != null && STAFF_IDENTITY_PROVIDERS.contains(identityProvider);
  }

  private static List<String> identityCompatibleFamRoles(
      List<String> roles, String identityProvider) {
    // Preserve the approved IDIR staff / Business BCeID separation and the internal
    // forest-client authority contract used throughout business authorization.
    if (isStaffIdentityProvider(identityProvider)) {
      // Retain the concrete regional grant without adding its unscoped base role. The grant
      // passes route checks with its role's actions; only ProvincialAuthorizationService limits
      // it to its regions, so every record endpoint must apply those checks.
      return roles.stream()
          .filter(role -> STAFF_ROLES.contains(role) || FamRegionGrant.parse(role).isPresent())
          .toList();
    }
    if (!IDP_BCEID_BUSINESS.equals(identityProvider)) {
      return List.of();
    }
    return roles.stream()
        .map(
            role -> {
              if ("LEXIS_FEDERAL_READ_ONLY".equals(role)) {
                return role;
              }
              String prefix = ROLE_PROVINCIAL_SUBMITTER + "_FOREST_CLIENT-";
              if (role.startsWith(prefix) && role.substring(prefix.length()).matches("[0-9]{8}")) {
                return ROLE_PROVINCIAL_SUBMITTER + "_" + role.substring(prefix.length());
              }
              return null;
            })
        .filter(Objects::nonNull)
        .toList();
  }

  private OAuth2TokenValidator<Jwt> interactiveTokenValidator() {
    return token -> {
      String provider = token.getClaimAsString("identity_provider");
      if (!expectedClientId.equals(token.getClaimAsString("azp"))
          // Keycloak's payload typ distinguishes access tokens from ID / refresh tokens.
          || !"Bearer".equals(token.getClaimAsString("typ"))
          || token.getExpiresAt() == null
          || !(isStaffIdentityProvider(provider) || IDP_BCEID_BUSINESS.equals(provider))) {
        return OAuth2TokenValidatorResult.failure(
            new OAuth2Error("invalid_token", "A LEXIS user access token is required.", null));
      }
      return OAuth2TokenValidatorResult.success();
    };
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

    return scopes.stream()
        .map(scope -> "SCOPE_" + scope)
        .toList();
  }

  private static Jwt decodeWithIssuer(Map<String, JwtDecoder> decoders, String token) {
    String issuer = tokenIssuer(token);
    JwtDecoder decoder = decoders.get(issuer);
    if (decoder == null) {
      throw new BadJwtException("Unsupported token issuer");
    }
    return decoder.decode(token);
  }

  private static String tokenIssuer(String token) {
    try {
      String issuer = SignedJWT.parse(token).getJWTClaimsSet().getIssuer();
      if (!StringUtils.hasText(issuer)) {
        throw new BadJwtException("JWT issuer is missing");
      }
      return issuer;
    } catch (ParseException exception) {
      throw new BadJwtException("Unable to parse JWT issuer", exception);
    }
  }

  static JwtDecoder createDecoder(
      String issuerUri,
      String jwkSetUri,
      String issuerPropertyName,
      String jwkSetPropertyName,
      OAuth2TokenValidator<Jwt> tokenValidator) {
    requireAbsoluteUri(issuerUri, issuerPropertyName);
    requireAbsoluteUri(jwkSetUri, jwkSetPropertyName);

    NimbusJwtDecoder decoder = new NimbusJwtDecoder(jwtProcessor(jwkSetUri, jwkSetPropertyName));
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuerUri), tokenValidator));
    return decoder;
  }

  /**
   * Spring's JWK-set decoder caches keys for five minutes, then refetches them on a request thread
   * with no timeout or retry, so a slow SSO response at that moment fails the request with a 401.
   * As in nr-rept, keys are refreshed before they expire, a failed fetch is retried once and each
   * fetch is time-bounded. Otherwise this matches Spring's processor: RS256 signatures, with the
   * claims left to the token validators.
   */
  private static JWTProcessor<SecurityContext> jwtProcessor(
      String jwkSetUri, String jwkSetPropertyName) {
    URL jwkSetUrl;
    try {
      jwkSetUrl = URI.create(jwkSetUri).toURL();
    } catch (IllegalArgumentException | MalformedURLException exception) {
      throw new IllegalStateException(jwkSetPropertyName + " must be a valid URL", exception);
    }
    JWKSource<SecurityContext> jwkSource =
        JWKSourceBuilder.create(
                jwkSetUrl,
                new DefaultResourceRetriever(
                    JWKS_CONNECT_TIMEOUT_MILLIS, JWKS_READ_TIMEOUT_MILLIS, JWKS_SIZE_LIMIT_BYTES))
            .retrying(true)
            .refreshAheadCache(true)
            .build();
    DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
    processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, jwkSource));
    processor.setJWTClaimsSetVerifier((claims, context) -> {});
    return processor;
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

  private static String resolveJwkSetUri(String issuerUri, String configuredJwkSetUri) {
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

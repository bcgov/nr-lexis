package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.net.URI;
import java.util.List;
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
      @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}") String jwkSetUri,
      @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}") String issuerUri,
      LexisSessionService sessionService) {

    requireAbsoluteUri(issuerUri, "spring.security.oauth2.resourceserver.jwt.issuer-uri");
    requireAbsoluteUri(jwkSetUri, "spring.security.oauth2.resourceserver.jwt.jwk-set-uri");

    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
    OAuth2TokenValidator<Jwt> tokenUseValidator =
        token -> {
          String tokenUse = token.getClaimAsString("token_use");
          if (!"access".equals(tokenUse)) {
            return OAuth2TokenValidatorResult.failure(
                new OAuth2Error(
                    "invalid_token",
                    "Only access tokens are accepted (received token_use=" + tokenUse + ")",
                    null));
          }
          return OAuth2TokenValidatorResult.success();
        };

    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuerUri), tokenUseValidator));
    this.jwtDecoder = decoder;
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

  private List<GrantedAuthority> normalizedAuthorities(Jwt jwt) {
    List<String> groups = jwt.getClaimAsStringList("cognito:groups");
    if (groups == null || groups.isEmpty()) {
      return List.of();
    }

    List<String> normalizedRoles = sessionService.parseRoleHeader(String.join(",", groups));
    return normalizedRoles.stream()
        .map(role -> (GrantedAuthority) new SimpleGrantedAuthority(role))
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

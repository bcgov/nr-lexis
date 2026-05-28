package ca.bc.gov.mof.lexis.configuration;

import ca.bc.gov.mof.lexis.security.LexisApiAuthorizationCustomizer;
import ca.bc.gov.mof.lexis.security.Oauth2SecurityCustomizer;
import ca.bc.gov.mof.lexis.security.CsrfCookieFilter;
import ca.bc.gov.mof.lexis.security.CsrfSecurityCustomizer;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfiguration {

  @Value("${ALLOWED_ORIGINS:http://localhost:3000}")
  private String allowedOrigins;

  @Bean
  public SecurityFilterChain filterChain(
      HttpSecurity http,
      CsrfSecurityCustomizer csrfCustomizer,
      CsrfCookieFilter csrfCookieFilter,
      ObjectProvider<Oauth2SecurityCustomizer> oauth2CustomizerProvider,
      ObjectProvider<LexisApiAuthorizationCustomizer> apiAuthorizationCustomizerProvider,
      @Value("${lexis.auth.cognito.enabled:false}") boolean cognitoEnabled,
      @Value("${lexis.auth.cognito.enforce-route-auth:false}") boolean enforceRouteAuth)
      throws Exception {

    http
        .csrf(csrfCustomizer)
        .addFilterAfter(csrfCookieFilter, BasicAuthenticationFilter.class)
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .cors(Customizer.withDefaults());

    if (enforceRouteAuth) {
      LexisApiAuthorizationCustomizer apiAuthorizationCustomizer =
          apiAuthorizationCustomizerProvider.getIfAvailable();
      if (apiAuthorizationCustomizer == null) {
        throw new IllegalStateException(
            "lexis.auth.cognito.enforce-route-auth=true but API authorization customizer is not available");
      }
      http.authorizeHttpRequests(apiAuthorizationCustomizer);
    } else {
      http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll());
    }

    if (cognitoEnabled) {
      Oauth2SecurityCustomizer oauth2Customizer = oauth2CustomizerProvider.getIfAvailable();
      if (oauth2Customizer == null) {
        throw new IllegalStateException(
            "lexis.auth.cognito.enabled=true but OAuth2 customizer is not available");
      }
      http.oauth2ResourceServer(oauth2Customizer);
    }

    return http.build();
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    List<String> origins =
        Arrays.stream(allowedOrigins.split(","))
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .toList();

    configuration.setAllowedOrigins(origins);
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setAllowCredentials(true);
    configuration.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }
}

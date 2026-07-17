package ca.bc.gov.mof.lexis.configuration;

import ca.bc.gov.mof.lexis.security.LexisApiAuthorizationCustomizer;
import ca.bc.gov.mof.lexis.security.Oauth2SecurityCustomizer;
import ca.bc.gov.mof.lexis.security.CsrfCookieFilter;
import ca.bc.gov.mof.lexis.security.CsrfSecurityCustomizer;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockHeaders;
import java.util.Arrays;
import java.util.List;
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
      Oauth2SecurityCustomizer oauth2Customizer,
      LexisApiAuthorizationCustomizer apiAuthorizationCustomizer)
      throws Exception {

    http
        .csrf(csrfCustomizer)
        .addFilterAfter(csrfCookieFilter, BasicAuthenticationFilter.class)
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .cors(Customizer.withDefaults());

    http.authorizeHttpRequests(apiAuthorizationCustomizer);
    http.oauth2ResourceServer(oauth2Customizer);

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
    configuration.setExposedHeaders(List.of(OptimisticLockHeaders.RECORD_VERSION, "ETag"));
    configuration.setAllowCredentials(true);
    configuration.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }
}

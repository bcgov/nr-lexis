package ca.bc.gov.mof.lexis.configuration;

import ca.bc.gov.mof.lexis.security.LexisApiAuthorizationCustomizer;
import ca.bc.gov.mof.lexis.security.Oauth2SecurityCustomizer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfiguration {

  @Bean
  public SecurityFilterChain filterChain(
      HttpSecurity http,
      ObjectProvider<Oauth2SecurityCustomizer> oauth2CustomizerProvider,
      ObjectProvider<LexisApiAuthorizationCustomizer> apiAuthorizationCustomizerProvider,
      @Value("${lexis.auth.cognito.enabled:false}") boolean cognitoEnabled,
      @Value("${lexis.auth.cognito.enforce-route-auth:false}") boolean enforceRouteAuth)
      throws Exception {

    http
        .csrf(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable);

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
}

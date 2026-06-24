package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.security.LexisApiAuthorizationRules.Rule;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import java.util.List;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

@Component
public class LexisApiAuthorizationCustomizer
    implements
        Customizer<
            AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry> {

  private final LexisAuthorizationService authorizationService;

  public LexisApiAuthorizationCustomizer(LexisAuthorizationService authorizationService) {
    this.authorizationService = authorizationService;
  }

  @Override
  public void customize(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize) {

    for (Rule rule : LexisApiAuthorizationRules.rules()) {
      switch (rule.type()) {
        case PERMIT_ALL -> authorize.requestMatchers(rule.method(), rule.patternsArray()).permitAll();
        case ADMIN_AUTHORITY -> authorize.requestMatchers(rule.patternsArray()).hasAuthority("LEXIS_ADMIN");
        case KNOWN_ROLE -> authorizeKnownRoles(authorize, rule);
        case ACTION -> authorizeAction(authorize, rule);
      }
    }

    authorize.anyRequest().denyAll();
  }

  private void authorizeKnownRoles(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      Rule rule) {
    authorize
        .requestMatchers(rule.patternsArray())
        .access(
            (authentication, context) ->
                new AuthorizationDecision(
                    authorizationService.hasKnownRole(getAuthorities(authentication.get()))));
  }

  private void authorizeAction(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      Rule rule) {
    authorize
        .requestMatchers(rule.method(), rule.patternsArray())
        .access(
            (authentication, context) ->
                new AuthorizationDecision(
                    authorizationService.canPerformAction(
                        getAuthorities(authentication.get()),
                        rule.requiredAction(context.getRequest().getParameter("actionMapping")))));
  }

  private List<String> getAuthorities(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return List.of();
    }
    return authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
  }
}

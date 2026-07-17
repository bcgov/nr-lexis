package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.configuration.LexisFeatureProperties;
import ca.bc.gov.mof.lexis.security.LexisApiAuthorizationRules.Rule;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import java.util.List;
import org.springframework.http.HttpMethod;
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

  private static final String ACTION_LEXIS_AGENT_ADMIN = "/lexisAgentAdmin";
  private static final String[] HEALTH_PROBE_PATTERNS = {
    "/actuator/health/liveness", "/actuator/health/readiness"
  };
  private static final String[] PROD_RTM_ONLY_SESSION_PATTERNS = {
    "/api/lexis/session/**",
    "/api/lexis/showWelcome",
    "/api/lexis/showWelcome.do",
    "/api/lexis/logoff",
    "/api/lexis/logoff.do",
    "/api/lexis/accessDenied",
    "/api/lexis/accessDenied.do",
    "/api/lexis/errorPage",
    "/api/lexis/errorPage.do"
  };
  private static final String[] PROD_RTM_ONLY_GET_PATTERNS = {
    "/api/lexis/rpc/application-details/species-codes",
    "/api/lexis/rtm/emslogamv"
  };
  private static final String[] PROD_RTM_ONLY_POST_PATTERNS = {
    "/api/lexis/rtm/emslogamv/batch"
  };

  private final LexisAuthorizationService authorizationService;
  private final LexisFeatureProperties featureProperties;

  public LexisApiAuthorizationCustomizer(
      LexisAuthorizationService authorizationService, LexisFeatureProperties featureProperties) {
    this.authorizationService = authorizationService;
    this.featureProperties = featureProperties;
  }

  @Override
  public void customize(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize) {

    if (featureProperties.isProdRtmOnly()) {
      authorizeProdRtmOnlyMode(authorize);
      return;
    }

    for (Rule rule : LexisApiAuthorizationRules.rules()) {
      switch (rule.type()) {
        case PERMIT_ALL -> authorize.requestMatchers(rule.method(), rule.patternsArray()).permitAll();
        case ADMIN_AUTHORITY ->
            authorize.requestMatchers(rule.patternsArray()).hasAuthority("LEXIS_ADMIN");
        case KNOWN_ROLE -> authorizeKnownRoles(authorize, rule);
        case ACTION -> authorizeAction(authorize, rule);
        case ANY_ACTION -> authorizeAnyAction(authorize, rule);
      }
    }

    authorize.anyRequest().denyAll();
  }

  private void authorizeProdRtmOnlyMode(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize) {
    authorize.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();
    authorize.requestMatchers(HttpMethod.GET, HEALTH_PROBE_PATTERNS).permitAll();
    authorizeKnownRoles(authorize, PROD_RTM_ONLY_SESSION_PATTERNS);
    authorizeFixedAction(
        authorize, HttpMethod.GET, ACTION_LEXIS_AGENT_ADMIN, PROD_RTM_ONLY_GET_PATTERNS);
    authorizeFixedAction(
        authorize, HttpMethod.POST, ACTION_LEXIS_AGENT_ADMIN, PROD_RTM_ONLY_POST_PATTERNS);
    authorize.anyRequest().denyAll();
  }

  private void authorizeKnownRoles(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      Rule rule) {
    authorizeKnownRoles(authorize, rule.patternsArray());
  }

  private void authorizeKnownRoles(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      String... patterns) {
    authorize
        .requestMatchers(patterns)
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

  private void authorizeAnyAction(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      Rule rule) {
    authorize
        .requestMatchers(rule.method(), rule.patternsArray())
        .access(
            (authentication, context) -> {
              List<String> authorities = getAuthorities(authentication.get());
              return new AuthorizationDecision(
                  rule.alternativeActions().stream()
                      .anyMatch(
                          action ->
                              authorizationService.canPerformAction(authorities, action)));
            });
  }

  private void authorizeFixedAction(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      HttpMethod method,
      String requiredAction,
      String... patterns) {
    authorize
        .requestMatchers(method, patterns)
        .access(
            (authentication, context) ->
                new AuthorizationDecision(
                    authorizationService.canPerformAction(
                        getAuthorities(authentication.get()),
                        requiredAction)));
  }

  private List<String> getAuthorities(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return List.of();
    }
    return authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
  }
}

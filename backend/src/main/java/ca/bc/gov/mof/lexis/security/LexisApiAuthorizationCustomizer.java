package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.security.LexisApiAuthorizationRules.Rule;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
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

    // Preserve the status selected by Spring for an already-authorized request instead of
    // replacing its error dispatch with an unrelated 403 response.
    authorize.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll();

    for (Rule rule : LexisApiAuthorizationRules.rules()) {
      switch (rule.type()) {
        case PERMIT_ALL -> authorize.requestMatchers(rule.method(), rule.patternsArray()).permitAll();
        case AUTHENTICATED ->
            authorize.requestMatchers(rule.method(), rule.patternsArray()).authenticated();
        case DENY_ALL -> {
          if (rule.method() == null) {
            authorize.requestMatchers(rule.patternsArray()).denyAll();
          } else {
            authorize.requestMatchers(rule.method(), rule.patternsArray()).denyAll();
          }
        }
        case ADMIN_AUTHORITY ->
            authorize.requestMatchers(rule.patternsArray()).hasAuthority("LEXIS_ADMIN");
        case PROVINCIAL_STAFF_ROLE -> authorizeProvincialStaffRoles(authorize, rule.patternsArray());
        case KNOWN_ROLE -> authorizeKnownRoles(authorize, rule);
        case ACTION -> authorizeAction(authorize, rule);
        case ANY_ACTION -> authorizeAnyAction(authorize, rule);
      }
    }

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

  private void authorizeProvincialStaffRoles(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      String... patterns) {
    authorize
        .requestMatchers(patterns)
        .access(
            (authentication, context) ->
                new AuthorizationDecision(
                    authorizationService.hasProvincialStaffRole(
                        getAuthorities(authentication.get()))));
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
                    decideActions(
                        authentication.get(),
                        context.getRequest(),
                        actionList(
                            rule.requiredAction(
                                context.getRequest().getParameter("actionMapping"))))));
  }

  private void authorizeAnyAction(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      Rule rule) {
    authorize
        .requestMatchers(rule.method(), rule.patternsArray())
        .access(
            (authentication, context) ->
                new AuthorizationDecision(
                    decideActions(
                        authentication.get(), context.getRequest(), rule.alternativeActions())));
  }

  /**
   * Grants when the user holds any of the actions, and records the ones they hold so record checks
   * apply the regions of what this request does.
   */
  private boolean decideActions(
      Authentication authentication, HttpServletRequest request, List<String> actions) {
    List<String> authorities = getAuthorities(authentication);
    List<String> granted =
        actions.stream()
            .filter(action -> authorizationService.canPerformAction(authorities, action))
            .toList();
    LexisRequestActions.record(request, granted);
    return !granted.isEmpty();
  }

  private static List<String> actionList(String action) {
    return action == null ? List.of() : List.of(action);
  }

  private List<String> getAuthorities(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return List.of();
    }
    return authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
  }
}

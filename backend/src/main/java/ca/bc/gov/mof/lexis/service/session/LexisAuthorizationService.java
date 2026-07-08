package ca.bc.gov.mof.lexis.service.session;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import ca.bc.gov.mof.lexis.configuration.LexisFeatureProperties;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class LexisAuthorizationService {

  private static final String ALL_ACTIONS_TOKEN = "*";
  private static final String INDUSTRY_ROLE_KEY = "INDUSTRY";
  private static final String SCOPE_AUTHORITY_PREFIX = "SCOPE_";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String ROLE_EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final String ROLE_PROVINCIAL_SUBMITTER = "LEXIS_PROVINCIAL_SUBMITTER";
  private static final Set<String> PROD_RTM_ONLY_ACTIONS = Set.of("/lexisAgentAdmin");

  private final Set<String> configuredIndustryRoles;
  private final Map<String, List<String>> configuredRoleActions;
  private final LexisFeatureProperties featureProperties;
  private final Map<String, List<String>> configuredScopeActions;
  private final LexisSessionService sessionService;

  public LexisAuthorizationService(
      LexisAuthorizationProperties authorizationProperties,
      LexisFeatureProperties featureProperties,
      LexisSessionService sessionService) {
    this.sessionService = sessionService;
    this.featureProperties = featureProperties;
    this.configuredIndustryRoles = Set.copyOf(sessionService.getConfiguredIndustryRoles());
    this.configuredRoleActions = normalizeRoleActions(authorizationProperties.getRoleActions());
    this.configuredScopeActions = normalizeScopeActions(authorizationProperties.getScopeActions());
  }

  public List<String> resolveGrantedActions(List<String> rawAuthorities) {
    List<String> roles = normalizeRoles(rawAuthorities);
    List<String> scopes = normalizeScopes(rawAuthorities);
    Set<String> granted = new LinkedHashSet<>();

    if (roles.contains(ROLE_ADMIN)) {
      granted.addAll(LexisLegacyActionCatalog.ACTIONS);
    }

    for (String role : roles) {
      appendRoleActions(granted, role);
      if (configuredIndustryRoles.contains(role)) {
        appendRoleActions(granted, INDUSTRY_ROLE_KEY);
      }
    }

    for (String scope : scopes) {
      appendScopeActions(granted, scope);
    }

    if (featureProperties.isProdRtmOnly()) {
      granted.retainAll(PROD_RTM_ONLY_ACTIONS);
    }

    return List.copyOf(granted);
  }

  public List<String> getKnownActions() {
    return LexisLegacyActionCatalog.ACTIONS;
  }

  public boolean canPerformAction(List<String> rawRoles, String rawAction) {
    String action = normalizeAction(rawAction);
    if (action == null) {
      return false;
    }

    List<String> grantedActions = resolveGrantedActions(rawRoles);
    if (grantedActions.contains(action)) {
      return true;
    }

    if (!action.startsWith("/")) {
      return grantedActions.contains("/" + action);
    }
    return false;
  }

  public boolean hasKnownRole(List<String> rawRoles) {
    List<String> roles = normalizeRoles(rawRoles);
    if (roles.isEmpty()) {
      return false;
    }
    Set<String> configuredRoles = getConfiguredRoles();
    return roles.stream().anyMatch(configuredRoles::contains);
  }

  public Set<String> getConfiguredRoles() {
    Set<String> roles = new LinkedHashSet<>(configuredRoleActions.keySet());
    roles.add(ROLE_ADMIN);
    if (roles.contains(INDUSTRY_ROLE_KEY)) {
      roles.addAll(configuredIndustryRoles);
    }
    return withLegacyAliases(roles);
  }

  public Set<String> resolveRolesForAction(String rawAction) {
    String action = normalizeAction(rawAction);
    if (action == null) {
      return Set.of();
    }

    Set<String> roles = new LinkedHashSet<>();
    if (LexisLegacyActionCatalog.ACTIONS.contains(action)) {
      roles.add(ROLE_ADMIN);
    }

    for (Map.Entry<String, List<String>> entry : configuredRoleActions.entrySet()) {
      String role = entry.getKey();
      List<String> actions = entry.getValue();
      if (actions == null || actions.isEmpty()) {
        continue;
      }
      if ((actions.contains(ALL_ACTIONS_TOKEN) && LexisLegacyActionCatalog.ACTIONS.contains(action))
          || actions.contains(action)) {
        roles.add(role);
      }
    }

    if (roles.remove(INDUSTRY_ROLE_KEY)) {
      roles.addAll(configuredIndustryRoles);
    }
    return withLegacyAliases(roles);
  }

  private void appendRoleActions(Set<String> granted, String role) {
    List<String> actions = configuredRoleActions.get(role);
    if (actions == null || actions.isEmpty()) {
      return;
    }

    for (String action : actions) {
      if (ALL_ACTIONS_TOKEN.equals(action)) {
        granted.addAll(LexisLegacyActionCatalog.ACTIONS);
      } else if (LexisLegacyActionCatalog.ACTIONS.contains(action)) {
        granted.add(action);
      }
    }
  }

  private void appendScopeActions(Set<String> granted, String scope) {
    List<String> actions = configuredScopeActions.get(scope);
    if (actions == null || actions.isEmpty()) {
      return;
    }

    for (String action : actions) {
      if (ALL_ACTIONS_TOKEN.equals(action)) {
        granted.addAll(LexisLegacyActionCatalog.ACTIONS);
      } else {
        granted.add(action);
      }
    }
  }

  private Map<String, List<String>> normalizeRoleActions(Map<String, List<String>> roleActions) {
    Map<String, List<String>> normalized = new LinkedHashMap<>();
    if (roleActions == null || roleActions.isEmpty()) {
      return normalized;
    }

    roleActions.forEach((roleName, actionList) -> {
      String normalizedRole = normalizeConfiguredRole(roleName);
      if (normalizedRole == null || actionList == null) {
        return;
      }
      normalized.put(normalizedRole, normalizeActions(actionList));
    });
    return normalized;
  }

  private Map<String, List<String>> normalizeScopeActions(Map<String, List<String>> scopeActions) {
    Map<String, List<String>> normalized = new LinkedHashMap<>();
    if (scopeActions == null || scopeActions.isEmpty()) {
      return normalized;
    }

    scopeActions.forEach((scopeName, actionList) -> {
      String normalizedScope = normalizeScope(scopeName);
      if (normalizedScope == null || actionList == null) {
        return;
      }
      normalized.put(normalizedScope, normalizeActions(actionList));
    });
    return normalized;
  }

  private List<String> normalizeActions(List<String> rawActions) {
    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String rawAction : rawActions) {
      String normalizedAction = normalizeAction(rawAction);
      if (normalizedAction != null) {
        normalized.add(normalizedAction);
      }
    }
    return List.copyOf(normalized);
  }

  private String normalizeAction(String action) {
    if (action == null) {
      return null;
    }
    String normalized = action.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private List<String> normalizeRoles(List<String> rawRoles) {
    if (rawRoles == null || rawRoles.isEmpty()) {
      return List.of();
    }
    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String role : rawRoles) {
      if (isScopeAuthority(role)) {
        continue;
      }
      String normalizedRole = normalizeRuntimeRole(role);
      if (normalizedRole != null) {
        normalized.add(normalizedRole);
      }
    }
    return List.copyOf(normalized);
  }

  private List<String> normalizeScopes(List<String> rawAuthorities) {
    if (rawAuthorities == null || rawAuthorities.isEmpty()) {
      return List.of();
    }
    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String authority : rawAuthorities) {
      if (!isScopeAuthority(authority)) {
        continue;
      }
      String normalizedScope = normalizeScope(authority.substring(SCOPE_AUTHORITY_PREFIX.length()));
      if (normalizedScope != null) {
        normalized.add(normalizedScope);
      }
    }
    return List.copyOf(normalized);
  }

  private String normalizeConfiguredRole(String role) {
    if (role == null) {
      return null;
    }
    String normalized = role.trim().toUpperCase(Locale.ROOT);
    if (normalized.isEmpty()) {
      return null;
    }
    if (INDUSTRY_ROLE_KEY.equals(normalized)) {
      return INDUSTRY_ROLE_KEY;
    }
    return normalizeRuntimeRole(normalized);
  }

  private String normalizeRuntimeRole(String role) {
    return sessionService.normalizeRole(role);
  }

  private boolean isScopeAuthority(String authority) {
    return authority != null && authority.startsWith(SCOPE_AUTHORITY_PREFIX);
  }

  private String normalizeScope(String scope) {
    if (scope == null) {
      return null;
    }
    String normalized = scope.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  private Set<String> withLegacyAliases(Set<String> canonicalRoles) {
    return Set.copyOf(canonicalRoles);
  }
}

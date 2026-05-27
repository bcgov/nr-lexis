package ca.bc.gov.mof.lexis.service.session;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
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
  private static final String ROLE_ADMIN = "ADMIN";
  private static final String ROLE_READ_ONLY = "READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "APPLICATION_APPROVER";
  private static final String ROLE_EXEMPTION_APPROVER = "EXEMPTION_APPROVER";
  private static final String ROLE_PROVINCIAL_SUBMITTER = "PROVINCIAL_SUBMITTER";
  private static final String ROLE_FEDERAL_SUBMITTER = "FEDERAL_SUBMITTER";

  private static final Map<String, List<String>> LEGACY_ROLE_ALIASES =
      Map.ofEntries(
          Map.entry(ROLE_ADMIN, List.of("LEXIS_ADMIN")),
          Map.entry(ROLE_READ_ONLY, List.of("LEXIS_READ_ONLY")),
          Map.entry(ROLE_APPLICATION_APPROVER, List.of("LEXIS_APPLICATION_APPROVER")),
          Map.entry(ROLE_EXEMPTION_APPROVER, List.of("LEXIS_EXEMPTION_APPROVER")),
          Map.entry(
              ROLE_PROVINCIAL_SUBMITTER,
              List.of("LEXIS_INDUSTRY", "INDUSTRY", "LEXIS_PROVINCIAL_SUBMITTER")),
          Map.entry(
              ROLE_FEDERAL_SUBMITTER,
              List.of("LEXIS_LOG_EXPORT_INDUSTRY", "LOG_EXPORT_INDUSTRY", "LEXIS_FEDERAL_SUBMITTER")));

  private final Set<String> configuredIndustryRoles;
  private final Map<String, List<String>> configuredRoleActions;
  private final LexisSessionService sessionService;

  public LexisAuthorizationService(
      LexisAuthorizationProperties authorizationProperties,
      LexisSessionService sessionService) {
    this.sessionService = sessionService;
    this.configuredIndustryRoles = Set.copyOf(sessionService.getConfiguredIndustryRoles());
    this.configuredRoleActions = normalizeRoleActions(authorizationProperties.getRoleActions());
  }

  public List<String> resolveGrantedActions(List<String> rawRoles) {
    List<String> roles = normalizeRoles(rawRoles);
    Set<String> granted = new LinkedHashSet<>();

    for (String role : roles) {
      appendRoleActions(granted, role);
      if (configuredIndustryRoles.contains(role)) {
        appendRoleActions(granted, INDUSTRY_ROLE_KEY);
      }
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

  public Set<String> getConfiguredRoles() {
    Set<String> roles = new LinkedHashSet<>(configuredRoleActions.keySet());
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
    for (Map.Entry<String, List<String>> entry : configuredRoleActions.entrySet()) {
      String role = entry.getKey();
      List<String> actions = entry.getValue();
      if (actions == null || actions.isEmpty()) {
        continue;
      }
      if (actions.contains(ALL_ACTIONS_TOKEN) || actions.contains(action)) {
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
      String normalizedRole = normalizeRuntimeRole(role);
      if (normalizedRole != null) {
        normalized.add(normalizedRole);
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

  private Set<String> withLegacyAliases(Set<String> canonicalRoles) {
    LinkedHashSet<String> expanded = new LinkedHashSet<>(canonicalRoles);
    for (String role : canonicalRoles) {
      List<String> legacyAliases = LEGACY_ROLE_ALIASES.get(role);
      if (legacyAliases != null && !legacyAliases.isEmpty()) {
        expanded.addAll(legacyAliases);
      }
    }
    return Set.copyOf(expanded);
  }
}

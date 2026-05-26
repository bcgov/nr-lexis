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

  private final Set<String> configuredIndustryRoles;
  private final Map<String, List<String>> configuredRoleActions;

  public LexisAuthorizationService(
      LexisAuthorizationProperties authorizationProperties,
      LexisSessionService sessionService) {
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
      String normalizedRole = normalizeRole(roleName);
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
      if (rawAction == null) {
        continue;
      }
      String action = rawAction.trim();
      if (!action.isEmpty()) {
        normalized.add(action);
      }
    }
    return List.copyOf(normalized);
  }

  private List<String> normalizeRoles(List<String> rawRoles) {
    if (rawRoles == null || rawRoles.isEmpty()) {
      return List.of();
    }
    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String role : rawRoles) {
      String normalizedRole = normalizeRole(role);
      if (normalizedRole != null) {
        normalized.add(normalizedRole);
      }
    }
    return List.copyOf(normalized);
  }

  private String normalizeRole(String role) {
    if (role == null) {
      return null;
    }
    String normalized = role.trim().toUpperCase(Locale.ROOT);
    return normalized.isEmpty() ? null : normalized;
  }
}

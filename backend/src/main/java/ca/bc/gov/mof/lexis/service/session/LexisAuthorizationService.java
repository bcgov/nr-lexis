package ca.bc.gov.mof.lexis.service.session;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import ca.bc.gov.mof.lexis.configuration.LexisFeatureProperties;
import ca.bc.gov.mof.lexis.security.FamRegionGrant;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import java.util.Collection;
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
  private static final String ROLE_FEDERAL_READ_ONLY = "LEXIS_FEDERAL_READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String ROLE_EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final Set<String> PROVINCIAL_STAFF_ROLES =
      Set.of(
          ROLE_ADMIN, ROLE_READ_ONLY, ROLE_APPLICATION_APPROVER, ROLE_EXEMPTION_APPROVER);
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

    // INTENTIONAL_LEGACY_DIVERGENCE(ADMINISTRATOR_SUPER_ROLE): Modern Administrators receive
    // every catalogued action; dedicated security rules still deny retired report surfaces.
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
      restrictProdRtmOnlyActions(roles, granted);
    }

    return List.copyOf(granted);
  }

  public List<String> getKnownActions() {
    return LexisLegacyActionCatalog.ACTIONS;
  }

  /**
   * Resolves staff region access for one action, preserving each grant's role/region pair. A
   * role with no region is province-wide; a role granted for regions reaches only those, even if
   * it is also granted without a region (least privilege).
   */
  public OrgUnitConstraint resolveStaffRegionConstraint(
      List<String> authorities, String action) {
    return resolveStaffRegionConstraintForAny(
        authorities, action == null ? List.of() : List.of(action));
  }

  /** As {@link #resolveStaffRegionConstraint}, for a grant able to perform any of the actions. */
  public OrgUnitConstraint resolveStaffRegionConstraintForAny(
      List<String> authorities, Collection<String> actions) {
    Set<Long> orgUnits = new LinkedHashSet<>();
    if (authorities == null || actions == null) {
      return new OrgUnitConstraint(true, List.of());
    }
    Set<String> regionalRoles = regionalRoles(authorities);
    for (String authority : authorities) {
      if (authority == null) {
        continue;
      }
      var regionalGrant = FamRegionGrant.parse(authority);
      if (regionalGrant.isPresent()) {
        FamRegionGrant grant = regionalGrant.get();
        if (canPerformAnyAction(grant.role(), actions)) {
          orgUnits.add(grant.region().orgUnitNumber());
        }
      } else if (isProvinceWideGrant(authority, regionalRoles)
          && canPerformAnyAction(authority, actions)) {
        // Only a recognized unscoped grant for THIS action makes its region access global.
        // A province-wide Read Only grant cannot widen a regional Approver's write access.
        return new OrgUnitConstraint(false, List.of());
      }
    }
    return new OrgUnitConstraint(true, List.copyOf(orgUnits));
  }

  /**
   * As {@link #resolveStaffRegionConstraintForAny}, for grants of the named staff roles. Used where
   * a capability belongs to a role rather than an action, so another role holding the route's
   * action province-wide does not widen it.
   */
  public OrgUnitConstraint resolveStaffRegionConstraintForRoles(
      List<String> authorities, Collection<String> roles) {
    Set<Long> orgUnits = new LinkedHashSet<>();
    if (authorities == null || roles == null) {
      return new OrgUnitConstraint(true, List.of());
    }
    Set<String> regionalRoles = regionalRoles(authorities);
    for (String authority : authorities) {
      if (authority == null) {
        continue;
      }
      var regionalGrant = FamRegionGrant.parse(authority);
      if (regionalGrant.isPresent()) {
        if (roles.contains(regionalGrant.get().role())) {
          orgUnits.add(regionalGrant.get().region().orgUnitNumber());
        }
      } else if (isProvinceWideGrant(authority, regionalRoles) && roles.contains(authority)) {
        return new OrgUnitConstraint(false, List.of());
      }
    }
    return new OrgUnitConstraint(true, List.copyOf(orgUnits));
  }

  /**
   * The organization units each granted action is limited to, for actions a regional grant
   * limits. Actions absent from the result are province-wide; users without a regional grant get
   * an empty map.
   */
  public Map<String, List<Long>> resolveActionRegions(
      List<String> authorities, List<String> grantedActions) {
    Map<String, List<Long>> actionRegions = new LinkedHashMap<>();
    if (!FamRegionGrant.anyIn(authorities) || grantedActions == null) {
      return actionRegions;
    }
    // Same answer as resolveStaffRegionConstraint per action, resolving each grant's actions once.
    Set<String> provinceWide = new LinkedHashSet<>();
    Map<String, Set<Long>> regionsByAction = new LinkedHashMap<>();
    Set<String> regionalRoles = regionalRoles(authorities);
    for (String authority : authorities) {
      if (authority == null) {
        continue;
      }
      var regionalGrant = FamRegionGrant.parse(authority);
      if (regionalGrant.isPresent()) {
        FamRegionGrant grant = regionalGrant.get();
        Set<String> roleActions = Set.copyOf(resolveGrantedActions(List.of(grant.role())));
        for (String action : grantedActions) {
          if (grantsAction(roleActions, action)) {
            regionsByAction
                .computeIfAbsent(action, ignored -> new LinkedHashSet<>())
                .add(grant.region().orgUnitNumber());
          }
        }
      } else if (isProvinceWideGrant(authority, regionalRoles)) {
        Set<String> roleActions = Set.copyOf(resolveGrantedActions(List.of(authority)));
        grantedActions.stream()
            .filter(action -> grantsAction(roleActions, action))
            .forEach(provinceWide::add);
      }
    }
    for (String action : grantedActions) {
      if (!provinceWide.contains(action)) {
        actionRegions.put(action, List.copyOf(regionsByAction.getOrDefault(action, Set.of())));
      }
    }
    return actionRegions;
  }

  /** The staff roles granted for at least one region. */
  private static Set<String> regionalRoles(Collection<String> authorities) {
    Set<String> roles = new LinkedHashSet<>();
    authorities.forEach(
        authority -> FamRegionGrant.parse(authority).ifPresent(grant -> roles.add(grant.role())));
    return roles;
  }

  /**
   * An unscoped staff grant is province-wide unless the same role is also granted for regions;
   * then the regional grants are that role's whole reach (least privilege).
   */
  private static boolean isProvinceWideGrant(String authority, Set<String> regionalRoles) {
    return PROVINCIAL_STAFF_ROLES.contains(authority) && !regionalRoles.contains(authority);
  }

  private boolean canPerformAnyAction(String role, Collection<String> actions) {
    return actions.stream().anyMatch(action -> canPerformAction(List.of(role), action));
  }

  public boolean canPerformAction(List<String> rawRoles, String rawAction) {
    return normalizeAction(rawAction) != null
        && grantsAction(resolveGrantedActions(rawRoles), rawAction);
  }

  /** Whether the granted actions include the action, with or without its leading slash. */
  private boolean grantsAction(Collection<String> grantedActions, String rawAction) {
    String action = normalizeAction(rawAction);
    if (action == null) {
      return false;
    }
    if (grantedActions.contains(action)) {
      return true;
    }
    return !action.startsWith("/") && grantedActions.contains("/" + action);
  }

  public boolean hasKnownRole(List<String> rawRoles) {
    List<String> roles = normalizeRoles(rawRoles);
    if (roles.isEmpty()) {
      return false;
    }
    Set<String> configuredRoles = getConfiguredRoles();
    return roles.stream().anyMatch(configuredRoles::contains);
  }

  public boolean isReadOnlyRolloutUser(List<String> rawRoles) {
    List<String> roles = normalizeRoles(rawRoles);
    return !roles.contains(ROLE_ADMIN)
        && (roles.contains(ROLE_READ_ONLY) || roles.contains(ROLE_FEDERAL_READ_ONLY));
  }

  public boolean hasProvincialStaffRole(List<String> rawRoles) {
    return normalizeRoles(rawRoles).stream().anyMatch(PROVINCIAL_STAFF_ROLES::contains);
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

  private void restrictProdRtmOnlyActions(List<String> roles, Set<String> granted) {
    if (roles.contains(ROLE_ADMIN)) {
      granted.retainAll(PROD_RTM_ONLY_ACTIONS);
      return;
    }

    if (roles.contains(ROLE_READ_ONLY) || roles.contains(ROLE_FEDERAL_READ_ONLY)) {
      Set<String> readOnlyActions = new LinkedHashSet<>();
      if (roles.contains(ROLE_READ_ONLY)) {
        appendRoleActions(readOnlyActions, ROLE_READ_ONLY);
      }
      if (roles.contains(ROLE_FEDERAL_READ_ONLY)) {
        appendRoleActions(readOnlyActions, ROLE_FEDERAL_READ_ONLY);
      }
      granted.retainAll(readOnlyActions);
      return;
    }

    granted.clear();
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

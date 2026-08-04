package ca.bc.gov.mof.lexis.service.session;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

@Service
public class LexisSessionService {

  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String ROLE_EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final String ROLE_PROVINCIAL_SUBMITTER = "LEXIS_PROVINCIAL_SUBMITTER";
  private static final String SCOPE_AUTHORITY_PREFIX = "SCOPE_";
  private static final Set<String> NON_LEXIS_FAM_AUTHORITIES =
      Set.of("DELEGATED_ADMIN", "LEXIS_DELEGATED_ADMIN");

  private static final Set<String> CANONICAL_ROLES =
      Set.of(
          ROLE_ADMIN,
          ROLE_READ_ONLY,
          ROLE_APPLICATION_APPROVER,
          ROLE_EXEMPTION_APPROVER,
          ROLE_PROVINCIAL_SUBMITTER);

  private final Set<String> configuredIndustryRoles;
  private final ForestClientSelectionContext forestClientSelectionContext;

  public LexisSessionService(@Value("${lexis.auth.industry-roles:}") String industryRolesCsv) {
    this(industryRolesCsv, null);
  }

  @Autowired
  public LexisSessionService(
      @Value("${lexis.auth.industry-roles:}") String industryRolesCsv,
      ForestClientSelectionContext forestClientSelectionContext) {
    this.configuredIndustryRoles = parseRoleCsv(industryRolesCsv);
    this.forestClientSelectionContext = forestClientSelectionContext;
  }

  public LexisSessionWelcomeDto resolveWelcomeRoute(String principalName, List<String> rawRoles) {
    List<String> roles = normalizeRoles(rawRoles);
    Set<String> roleSet = new LinkedHashSet<>(roles);

    boolean adminUser = roleSet.contains(ROLE_ADMIN);
    boolean readOnlyUser = roleSet.contains(ROLE_READ_ONLY);
    boolean applicationApprover = roleSet.contains(ROLE_APPLICATION_APPROVER);
    boolean provincialSubmitter = roleSet.contains(ROLE_PROVINCIAL_SUBMITTER);
    boolean exemptionApprover = roleSet.contains(ROLE_EXEMPTION_APPROVER);

    WelcomeTarget target;
    if (adminUser) {
      target = WelcomeTarget.ADMINISTRATOR;
    } else if (readOnlyUser) {
      target = WelcomeTarget.READ_ONLY;
    } else if (provincialSubmitter) {
      target = WelcomeTarget.PROVINCIAL_SUBMITTER;
    } else if (exemptionApprover) {
      target = WelcomeTarget.EXEMPTION_APPROVER;
    } else if (applicationApprover) {
      target = WelcomeTarget.APPLICATION_APPROVER;
    } else {
      target = WelcomeTarget.NO_ACCESS;
    }

    return new LexisSessionWelcomeDto(
        principalName != null && !principalName.isBlank(),
        trimToNull(principalName),
        roles,
        target.forwardName,
        target.legacyPath);
  }

  public List<String> parseRoleHeader(String roleHeader) {
    if (roleHeader == null || roleHeader.isBlank()) {
      return List.of();
    }
    return normalizeRoles(Arrays.asList(roleHeader.split(",")));
  }

  /**
   * Converts identity-provider groups to runtime authorities. Concrete forest-client authorities
   * are retained for data scoping and their base role is added for legacy action authorization.
   */
  public List<String> parseGrantedAuthorities(List<String> rawRoles) {
    if (rawRoles == null || rawRoles.isEmpty()) {
      return List.of();
    }

    LinkedHashSet<String> authorities = new LinkedHashSet<>();
    for (String rawRole : rawRoles) {
      String concreteRole = canonicalizeRole(rawRole);
      if (concreteRole == null) {
        continue;
      }
      authorities.add(concreteRole);
      authorities.add(collapseForestClientScopedIndustryRole(concreteRole));
    }
    return List.copyOf(authorities);
  }

  public List<String> parseRolesFromPrincipal(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return List.of();
    }
    return parseAuthorities(authentication.getAuthorities());
  }

  public String resolveForestClientNumber(Authentication authentication) {
    ForestClientScope scope = resolveForestClientScope(authentication);
    if (scope.invalid() || scope.selectionRequired()) {
      throw new AccessDeniedException(scope.failureReason());
    }
    return scope.clientNumber();
  }

  public String resolveForestClientNumber(List<String> rawRoles) {
    ForestClientScope scope = resolveForestClientScope(rawRoles);
    if (scope.invalid() || scope.selectionRequired()) {
      throw new AccessDeniedException(scope.failureReason());
    }
    return scope.clientNumber();
  }

  public ForestClientScope resolveForestClientScope(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return ForestClientScope.unrestricted();
    }
    return resolveForestClientScope(
        authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList(),
        forestClientSelectionContext == null
            ? null
            : forestClientSelectionContext.selectedForestClientNumber());
  }

  public ForestClientScope resolveForestClientScope(List<String> rawRoles) {
    return resolveForestClientScope(rawRoles, null);
  }

  ForestClientScope resolveForestClientScope(
      List<String> rawRoles, String selectedForestClientNumber) {
    if (rawRoles == null || rawRoles.isEmpty()) {
      return ForestClientScope.unrestricted();
    }

    LinkedHashSet<String> clientNumbers = new LinkedHashSet<>();
    boolean provincialSubmitterAuthorityPresent = false;
    for (String rawRole : rawRoles) {
      String normalizedRole = canonicalizeRole(rawRole);
      if (normalizedRole == null) {
        continue;
      }
      // Administrators have global client access. A concurrent scoped submitter assignment must
      // not narrow that authority or turn a missing/ambiguous submitter suffix into a denial.
      if (ROLE_ADMIN.equals(normalizedRole)) {
        return ForestClientScope.unrestricted();
      }
      if (ROLE_PROVINCIAL_SUBMITTER.equals(normalizedRole)
          || normalizedRole.startsWith(ROLE_PROVINCIAL_SUBMITTER + "_")) {
        provincialSubmitterAuthorityPresent = true;
      }
      String forestClientSuffix = extractForestClientSuffix(normalizedRole);
      if (forestClientSuffix != null) {
        clientNumbers.add(forestClientSuffix);
      }
    }

    if (!provincialSubmitterAuthorityPresent) {
      return ForestClientScope.unrestricted();
    }
    if (clientNumbers.isEmpty()) {
      return ForestClientScope.invalid(
          List.of(),
          "Provincial Submitter authority is missing its forest-client scope.");
    }

    List<String> availableClientNumbers = clientNumbers.stream().sorted().toList();
    String selectedClientNumber = trimToNull(selectedForestClientNumber);
    if (selectedClientNumber != null && !clientNumbers.contains(selectedClientNumber)) {
      return ForestClientScope.invalid(
          availableClientNumbers,
          "Selected forest client is not assigned to the authenticated user.");
    }
    if (availableClientNumbers.size() == 1) {
      return ForestClientScope.scoped(availableClientNumbers.getFirst(), availableClientNumbers);
    }
    if (selectedClientNumber == null) {
      return ForestClientScope.selectionRequired(
          availableClientNumbers,
          "Provincial Submitter has multiple forest-client scopes; select an active forest client.");
    }
    return ForestClientScope.scoped(selectedClientNumber, availableClientNumbers);
  }

  public List<String> parseAuthorities(Collection<? extends GrantedAuthority> authorities) {
    if (authorities == null || authorities.isEmpty()) {
      return List.of();
    }
    return normalizeRoles(
        authorities.stream()
            .map(GrantedAuthority::getAuthority)
            .toList());
  }

  public Set<String> getConfiguredIndustryRoles() {
    return Set.copyOf(configuredIndustryRoles);
  }

  public String normalizeRole(String rawRole) {
    String canonicalRole = canonicalizeRole(rawRole);
    if (canonicalRole == null) {
      return null;
    }
    return collapseForestClientScopedIndustryRole(canonicalRole);
  }

  private List<String> normalizeRoles(List<String> rawRoles) {
    if (rawRoles == null || rawRoles.isEmpty()) {
      return List.of();
    }

    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String value : rawRoles) {
      String normalizedRole = normalizeRole(value);
      if (normalizedRole == null) {
        continue;
      }
      normalized.add(normalizedRole);
    }
    return List.copyOf(normalized);
  }

  private Set<String> parseRoleCsv(String csv) {
    if (csv == null || csv.isBlank()) {
      return Set.of();
    }
    LinkedHashSet<String> parsed = new LinkedHashSet<>();
    for (String value : Arrays.asList(csv.split(","))) {
      String normalizedRole = canonicalizeRole(value);
      if (normalizedRole != null) {
        parsed.add(normalizedRole);
      }
    }
    return Set.copyOf(parsed);
  }

  private String collapseForestClientScopedIndustryRole(String normalizedRole) {
    String forestClientSuffix = extractForestClientSuffix(normalizedRole);
    if (forestClientSuffix == null) {
      return normalizedRole;
    }

    for (String industryRole : configuredIndustryRoles) {
      if (!isForestClientScopedRole(industryRole)) {
        continue;
      }
      String prefix = industryRole + "_" + forestClientSuffix;
      if (normalizedRole.equals(prefix)) {
        return industryRole;
      }
    }
    return normalizedRole;
  }

  private String canonicalizeRole(String rawRole) {
    if (rawRole == null) {
      return null;
    }
    String normalizedRole = rawRole.trim().toUpperCase(Locale.ROOT);
    if (normalizedRole.isEmpty()) {
      return null;
    }
    if (normalizedRole.startsWith(SCOPE_AUTHORITY_PREFIX)) {
      return null;
    }
    if (NON_LEXIS_FAM_AUTHORITIES.contains(normalizedRole)) {
      return null;
    }

    if (CANONICAL_ROLES.contains(normalizedRole)) {
      return normalizedRole;
    }

    String provincialPrefix = ROLE_PROVINCIAL_SUBMITTER + "_";
    if (normalizedRole.startsWith(provincialPrefix)) {
      String suffix = normalizedRole.substring(provincialPrefix.length());
      if (!suffix.isEmpty() && suffix.chars().allMatch(Character::isDigit)) {
        return normalizedRole;
      }
    }

    return normalizedRole;
  }

  private String extractForestClientSuffix(String normalizedRole) {
    for (String industryRole : configuredIndustryRoles) {
      if (!isForestClientScopedRole(industryRole)) {
        continue;
      }
      String prefix = industryRole + "_";
      if (!normalizedRole.startsWith(prefix)) {
        continue;
      }

      String forestClientSuffix = normalizedRole.substring(prefix.length());
      if (!forestClientSuffix.isEmpty()
          && forestClientSuffix.chars().allMatch(Character::isDigit)) {
        return forestClientSuffix;
      }
    }
    return null;
  }

  private boolean isForestClientScopedRole(String role) {
    return ROLE_PROVINCIAL_SUBMITTER.equals(role);
  }

  public record ForestClientScope(
      String clientNumber,
      List<String> availableClientNumbers,
      boolean selectionRequired,
      boolean invalid,
      String failureReason) {

    static ForestClientScope unrestricted() {
      return new ForestClientScope(null, List.of(), false, false, null);
    }

    static ForestClientScope scoped(String clientNumber, List<String> availableClientNumbers) {
      return new ForestClientScope(
          clientNumber, List.copyOf(availableClientNumbers), false, false, null);
    }

    static ForestClientScope selectionRequired(
        List<String> availableClientNumbers, String failureReason) {
      return new ForestClientScope(
          null, List.copyOf(availableClientNumbers), true, false, failureReason);
    }

    static ForestClientScope invalid(
        List<String> availableClientNumbers, String failureReason) {
      return new ForestClientScope(
          null, List.copyOf(availableClientNumbers), false, true, failureReason);
    }

    public boolean scoped() {
      return clientNumber != null;
    }
  }

  private enum WelcomeTarget {
    ADMINISTRATOR("administrator", "/provincial/review"),
    READ_ONLY("readOnly", "/provincial/application"),
    APPLICATION_APPROVER("applicationApprover", "/provincial/review"),
    EXEMPTION_APPROVER("exemptionApprover", "/provincial/exemption"),
    PROVINCIAL_SUBMITTER("provincialSubmitter", "/provincial/summary"),
    NO_ACCESS("noAccess", null);

    private final String forwardName;
    private final String legacyPath;

    WelcomeTarget(String forwardName, String legacyPath) {
      this.forwardName = forwardName;
      this.legacyPath = legacyPath;
    }
  }
}

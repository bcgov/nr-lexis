package ca.bc.gov.mof.lexis.service.session;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
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
  private static final String ROLE_FEDERAL_SUBMITTER = "LEXIS_FEDERAL_SUBMITTER";
  private static final String ROLE_DELEGATED_ADMIN = "LEXIS_DELEGATED_ADMIN";

  private static final Set<String> CANONICAL_ROLES =
      Set.of(
          ROLE_ADMIN,
          ROLE_READ_ONLY,
          ROLE_APPLICATION_APPROVER,
          ROLE_EXEMPTION_APPROVER,
          ROLE_PROVINCIAL_SUBMITTER,
          ROLE_FEDERAL_SUBMITTER,
          ROLE_DELEGATED_ADMIN);

  private final Set<String> configuredIndustryRoles;

  public LexisSessionService(@Value("${lexis.auth.industry-roles:}") String industryRolesCsv) {
    this.configuredIndustryRoles = parseRoleCsv(industryRolesCsv);
  }

  public LexisSessionWelcomeDto resolveWelcomeRoute(String principalName, List<String> rawRoles) {
    List<String> roles = normalizeRoles(rawRoles);
    Set<String> roleSet = new LinkedHashSet<>(roles);

    boolean readOnlyUser = roleSet.contains(ROLE_READ_ONLY);
    boolean provincialSubmitter = roleSet.contains(ROLE_PROVINCIAL_SUBMITTER);
    boolean federalSubmitter = roleSet.contains(ROLE_FEDERAL_SUBMITTER);
    boolean industryUser = roleSet.stream().anyMatch(this::isIndustryRole);
    boolean adminUserOnly = roleSet.size() == 1 && roleSet.contains(ROLE_ADMIN);
    boolean exemptionApprover = roleSet.contains(ROLE_EXEMPTION_APPROVER);
    boolean delegatedAdminOnly = roleSet.size() == 1 && roleSet.contains(ROLE_DELEGATED_ADMIN);

    WelcomeTarget target;
    if (readOnlyUser) {
      target = WelcomeTarget.READ_ONLY;
    } else if (provincialSubmitter) {
      target = WelcomeTarget.PROVINCIAL_SUBMITTER;
    } else if (federalSubmitter) {
      target = WelcomeTarget.FEDERAL_SUBMITTER;
    } else if (industryUser) {
      target = WelcomeTarget.INDUSTRY_USER;
    } else if (adminUserOnly) {
      target = WelcomeTarget.ADMIN_USER;
    } else if (exemptionApprover) {
      target = WelcomeTarget.EXEMPTION_APPROVER;
    } else if (delegatedAdminOnly) {
      target = WelcomeTarget.NO_ACCESS;
    } else {
      target = WelcomeTarget.MOFR_USER;
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

  public List<String> parseRolesFromPrincipal(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return List.of();
    }
    return parseAuthorities(authentication.getAuthorities());
  }

  public String resolveForestClientNumber(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return null;
    }

    List<String> authorities =
        authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
    return resolveForestClientNumber(authorities);
  }

  public String resolveForestClientNumber(List<String> rawRoles) {
    if (rawRoles == null || rawRoles.isEmpty()) {
      return null;
    }

    for (String rawRole : rawRoles) {
      String normalizedRole = canonicalizeRole(rawRole);
      if (normalizedRole == null) {
        continue;
      }
      String forestClientSuffix = extractForestClientSuffix(normalizedRole);
      if (forestClientSuffix != null) {
        return forestClientSuffix;
      }
    }
    return null;
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

  private boolean isIndustryRole(String role) {
    return configuredIndustryRoles.contains(role);
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
      if (!forestClientSuffix.isEmpty() && forestClientSuffix.chars().allMatch(Character::isDigit)) {
        return forestClientSuffix;
      }
    }
    return null;
  }

  private boolean isForestClientScopedRole(String role) {
    return ROLE_PROVINCIAL_SUBMITTER.equals(role);
  }

  private enum WelcomeTarget {
    READ_ONLY("readOnly", "/applicationSearch.do?actionMapping=view"),
    PROVINCIAL_SUBMITTER("industryUser", "/applicationSearch.do?actionMapping=view"),
    FEDERAL_SUBMITTER("industryUser", "/federalApplicationSearch.do?actionMapping=view"),
    INDUSTRY_USER("industryUser", "/applicationSearch.do?actionMapping=view"),
    ADMIN_USER("adminUser", "/lexisAgentAdmin.do?actionMapping=view"),
    EXEMPTION_APPROVER("exemptionApprover", "/exemptionSearch.do?actionMapping=view"),
    NO_ACCESS("noAccess", null),
    MOFR_USER("mofrUser", "/applicationsReview.do?actionMapping=view");

    private final String forwardName;
    private final String legacyPath;

    WelcomeTarget(String forwardName, String legacyPath) {
      this.forwardName = forwardName;
      this.legacyPath = legacyPath;
    }
  }
}

package ca.bc.gov.mof.lexis.service.session;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

@Service
public class LexisSessionService {

  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String ROLE_INDUSTRY = "LEXIS_INDUSTRY";
  private static final String ROLE_LOG_EXPORT_INDUSTRY = "LEXIS_LOG_EXPORT_INDUSTRY";

  private static final Map<String, String> ROLE_ALIASES =
      Map.of(
          "ADMIN", ROLE_ADMIN,
          "READ_ONLY", ROLE_READ_ONLY,
          "APPLICATION_APPROVER", ROLE_APPLICATION_APPROVER,
          "EXEMPTION_APPROVER", ROLE_EXEMPTION_APPROVER,
          "INDUSTRY", ROLE_INDUSTRY,
          "LOG_EXPORT_INDUSTRY", ROLE_LOG_EXPORT_INDUSTRY);

  private final Set<String> configuredIndustryRoles;

  public LexisSessionService(@Value("${lexis.auth.industry-roles:}") String industryRolesCsv) {
    this.configuredIndustryRoles = parseRoleCsv(industryRolesCsv);
  }

  public LexisSessionWelcomeDto resolveWelcomeRoute(String principalName, List<String> rawRoles) {
    List<String> roles = normalizeRoles(rawRoles);
    Set<String> roleSet = new LinkedHashSet<>(roles);

    boolean readOnlyUser = roleSet.contains(ROLE_READ_ONLY);
    boolean industryUser = roleSet.stream().anyMatch(this::isIndustryRole);
    boolean adminUserOnly = roleSet.size() == 1 && roleSet.contains(ROLE_ADMIN);
    boolean exemptionApprover = roleSet.contains(ROLE_EXEMPTION_APPROVER);

    WelcomeTarget target;
    if (readOnlyUser) {
      target = WelcomeTarget.READ_ONLY;
    } else if (industryUser) {
      target = WelcomeTarget.INDUSTRY_USER;
    } else if (adminUserOnly) {
      target = WelcomeTarget.ADMIN_USER;
    } else if (exemptionApprover) {
      target = WelcomeTarget.EXEMPTION_APPROVER;
    } else {
      target = WelcomeTarget.MOFR_USER;
    }

    return new LexisSessionWelcomeDto(
        principalName != null && !principalName.isBlank(),
        blankToNull(principalName),
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

    String aliasMapped = ROLE_ALIASES.get(normalizedRole);
    if (aliasMapped != null) {
      return aliasMapped;
    }

    for (Map.Entry<String, String> alias : ROLE_ALIASES.entrySet()) {
      String aliasPrefix = alias.getKey() + "_";
      if (!normalizedRole.startsWith(aliasPrefix)) {
        continue;
      }

      String suffix = normalizedRole.substring(aliasPrefix.length());
      if (!suffix.isEmpty() && suffix.chars().allMatch(Character::isDigit)) {
        return alias.getValue() + "_" + suffix;
      }
    }

    return normalizedRole;
  }

  private String extractForestClientSuffix(String normalizedRole) {
    for (String industryRole : configuredIndustryRoles) {
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

  private String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private enum WelcomeTarget {
    READ_ONLY("readOnly", "/applicationSearch.do?actionMapping=view"),
    INDUSTRY_USER("industryUser", "/summary.do?actionMapping=view"),
    ADMIN_USER("adminUser", "/lexisAgentAdmin.do?actionMapping=view"),
    EXEMPTION_APPROVER("exemptionApprover", "/exemptionSearch.do?actionMapping=view"),
    MOFR_USER("mofrUser", "/applicationsReview.do?actionMapping=view");

    private final String forwardName;
    private final String legacyPath;

    WelcomeTarget(String forwardName, String legacyPath) {
      this.forwardName = forwardName;
      this.legacyPath = legacyPath;
    }
  }
}

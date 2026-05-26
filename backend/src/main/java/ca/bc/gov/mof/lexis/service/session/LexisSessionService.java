package ca.bc.gov.mof.lexis.service.session;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class LexisSessionService {

  private static final String ROLE_READ_ONLY = "READ_ONLY";
  private static final String ROLE_ADMIN = "ADMIN";
  private static final String ROLE_EXEMPTION_APPROVER = "EXEMPTION_APPROVER";

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

  public Set<String> getConfiguredIndustryRoles() {
    return Set.copyOf(configuredIndustryRoles);
  }

  private List<String> normalizeRoles(List<String> rawRoles) {
    if (rawRoles == null || rawRoles.isEmpty()) {
      return List.of();
    }

    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String value : rawRoles) {
      if (value == null) {
        continue;
      }

      String role = value.trim();
      if (role.isEmpty()) {
        continue;
      }
      normalized.add(role.toUpperCase(Locale.ROOT));
    }
    return List.copyOf(normalized);
  }

  private Set<String> parseRoleCsv(String csv) {
    return new LinkedHashSet<>(normalizeRoles(Arrays.asList(csv.split(","))));
  }

  private boolean isIndustryRole(String role) {
    return configuredIndustryRoles.contains(role);
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

package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Server-side equivalent of the legacy {@code ApplicationFormPermissionsManager}. */
@Service
public class ApplicationEditPolicyService {

  private static final String ACTION_CREATE_APPLICATION = "createApplication";
  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String ROLE_EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final String ROLE_PROVINCIAL_SUBMITTER = "LEXIS_PROVINCIAL_SUBMITTER";
  private static final Set<String> LEGACY_APPROVED_STATUSES = Set.of("APP", "EXE", "PMT", "EXP");

  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final Clock clock;

  @Autowired
  public ApplicationEditPolicyService(
      LexisSessionService sessionService, LexisAuthorizationService authorizationService) {
    this(sessionService, authorizationService, LexisBusinessTime.systemClock());
  }

  ApplicationEditPolicyService(
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      Clock clock) {
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  public ApplicationEditPolicy resolve(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    List<String> parsedRoles = sessionService.parseRolesFromPrincipal(authentication);
    Set<String> roles = normalizeRoles(parsedRoles);
    boolean industryUser = isIndustryUser(roles);
    boolean readOnly = roles.contains(ROLE_READ_ONLY);
    boolean exemptionApprover = roles.contains(ROLE_EXEMPTION_APPROVER);

    ApplicationEditPolicy denied =
        ApplicationEditPolicy.denied(industryUser, readOnly, exemptionApprover);
    if (applicationService == null || applicationNumber == null || applicationNumber < 1) {
      return denied;
    }

    ApplicationDetailsRpcService.ApplicationEditContext context =
        applicationService.getApplicationEditContext(applicationNumber).orElse(null);
    if (context == null || !applicationNumber.equals(context.applicationNumber())) {
      return denied;
    }
    if (!"P".equals(normalizeCode(context.jurisdictionCode()))) {
      return denied;
    }
    if ("Y".equals(normalizeCode(context.oicIndicator()))) {
      return denied;
    }

    boolean actionAllowed =
        authorizationService.canPerformAction(parsedRoles, ACTION_CREATE_APPLICATION);
    if (!actionAllowed) {
      return denied;
    }

    boolean applicationApprover = roles.contains(ROLE_APPLICATION_APPROVER);
    String status = normalizeCode(context.applicationStatusCode());
    LocalDate today = LocalDate.now(clock);
    LocalDate advertisingDate = context.advertisingDate();

    boolean industryCanEdit =
        context.exportScheduleId() != null
            && advertisingDate != null
            && today.isBefore(advertisingDate.plusDays(1));
    boolean listingDateHasPassed =
        advertisingDate != null && !advertisingDate.isAfter(today);
    boolean withinSixDays =
        advertisingDate == null || advertisingDate.isAfter(today.minusDays(6));

    boolean canEditApplicationDetails =
        !readOnly
            && !exemptionApprover
            && (!industryUser || industryCanEdit)
            && ("NEW".equals(status)
                || ("APP".equals(status)
                    && ((industryUser && !listingDateHasPassed)
                        || (applicationApprover && withinSixDays))));

    boolean canEditPackages = false;
    boolean canAddPackages = false;
    boolean canAddScales = false;
    boolean approved = LEGACY_APPROVED_STATUSES.contains(status);

    // Manufacturing exemptions do not bypass role-based edit restrictions.
    if (!readOnly) {
      // The branch order is intentional: legacy treated a dual-role industry user as industry.
      if (industryUser) {
        if (!(context.hasCompletePermit() || (approved && context.hasScaleBeforeApproval()))) {
          canAddScales = true;
          if (!(approved && context.hasPackageBeforeApproval())) {
            canEditPackages = true;
            canAddPackages = true;
          }
        }
      } else if (applicationApprover && !context.hasCompletePermit()) {
        canEditPackages = true;
        canAddPackages = true;
        canAddScales = true;
      }
    }

    boolean canUpdatePackageNumber =
        !readOnly
            && ((industryUser && "NEW".equals(status))
                || (!industryUser
                    && applicationApprover
                    && ("NEW".equals(status) || "APP".equals(status))
                    && withinSixDays));

    return new ApplicationEditPolicy(
        canEditApplicationDetails,
        canEditPackages,
        canAddPackages,
        canAddScales,
        canUpdatePackageNumber,
        industryUser,
        readOnly,
        exemptionApprover);
  }

  public void requireSummaryEdit(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canEditApplicationDetails(),
        "Application summary editing is not allowed by the application edit policy.");
  }

  public void requirePackageEdit(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canEditPackages(),
        "Package editing is not allowed by the application edit policy.");
  }

  public void requirePackageAddOrDelete(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canAddPackages(),
        "Package creation or deletion is not allowed by the application edit policy.");
  }

  public void requireScaleAddOrDelete(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canAddScales(),
        "Scale creation or deletion is not allowed by the application edit policy.");
  }

  public void requirePackageNumberUpdate(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canUpdatePackageNumber(),
        "Package number changes are not allowed by the application edit policy.");
  }

  private void require(boolean allowed, String message) {
    if (!allowed) {
      throw new AccessDeniedException(message);
    }
  }

  private Set<String> normalizeRoles(Collection<String> roles) {
    Set<String> normalized = new LinkedHashSet<>();
    if (roles == null) {
      return normalized;
    }
    for (String role : roles) {
      if (role == null || role.isBlank()) {
        continue;
      }
      String value = role.trim().toUpperCase(Locale.ROOT);
      normalized.add(value.startsWith("ROLE_") ? value.substring("ROLE_".length()) : value);
    }
    return normalized;
  }

  private boolean isIndustryUser(Set<String> roles) {
    if (roles.contains(ROLE_PROVINCIAL_SUBMITTER)
        || roles.stream().anyMatch(role -> role.startsWith(ROLE_PROVINCIAL_SUBMITTER + "_"))) {
      return true;
    }
    Set<String> configuredIndustryRoles = sessionService.getConfiguredIndustryRoles();
    if (configuredIndustryRoles == null) {
      return false;
    }
    Set<String> normalizedConfiguredRoles = normalizeRoles(configuredIndustryRoles);
    return roles.stream().anyMatch(normalizedConfiguredRoles::contains);
  }

  private String normalizeCode(String value) {
    return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
  }

  public record ApplicationEditPolicy(
      boolean canEditApplicationDetails,
      boolean canEditPackages,
      boolean canAddPackages,
      boolean canAddScales,
      boolean canUpdatePackageNumber,
      boolean industryUser,
      boolean readOnly,
      boolean exemptionApprover) {

    public static ApplicationEditPolicy denied(
        boolean industryUser, boolean readOnly, boolean exemptionApprover) {
      return new ApplicationEditPolicy(
          false,
          false,
          false,
          false,
          false,
          industryUser,
          readOnly,
          exemptionApprover);
    }

    public boolean anyEditable() {
      return canEditApplicationDetails || canEditPackages || canAddPackages || canAddScales;
    }

    public ApplicationEditPolicy withoutEdits() {
      return denied(industryUser, readOnly, exemptionApprover);
    }
  }
}

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
  private static final String ACTION_CHANGE_APPLICANT_TYPE = "/changeApplicantType";
  private static final String APPLICATION_STATUS_EXPIRED = "EXP";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
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

  /**
   * An Approved application's review stays open while its list date is less than six days ago, or
   * while it has no list date.
   */
  public boolean approvedReviewWindowOpen(
      ApplicationDetailsRpcService applicationService, Long applicationNumber) {
    if (applicationService == null || applicationNumber == null) {
      return false;
    }
    LocalDate today = LocalDate.now(clock);
    return applicationService
        .getApplicationEditContext(applicationNumber)
        .map(
            context ->
                context.advertisingDate() == null
                    || context.advertisingDate().isAfter(today.minusDays(6)))
        .orElse(false);
  }

  public ApplicationEditPolicy resolve(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    List<String> parsedRoles = sessionService.parseRolesFromPrincipal(authentication);
    Set<String> roles = normalizeRoles(parsedRoles);
    boolean administrator = roles.contains(ROLE_ADMIN);
    boolean industryUser = !administrator && isIndustryUser(roles);
    boolean readOnly = !administrator && isPureReadOnlyRole(roles);
    boolean exemptionApprover = !administrator && roles.contains(ROLE_EXEMPTION_APPROVER);

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
    if (!actionAllowed && !exemptionApprover) {
      return denied;
    }

    boolean applicationApprover =
        administrator || roles.contains(ROLE_APPLICATION_APPROVER);
    String status = normalizeCode(context.applicationStatusCode());
    if (APPLICATION_STATUS_EXPIRED.equals(status)) {
      return denied;
    }
    LocalDate today = LocalDate.now(clock);
    LocalDate advertisingDate = context.advertisingDate();

    boolean industryCanEdit =
        context.exportScheduleId() != null
            && advertisingDate != null
            && today.isBefore(advertisingDate.plusDays(1));
    boolean listingDateHasPassed = listDateReached(advertisingDate, today);
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

    if (!readOnly && !exemptionApprover) {
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

    if (!readOnly
        && !exemptionApprover
        && (applicationApprover || industryUser)
        && context.ministerialItemOverrideEligible()) {
      canEditPackages = true;
      canAddPackages = true;
      canAddScales = true;
    }

    boolean canDeletePackages = canAddPackages;
    boolean canDeleteScales = canAddScales;
    // An Exemption Approver on a Ministerial application with volume remaining can edit and delete
    // packages and add and delete scales, but not create packages.
    if (!readOnly && exemptionApprover && context.ministerialItemOverrideEligible()) {
      canEditPackages = true;
      canDeletePackages = true;
      canAddScales = true;
      canDeleteScales = true;
    }
    // While the application details are editable, packages can be created, edited and deleted and
    // scales added whatever the package and scale rules say. Scale deletion still follows them.
    if (canEditApplicationDetails) {
      canEditPackages = true;
      canAddPackages = true;
      canDeletePackages = true;
      canAddScales = true;
    }

    boolean canChangeAgent =
        !readOnly
            && !exemptionApprover
            && !industryUser
            && actionAllowed
            && context.agentChangeablePermit()
            && authorizationService.canPerformAction(parsedRoles, ACTION_CHANGE_APPLICANT_TYPE);

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
        exemptionApprover,
        canDeletePackages,
        canDeleteScales,
        canChangeAgent);
  }

  /**
   * Existing remarks stay editable after the application details lock, except on an Expired
   * application or for Read Only.
   */
  public void requireRemarkUpdate(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    Set<String> roles = normalizeRoles(sessionService.parseRolesFromPrincipal(authentication));
    boolean readOnly = !roles.contains(ROLE_ADMIN) && isPureReadOnlyRole(roles);
    ApplicationDetailsRpcService.ApplicationEditContext context =
        applicationService == null || applicationNumber == null || applicationNumber < 1
            ? null
            : applicationService.getApplicationEditContext(applicationNumber).orElse(null);
    require(
        !readOnly
            && context != null
            && applicationNumber.equals(context.applicationNumber())
            && "P".equals(normalizeCode(context.jurisdictionCode()))
            && !APPLICATION_STATUS_EXPIRED.equals(normalizeCode(context.applicationStatusCode())),
        "Remark editing is not allowed by the application edit policy.");
  }

  /** True once the application's list date has arrived in business time. */
  public boolean listDateReached(
      ApplicationDetailsRpcService applicationService, Long applicationNumber) {
    if (applicationService == null || applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    return applicationService
        .getApplicationEditContext(applicationNumber)
        .map(context -> listDateReached(context.advertisingDate(), LocalDate.now(clock)))
        .orElse(false);
  }

  private static boolean listDateReached(LocalDate advertisingDate, LocalDate today) {
    return advertisingDate != null && !advertisingDate.isAfter(today);
  }

  public void requireSummaryEdit(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canEditApplicationDetails(),
        "Application summary editing is not allowed by the application edit policy.");
  }

  /** True when the agent can be added or removed although the application details are locked. */
  public boolean allowsAgentChangeOnly(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    ApplicationEditPolicy policy = resolve(authentication, applicationService, applicationNumber);
    return policy.canChangeAgent() && !policy.canEditApplicationDetails();
  }

  public void requirePackageEdit(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canEditPackages(),
        "Package editing is not allowed by the application edit policy.");
  }

  public void requirePackageAdd(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canAddPackages(),
        "Package creation is not allowed by the application edit policy.");
  }

  public void requirePackageDelete(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canDeletePackages(),
        "Package deletion is not allowed by the application edit policy.");
  }

  public void requireScaleAdd(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canAddScales(),
        "Scale creation is not allowed by the application edit policy.");
  }

  public void requireScaleDelete(
      Authentication authentication,
      ApplicationDetailsRpcService applicationService,
      Long applicationNumber) {
    require(
        resolve(authentication, applicationService, applicationNumber).canDeleteScales(),
        "Scale deletion is not allowed by the application edit policy.");
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

  private boolean isPureReadOnlyRole(Set<String> roles) {
    return roles.size() == 1 && roles.contains(ROLE_READ_ONLY);
  }

  private String normalizeCode(String value) {
    return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
  }

  /**
   * {@code canChangeAgent} lets an Application Approver add or remove the agent on a Ministerial or
   * Blanket OIC application after the details lock, while every permit it is on is Active or
   * Payment pending.
   */
  public record ApplicationEditPolicy(
      boolean canEditApplicationDetails,
      boolean canEditPackages,
      boolean canAddPackages,
      boolean canAddScales,
      boolean canUpdatePackageNumber,
      boolean industryUser,
      boolean readOnly,
      boolean exemptionApprover,
      boolean canDeletePackages,
      boolean canDeleteScales,
      boolean canChangeAgent) {

    public ApplicationEditPolicy(
        boolean canEditApplicationDetails,
        boolean canEditPackages,
        boolean canAddPackages,
        boolean canAddScales,
        boolean canUpdatePackageNumber,
        boolean industryUser,
        boolean readOnly,
        boolean exemptionApprover) {
      this(
          canEditApplicationDetails,
          canEditPackages,
          canAddPackages,
          canAddScales,
          canUpdatePackageNumber,
          industryUser,
          readOnly,
          exemptionApprover,
          canAddPackages,
          canAddScales,
          false);
    }

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
          exemptionApprover,
          false,
          false,
          false);
    }

    public boolean anyEditable() {
      return canEditApplicationDetails
          || canEditPackages
          || canAddPackages
          || canAddScales
          || canDeletePackages
          || canDeleteScales
          || canChangeAgent;
    }

    public ApplicationEditPolicy withoutEdits() {
      return denied(industryUser, readOnly, exemptionApprover);
    }
  }
}

package ca.bc.gov.mof.lexis.service.federal;

import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Server-side equivalent of the legacy federal application completed-state edit policy. */
@Service
public class FederalApplicationEditPolicyService {

  private static final String ACTION_EDIT_COMPLETED_APPLICATIONS =
      "/editCompletedApplications";
  private static final String ACTION_MANAGE_FEDERAL_APPLICATION =
      "manageFederalApplication";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final Set<String> COMPLETED_ACTION_STATUSES = Set.of("APP", "EXE");
  private static final Set<String> MINISTRY_WINDOW_STATUSES = Set.of("EXP", "REJ", "WDN");

  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final Clock clock;

  @Autowired
  public FederalApplicationEditPolicyService(
      LexisSessionService sessionService, LexisAuthorizationService authorizationService) {
    this(sessionService, authorizationService, LexisBusinessTime.systemClock());
  }

  FederalApplicationEditPolicyService(
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      Clock clock) {
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  public boolean canEdit(
      Authentication authentication, String applicationStatusCode, LocalDate advertisingDate) {
    List<String> parsedRoles = sessionService.parseRolesFromPrincipal(authentication);
    if (!authorizationService.canPerformAction(
        parsedRoles, ACTION_MANAGE_FEDERAL_APPLICATION)) {
      return false;
    }

    String status = normalizeCode(applicationStatusCode);
    if (status == null) {
      return false;
    }

    if (MINISTRY_WINDOW_STATUSES.contains(status)) {
      Set<String> roles = normalizeRoles(parsedRoles);
      boolean ministryApprover =
          roles.contains(ROLE_ADMIN) || roles.contains(ROLE_APPLICATION_APPROVER);
      return ministryApprover
          && (advertisingDate == null
              || LocalDate.now(clock).isBefore(advertisingDate.plusDays(7)));
    }

    if (COMPLETED_ACTION_STATUSES.contains(status)) {
      return authorizationService.canPerformAction(
          parsedRoles, ACTION_EDIT_COMPLETED_APPLICATIONS);
    }

    return true;
  }

  public void requireEdit(
      Authentication authentication,
      FederalApplicationService.FederalApplicationEditContext context) {
    if (context == null
        || !canEdit(authentication, context.statusCode(), context.listingDate())) {
      denyEdit();
    }
  }

  public void requireEdit(
      Authentication authentication, String applicationStatusCode, LocalDate advertisingDate) {
    if (!canEdit(authentication, applicationStatusCode, advertisingDate)) {
      denyEdit();
    }
  }

  private void denyEdit() {
    throw new AccessDeniedException(
        "Federal application editing is not allowed by the application edit policy.");
  }

  private Set<String> normalizeRoles(List<String> roles) {
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

  private String normalizeCode(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim().toUpperCase(Locale.ROOT);
  }
}

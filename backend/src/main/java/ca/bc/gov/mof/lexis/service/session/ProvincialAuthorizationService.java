package ca.bc.gov.mof.lexis.service.session;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Centralizes provincial object, forest-client, BOIC, and staff access rules. */
@Service
public class ProvincialAuthorizationService {

  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String ROLE_EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final String ROLE_PROVINCIAL_SUBMITTER = "LEXIS_PROVINCIAL_SUBMITTER";

  private final LexisSessionService sessionService;
  private final LexisPrincipalService principalService;
  private final ObjectProvider<LexisApplicationService> applicationServiceProvider;
  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ObjectProvider<ExemptionService> exemptionServiceProvider;
  private final ObjectProvider<PermitService> permitServiceProvider;
  private final ObjectProvider<PurchaseOfferService> offerServiceProvider;

  public ProvincialAuthorizationService(
      LexisSessionService sessionService,
      LexisPrincipalService principalService,
      ObjectProvider<LexisApplicationService> applicationServiceProvider,
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ObjectProvider<ExemptionService> exemptionServiceProvider,
      ObjectProvider<PermitService> permitServiceProvider,
      ObjectProvider<PurchaseOfferService> offerServiceProvider) {
    this.sessionService = sessionService;
    this.principalService = principalService;
    this.applicationServiceProvider = applicationServiceProvider;
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.exemptionServiceProvider = exemptionServiceProvider;
    this.permitServiceProvider = permitServiceProvider;
    this.offerServiceProvider = offerServiceProvider;
  }

  public boolean canAccessApplication(Authentication authentication, Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    if (roles(authentication).contains(ROLE_ADMIN)) {
      return true;
    }
    LexisApplicationService service = applicationServiceProvider.getIfAvailable();
    return service != null
        && service
            .findByApplicationNumber(applicationNumber)
            .map(detail -> canAccessApplication(authentication, detail))
            .orElse(false);
  }

  /** Authorizes a preloaded application projection without another application lookup. */
  public boolean canAccessApplication(
      Authentication authentication, ApplicationAccessContextDto application) {
    if (application == null || application.applicationNumber() == null
        || application.applicationNumber() < 1) {
      return false;
    }
    Set<String> currentRoles = roles(authentication);
    if (currentRoles.contains(ROLE_ADMIN)) {
      return true;
    }
    if ("F".equalsIgnoreCase(application.jurisdictionCode())) {
      return currentRoles.contains(ROLE_APPLICATION_APPROVER)
          || (currentRoles.contains(ROLE_READ_ONLY)
              && canAccessOrgUnits(
                  authentication,
                  application.orgUnitNumber() == null
                      ? List.of()
                      : List.of(application.orgUnitNumber()),
                  OrgUnitSurface.FEDERAL_APPLICATION_SEARCH));
    }
    if (!"P".equalsIgnoreCase(application.jurisdictionCode())) {
      return false;
    }
    String scopedClientNumber = scopedClientNumber(authentication);
    if (scopedClientNumber != null) {
      return matchesClient(
          scopedClientNumber,
          application.ownerClientNumber(),
          application.agentClientNumber());
    }
    return canAccessOrgUnits(
        authentication,
        application.orgUnitNumber() == null
            ? List.of()
            : List.of(application.orgUnitNumber()),
        OrgUnitSurface.APPLICATION_DETAIL);
  }

  public boolean canAccessApplication(
      Authentication authentication, LexisApplicationDetailDto application) {
    if (application == null) {
      return false;
    }
    Set<String> currentRoles = roles(authentication);
    if (currentRoles.contains(ROLE_ADMIN)) {
      return true;
    }
    if ("F".equalsIgnoreCase(application.jurisdictionCode())) {
      return canAccessFederalApplication(authentication, application);
    }
    if (!"P".equalsIgnoreCase(application.jurisdictionCode())) {
      return false;
    }
    String scopedClientNumber = scopedClientNumber(authentication);
    if (scopedClientNumber != null) {
      return matchesApplicationClient(scopedClientNumber, application);
    }
    return canAccessOrgUnits(
        authentication,
        application.orgUnitNumber() == null
            ? List.of()
            : List.of(application.orgUnitNumber()),
        OrgUnitSurface.APPLICATION_DETAIL);
  }

  public boolean canAccessApplicationClientLookup(
      Authentication authentication, Long applicationNumber, String clientNumber) {
    String requestedClientNumber = trimToNull(clientNumber);
    LexisApplicationService service = applicationServiceProvider.getIfAvailable();
    if (service == null
        || applicationNumber == null
        || applicationNumber < 1
        || requestedClientNumber == null) {
      return false;
    }
    return service
        .findByApplicationNumber(applicationNumber)
        .filter(application -> canAccessApplication(authentication, application))
        .map(
            application ->
                matchesClient(
                    requestedClientNumber,
                    application.ownerClientNumber(),
                    application.agentClientNumber()))
        .orElse(false);
  }

  public boolean canReviewApplication(Authentication authentication, Long applicationNumber) {
    LexisApplicationService service = applicationServiceProvider.getIfAvailable();
    if (service == null || applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    return service
        .findByApplicationNumber(applicationNumber)
        .map(
            detail -> {
              if (!canAccessApplication(authentication, detail)) {
                return false;
              }
              OrgUnitConstraint constraint =
                  constrainOrgUnits(
                      authentication,
                      detail.orgUnitNumber() == null
                          ? List.of()
                          : List.of(detail.orgUnitNumber()),
                      OrgUnitSurface.APPLICATION_REVIEW);
              return !constraint.denied()
                  && (!constraint.restricted()
                      || constraint.orgUnitNumbers().contains(detail.orgUnitNumber()));
            })
        .orElse(false);
  }

  public void requireApplicationReview(Authentication authentication, Long applicationNumber) {
    if (!canReviewApplication(authentication, applicationNumber)) {
      throw new AccessDeniedException(
          "The application is outside the authenticated review access scope.");
    }
  }

  public boolean canAccessExemption(Authentication authentication, String exemptionNumber) {
    ExemptionService service = exemptionServiceProvider.getIfAvailable();
    if (service == null || exemptionNumber == null || exemptionNumber.isBlank()) {
      return false;
    }
    return service
        .findAccessByExemptionNumber(exemptionNumber.trim())
        .map(access -> canAccessExemption(authentication, access))
        .orElse(false);
  }

  private boolean canAccessExemption(
      Authentication authentication, ExemptionAccessDto exemption) {
    Set<String> currentRoles = roles(authentication);
    if (!canViewBlanketOic(currentRoles) && exemption.blanketOic()) {
      return false;
    }

    String scopedClientNumber = scopedClientNumber(authentication);
    if (scopedClientNumber != null) {
      if ("NEW".equalsIgnoreCase(exemption.exemptionStatusCode())) {
        return false;
      }
      if (exemption.blanketOic()) {
        return true;
      }
      ExemptionService service = exemptionServiceProvider.getIfAvailable();
      return service != null
          && service.hasLinkedProvincialApplicationForClient(
              exemption.exemptionNumber(), scopedClientNumber);
    }
    if (!isOrgUnitRestricted(currentRoles, OrgUnitSurface.EXEMPTION_DETAIL)) {
      return true;
    }
    ExemptionService service = exemptionServiceProvider.getIfAvailable();
    return service != null
        && canAccessOrgUnits(
            authentication,
            service.findOrgUnitNumbers(exemption.exemptionNumber()),
            OrgUnitSurface.EXEMPTION_DETAIL);
  }

  public boolean canAccessExemption(
      Authentication authentication, ExemptionDetailDto exemption) {
    if (exemption == null) {
      return false;
    }
    Set<String> roles = roles(authentication);
    if (!canViewBlanketOic(roles) && exemption.blanketOic()) {
      return false;
    }

    String scopedClientNumber = scopedClientNumber(authentication);
    if (scopedClientNumber != null) {
      if ("NEW".equalsIgnoreCase(exemption.exemptionStatusCode())) {
        return false;
      }
      return exemption.blanketOic()
          || matchesClient(
              scopedClientNumber, exemption.ownerClientNumber(), exemption.agentClientNumber())
          || canAccessLinkedExemptionApplication(
              scopedClientNumber, exemption.exemptionNumber());
    }
    if (!isOrgUnitRestricted(roles, OrgUnitSurface.EXEMPTION_DETAIL)) {
      return true;
    }
    ExemptionService service = exemptionServiceProvider.getIfAvailable();
    return service != null
        && canAccessOrgUnits(
            authentication,
            service.findOrgUnitNumbers(exemption.exemptionNumber()),
            OrgUnitSurface.EXEMPTION_DETAIL);
  }

  /**
   * Mirrors the legacy BOIC visibility rule: a user whose only applicable LEXIS capability is
   * Exemption Approver cannot see blanket OIC records. Industry submitters, Application Approvers,
   * Read Only users, and Administrators retain visibility.
   */
  public boolean canViewBlanketOic(Authentication authentication) {
    return canViewBlanketOic(roles(authentication));
  }

  public boolean canAccessPermit(Authentication authentication, Long permitNumber) {
    PermitService service = permitServiceProvider.getIfAvailable();
    if (service == null || permitNumber == null || permitNumber < 1) {
      return false;
    }
    return service
        .findAccessByPermitNumber(permitNumber)
        .map(detail -> canAccessPermit(authentication, detail))
        .orElse(false);
  }

  public boolean canAccessPermit(
      Authentication authentication, PermitDetailDto permit) {
    if (permit == null) {
      return false;
    }
    return canAccessPermit(
        authentication,
        permit.permitNumber(),
        permit.ownerClientNumber(),
        permit.applicantClientNumber(),
        permit.orgUnitNumber());
  }

  public boolean canAccessPermitClientLookup(
      Authentication authentication, Long permitNumber, String clientNumber) {
    String requestedClientNumber = trimToNull(clientNumber);
    PermitService service = permitServiceProvider.getIfAvailable();
    if (service == null
        || permitNumber == null
        || permitNumber < 1
        || requestedClientNumber == null) {
      return false;
    }
    return service
        .findAccessByPermitNumber(permitNumber)
        .filter(permit -> canAccessPermit(authentication, permit))
        .map(
            permit ->
                matchesClient(
                    requestedClientNumber,
                    permit.ownerClientNumber(),
                    permit.applicantClientNumber()))
        .orElse(false);
  }

  private boolean canAccessPermit(Authentication authentication, PermitAccessDto permit) {
    return canAccessPermit(
        authentication,
        permit.permitNumber(),
        permit.ownerClientNumber(),
        permit.applicantClientNumber(),
        permit.orgUnitNumber());
  }

  /**
   * Legacy OIC and Blanket OIC permit lists authorize industry users from the permit owner/agent
   * fields only. The supplied projection avoids reloading each permit while rendering an
   * exemption's permit table.
   */
  public boolean canAccessExemptionPermit(
      Authentication authentication, PermitAccessDto permit, boolean oicLike) {
    if (permit == null) {
      return false;
    }
    String scopedClientNumber = scopedClientNumber(authentication);
    if (oicLike && scopedClientNumber != null) {
      return matchesClient(
          scopedClientNumber,
          permit.ownerClientNumber(),
          permit.applicantClientNumber());
    }
    return canAccessPermit(authentication, permit);
  }

  private boolean canAccessPermit(
      Authentication authentication,
      Long permitNumber,
      String ownerClientNumber,
      String applicantClientNumber,
      Long orgUnitNumber) {
    String scopedClientNumber = scopedClientNumber(authentication);
    if (scopedClientNumber != null) {
      return matchesClient(
              scopedClientNumber,
              ownerClientNumber,
              applicantClientNumber)
          || canAccessLinkedPermitApplication(
              scopedClientNumber, permitNumber);
    }
    if (!isOrgUnitRestricted(roles(authentication), OrgUnitSurface.PERMIT_DETAIL)) {
      return true;
    }
    return canAccessOrgUnits(
        authentication,
        orgUnitNumber == null ? List.of() : List.of(orgUnitNumber),
        OrgUnitSurface.PERMIT_DETAIL);
  }

  /** Staff roles with federal read authority use the global FAM staff view. */
  public boolean canAccessFederalApplication(
      Authentication authentication, Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    Set<String> currentRoles = roles(authentication);
    if (currentRoles.contains(ROLE_ADMIN)
        || currentRoles.contains(ROLE_APPLICATION_APPROVER)) {
      return true;
    }
    if (!currentRoles.contains(ROLE_READ_ONLY)) {
      return false;
    }

    LexisApplicationService service = applicationServiceProvider.getIfAvailable();
    return service != null
        && service
            .findByApplicationNumber(applicationNumber)
            .filter(detail -> "F".equalsIgnoreCase(detail.jurisdictionCode()))
            .map(detail -> canAccessFederalApplication(authentication, detail))
            .orElse(false);
  }

  public boolean canAccessOffer(Authentication authentication, Long offerNumber) {
    PurchaseOfferService offerService = offerServiceProvider.getIfAvailable();
    if (offerService == null || offerNumber == null || offerNumber < 1) {
      return false;
    }
    return offerService
        .findByOfferNumber(offerNumber)
        .map(detail -> canAccessOffer(authentication, detail))
        .orElse(false);
  }

  public boolean canAccessOffer(
      Authentication authentication, PurchaseOfferDetailDto offer) {
    if (offer == null) {
      return false;
    }
    String scopedClientNumber = scopedClientNumber(authentication);
    if (scopedClientNumber != null) {
      return canAccessOffer(scopedClientNumber, offer);
    }
    if (!isOrgUnitRestricted(roles(authentication), OrgUnitSurface.OFFER_DETAIL)) {
      return true;
    }
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    return applicationService != null
        && offer.applicationNumber() != null
        && offer.applicationNumber() > 0
        && applicationService
            .findByApplicationNumber(offer.applicationNumber())
            .map(
                application ->
                    canAccessOrgUnits(
                        authentication,
                        application.orgUnitNumber() == null
                            ? List.of()
                            : List.of(application.orgUnitNumber()),
                        OrgUnitSurface.OFFER_DETAIL))
            .orElse(false);
  }

  public boolean canCreateForClient(
      Authentication authentication, String ownerClientNumber, String agentClientNumber) {
    String scopedClientNumber = scopedClientNumber(authentication);
    return scopedClientNumber == null
        || matchesClient(scopedClientNumber, ownerClientNumber, agentClientNumber);
  }

  public boolean hasClientScope(Authentication authentication) {
    return scopedClientNumber(authentication) != null;
  }

  public String scopedForestClientNumber(Authentication authentication) {
    return scopedClientNumber(authentication);
  }

  public OrgUnitConstraint constrainOrgUnits(
      Authentication authentication, List<Long> requestedOrgUnits, OrgUnitSurface surface) {
    Set<String> roles = roles(authentication);
    if (roles.contains(ROLE_ADMIN) || !isOrgUnitRestricted(roles, surface)) {
      return new OrgUnitConstraint(false, sanitizePositive(requestedOrgUnits));
    }

    List<Long> authorized =
        sanitizePositive(principalService.resolveOrgUnitNumbers(authentication));
    if (authorized.isEmpty()) {
      return new OrgUnitConstraint(true, List.of());
    }
    Set<Long> authorizedSet = Set.copyOf(authorized);
    List<Long> requested = sanitizePositive(requestedOrgUnits);
    if (requested.isEmpty()) {
      return new OrgUnitConstraint(true, authorized);
    }
    return new OrgUnitConstraint(
        true, requested.stream().filter(authorizedSet::contains).toList());
  }

  /**
   * Resolves the complete organization-unit scope for a surface. An unrestricted result means the
   * authenticated role is not organization-unit scoped on that surface.
   */
  public OrgUnitConstraint resolveOrgUnitConstraint(
      Authentication authentication, OrgUnitSurface surface) {
    return constrainOrgUnits(authentication, List.of(), surface);
  }

  /** Requires a requested organization unit to be within the authenticated role's scope. */
  public void requireOrgUnit(
      Authentication authentication, Long requestedOrgUnit, OrgUnitSurface surface) {
    requireOrgUnits(
        authentication,
        requestedOrgUnit == null ? List.of() : List.of(requestedOrgUnit),
        surface);
  }

  /**
   * Requires every positive requested organization unit to be within the authenticated role's
   * scope. Empty input is left to the mutation's business validation because it does not request a
   * scope change.
   */
  public void requireOrgUnits(
      Authentication authentication, List<Long> requestedOrgUnits, OrgUnitSurface surface) {
    List<Long> requested = sanitizePositive(requestedOrgUnits);
    if (requested.isEmpty()) {
      return;
    }
    OrgUnitConstraint constraint = constrainOrgUnits(authentication, requested, surface);
    if (!requested.stream().allMatch(constraint::allows)) {
      throw new AccessDeniedException(
          "One or more organization units are outside the authenticated access scope.");
    }
  }

  public void requireApplication(Authentication authentication, Long applicationNumber) {
    if (!canAccessApplication(authentication, applicationNumber)) {
      throw new AccessDeniedException("The application is outside the authenticated access scope.");
    }
  }

  public void requireExemption(Authentication authentication, String exemptionNumber) {
    if (!canAccessExemption(authentication, exemptionNumber)) {
      throw new AccessDeniedException("The exemption is outside the authenticated access scope.");
    }
  }

  public void requirePermit(Authentication authentication, Long permitNumber) {
    if (!canAccessPermit(authentication, permitNumber)) {
      throw new AccessDeniedException("The permit is outside the authenticated access scope.");
    }
  }

  public void requireApplicationAttachmentMutation(
      Authentication authentication, Long applicationNumber) {
    LexisApplicationService service = applicationServiceProvider.getIfAvailable();
    LexisApplicationDetailDto application =
        service == null || applicationNumber == null || applicationNumber < 1
            ? null
            : service.findByApplicationNumber(applicationNumber).orElse(null);
    if (application == null) {
      throw attachmentMutationDenied("application");
    }

    Set<String> currentRoles = roles(authentication);
    boolean allowed = isStaffAttachmentWriter(currentRoles);
    if (!allowed) {
      String scopedClientNumber = scopedClientNumber(authentication);
      allowed =
          scopedClientNumber != null
              && currentRoles.contains(ROLE_PROVINCIAL_SUBMITTER)
              && "P".equalsIgnoreCase(application.jurisdictionCode())
              && matchesApplicationClient(scopedClientNumber, application);
    }
    if (!allowed) {
      throw attachmentMutationDenied("application");
    }
  }

  public void requireApplicationAttachmentPersistence(
      Authentication authentication, Long applicationNumber) {
    requireApplicationAttachmentMutation(authentication, applicationNumber);
    Set<String> currentRoles = roles(authentication);
    if (isStaffAttachmentWriter(currentRoles)) {
      return;
    }

    ApplicationDetailsRpcService service = applicationDetailsServiceProvider.getIfAvailable();
    ApplicationDetailsRpcService.ApplicationEditContext context =
        service == null || applicationNumber == null || applicationNumber < 1
            ? null
            : service.getApplicationEditContext(applicationNumber).orElse(null);
    if (context == null
        || !applicationNumber.equals(context.applicationNumber())
        || context.hasCompletePermit()) {
      throw attachmentMutationDenied("application");
    }
  }

  public void requireExemptionAttachmentMutation(
      Authentication authentication, String exemptionNumber) {
    ExemptionService service = exemptionServiceProvider.getIfAvailable();
    String normalizedNumber =
        exemptionNumber == null || exemptionNumber.isBlank() ? null : exemptionNumber.trim();
    ExemptionDetailDto exemption =
        service == null || normalizedNumber == null
            ? null
            : service.findByExemptionNumber(normalizedNumber).orElse(null);
    if (exemption == null) {
      throw attachmentMutationDenied("exemption");
    }

    Set<String> currentRoles = roles(authentication);
    boolean allowed = isStaffAttachmentWriter(currentRoles);
    if (!allowed) {
      String scopedClientNumber = scopedClientNumber(authentication);
      allowed =
          scopedClientNumber != null
              && currentRoles.contains(ROLE_PROVINCIAL_SUBMITTER)
              && !exemption.blanketOic()
              && !"NEW".equalsIgnoreCase(exemption.exemptionStatusCode())
              && (matchesClient(
                      scopedClientNumber,
                      exemption.ownerClientNumber(),
                      exemption.agentClientNumber())
                  || canAccessLinkedExemptionApplication(
                      scopedClientNumber, exemption.exemptionNumber()));
    }
    if (!allowed) {
      throw attachmentMutationDenied("exemption");
    }
  }

  public void requirePermitAttachmentMutation(
      Authentication authentication, Long permitNumber) {
    PermitService service = permitServiceProvider.getIfAvailable();
    PermitDetailDto permit =
        service == null || permitNumber == null || permitNumber < 1
            ? null
            : service.findByPermitNumber(permitNumber).orElse(null);
    if (permit == null) {
      throw attachmentMutationDenied("permit");
    }

    Set<String> currentRoles = roles(authentication);
    boolean allowed = isStaffAttachmentWriter(currentRoles);
    if (!allowed) {
      String scopedClientNumber = scopedClientNumber(authentication);
      allowed =
          scopedClientNumber != null
              && currentRoles.contains(ROLE_PROVINCIAL_SUBMITTER)
              && canAccessPermit(authentication, permit);
    }
    if (!allowed) {
      throw attachmentMutationDenied("permit");
    }
  }

  public void requireFederalApplication(
      Authentication authentication, Long applicationNumber) {
    if (!canAccessFederalApplication(authentication, applicationNumber)) {
      throw new AccessDeniedException(
          "The federal application is outside the authenticated access scope.");
    }
  }

  private boolean canAccessOffer(String scopedClientNumber, PurchaseOfferDetailDto offer) {
    if (matchesClient(scopedClientNumber, offer.offeringClientNumber())) {
      return true;
    }
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    return applicationService != null
        && offer.applicationNumber() != null
        && applicationService
            .findByApplicationNumber(offer.applicationNumber())
            .map(detail -> matchesApplicationClient(scopedClientNumber, detail))
            .orElse(false);
  }

  private boolean canAccessLinkedPermitApplication(
      String scopedClientNumber, Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return false;
    }
    PermitService permitService = permitServiceProvider.getIfAvailable();
    if (permitService == null) {
      return false;
    }
    return permitService.hasLinkedProvincialApplicationForClient(
        permitNumber, scopedClientNumber);
  }

  private boolean canAccessLinkedExemptionApplication(
      String scopedClientNumber, String exemptionNumber) {
    ExemptionService exemptionService = exemptionServiceProvider.getIfAvailable();
    if (exemptionService == null) {
      return false;
    }
    return exemptionService.hasLinkedProvincialApplicationForClient(
        exemptionNumber, scopedClientNumber);
  }

  private boolean canAccessFederalApplication(
      Authentication authentication, LexisApplicationDetailDto application) {
    Set<String> currentRoles = roles(authentication);
    if (currentRoles.contains(ROLE_ADMIN)
        || currentRoles.contains(ROLE_APPLICATION_APPROVER)) {
      return true;
    }
    return currentRoles.contains(ROLE_READ_ONLY)
        && canAccessOrgUnits(
            authentication,
            application.orgUnitNumber() == null
                ? List.of()
                : List.of(application.orgUnitNumber()),
            OrgUnitSurface.FEDERAL_APPLICATION_SEARCH);
  }

  private boolean matchesApplicationClient(
      String scopedClientNumber, LexisApplicationDetailDto application) {
    return matchesClient(
        scopedClientNumber, application.ownerClientNumber(), application.agentClientNumber());
  }

  private boolean matchesClient(String scopedClientNumber, String... candidates) {
    if (scopedClientNumber == null) {
      return true;
    }
    for (String candidate : candidates) {
      if (candidate != null && scopedClientNumber.equals(candidate.trim())) {
        return true;
      }
    }
    return false;
  }

  private AccessDeniedException attachmentMutationDenied(String recordType) {
    return new AccessDeniedException(
        "The " + recordType + " is outside the authenticated attachment-write scope.");
  }

  private boolean isStaffAttachmentWriter(Set<String> currentRoles) {
    return currentRoles.contains(ROLE_ADMIN)
        || currentRoles.contains(ROLE_APPLICATION_APPROVER);
  }

  private String scopedClientNumber(Authentication authentication) {
    LexisSessionService.ForestClientScope scope =
        sessionService.resolveForestClientScope(authentication);
    if (scope.invalid() || scope.selectionRequired()) {
      throw new AccessDeniedException(scope.failureReason());
    }
    return scope.clientNumber();
  }

  private Set<String> roles(Authentication authentication) {
    return Set.copyOf(sessionService.parseRolesFromPrincipal(authentication));
  }

  private boolean canViewBlanketOic(Set<String> roles) {
    return !roles.contains(ROLE_EXEMPTION_APPROVER)
        || roles.contains(ROLE_ADMIN)
        || roles.contains(ROLE_APPLICATION_APPROVER)
        || roles.contains(ROLE_READ_ONLY)
        || roles.contains(ROLE_PROVINCIAL_SUBMITTER);
  }

  private boolean isOrgUnitRestricted(Set<String> roles, OrgUnitSurface surface) {
    // Current FAM staff roles are global and are not organization-unit restricted.
    return false;
  }

  private boolean canAccessOrgUnits(
      Authentication authentication, List<Long> objectOrgUnits, OrgUnitSurface surface) {
    OrgUnitConstraint constraint = constrainOrgUnits(authentication, objectOrgUnits, surface);
    return !constraint.denied()
        && (!constraint.restricted()
            || sanitizePositive(objectOrgUnits).stream()
                .anyMatch(constraint.orgUnitNumbers()::contains));
  }

  private List<Long> sanitizePositive(List<Long> values) {
    if (values == null || values.isEmpty()) {
      return List.of();
    }
    LinkedHashSet<Long> sanitized = new LinkedHashSet<>();
    values.stream().filter(value -> value != null && value > 0).forEach(sanitized::add);
    return List.copyOf(sanitized);
  }

  public enum OrgUnitSurface {
    APPLICATION_SEARCH,
    APPLICATION_DETAIL,
    APPLICATION_WRITE,
    EXEMPTION_SEARCH,
    EXEMPTION_DETAIL,
    EXEMPTION_WRITE,
    OFFER_SEARCH,
    OFFER_DETAIL,
    PERMIT_SEARCH,
    PERMIT_DETAIL,
    FEDERAL_APPLICATION_SEARCH,
    APPLICATION_REVIEW
  }

  public record OrgUnitConstraint(boolean restricted, List<Long> orgUnitNumbers) {
    public OrgUnitConstraint {
      orgUnitNumbers =
          orgUnitNumbers == null
              ? List.of()
              : orgUnitNumbers.stream()
                  .filter(value -> value != null && value > 0)
                  .distinct()
                  .toList();
    }

    public boolean denied() {
      return restricted && orgUnitNumbers.isEmpty();
    }

    public boolean allows(Long orgUnitNumber) {
      return !restricted
          || (orgUnitNumber != null
              && orgUnitNumber > 0
              && orgUnitNumbers.contains(orgUnitNumber));
    }
  }
}

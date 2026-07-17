package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseApplicationNumbers;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.currentForestClientNumber;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationOfferValidationDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationValidationDto;
import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService.ApplicationEditPolicy;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/applications")
@Validated
public class LexisApplicationController {

  private static final String ACTION_APPLICATION_REMARKS = "/applicationRemarks";
  private static final String LEGACY_ACTION_APPLICATIONS_REVIEW = "/applicationsReview";

  private final LexisApplicationService service;
  private final ApplicationEditLockService editLockService;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final ProvincialAuthorizationService provincialAuthorizationService;
  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ApplicationEditPolicyService applicationEditPolicyService;
  private LexisPrincipalService principalService;

  public LexisApplicationController(
      LexisApplicationService service,
      ApplicationEditLockService editLockService,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      ProvincialAuthorizationService provincialAuthorizationService,
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ApplicationEditPolicyService applicationEditPolicyService) {
    this.service = service;
    this.editLockService = editLockService;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.provincialAuthorizationService = provincialAuthorizationService;
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.applicationEditPolicyService = applicationEditPolicyService;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
  }

  @GetMapping("/search/options")
  public ResponseEntity<LexisApplicationSearchOptionsDto> searchOptions() {
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<LexisApplicationSearchResponseDto> search(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "exemptionType", required = false) String exemptionType,
      @RequestParam(name = "applicationStatus", required = false) String applicationStatus,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "agentClientNumber", required = false) String agentClientNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "knownTotal", required = false) @PositiveOrZero Integer knownTotal,
      Authentication authentication) {

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null) {
      ownerClientNumber = null;
      agentClientNumber = scopedClientNumber;
    }
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.APPLICATION_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new LexisApplicationSearchResponseDto(List.of(), 0, page, size));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

    LexisApplicationSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            exemptionNumber,
            exemptionType,
            applicationStatus,
            ownerClientNumber,
            agentClientNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            regionNumbers,
            scopedClientNumber != null,
            sortField,
            page,
            size);
    LexisApplicationSearchResponseDto response =
        knownTotal == null ? service.search(criteria) : service.search(criteria, knownTotal);
    return ResponseEntity.ok(withSearchLocks(response, authentication));
  }

  @GetMapping("/search/count")
  public ResponseEntity<SearchCountResponseDto> count(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "exemptionType", required = false) String exemptionType,
      @RequestParam(name = "applicationStatus", required = false) String applicationStatus,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "agentClientNumber", required = false) String agentClientNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      Authentication authentication) {
    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null) {
      ownerClientNumber = null;
      agentClientNumber = scopedClientNumber;
    }
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.APPLICATION_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new SearchCountResponseDto(0));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

    LexisApplicationSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            exemptionNumber,
            exemptionType,
            applicationStatus,
            ownerClientNumber,
            agentClientNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            regionNumbers,
            scopedClientNumber != null,
            null,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{applicationNumber}")
  public ResponseEntity<LexisApplicationDetailDto> getByApplicationNumber(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      Authentication authentication) {
    return service.findByApplicationNumber(applicationNumber)
        .filter(detail -> provincialAuthorizationService.canAccessApplication(authentication, detail))
        .map(detail -> ResponseEntity.ok(withEditLock(detail, authentication)))
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @GetMapping("/search/verify-clients")
  public ResponseEntity<LexisApplicationValidationDto> verifyClients(
      @RequestParam(name = "applications") String applications,
      Authentication authentication) {
    List<Long> ids = parseApplicationNumbers(applications);
    ids.forEach(id -> provincialAuthorizationService.requireApplication(authentication, id));
    return ResponseEntity.ok(new LexisApplicationValidationDto(service.verifyApplicationClients(ids)));
  }

  @GetMapping("/search/has-valid-offer")
  public ResponseEntity<LexisApplicationOfferValidationDto> hasValidOffer(
      @RequestParam(name = "applications") String applications,
      Authentication authentication) {
    List<Long> ids = parseApplicationNumbers(applications);
    ids.forEach(id -> provincialAuthorizationService.requireApplication(authentication, id));
    return ResponseEntity.ok(new LexisApplicationOfferValidationDto(service.hasValidOffer(ids)));
  }

  private LexisApplicationSearchCriteria buildCriteria(
      String applicationNumber,
      String packageNumber,
      String exemptionNumber,
      String exemptionType,
      String applicationStatus,
      String ownerClientNumber,
      String agentClientNumber,
      String productTypeCode,
      String receivedFromDate,
      String receivedToDate,
      String listingFromDate,
      String listingToDate,
      List<Long> regionNumbers,
      boolean broadClientMatch,
      String sortField,
      Integer page,
      Integer size) {
    return new LexisApplicationSearchCriteria(
        applicationNumber,
        packageNumber,
        exemptionNumber,
        exemptionType,
        applicationStatus,
        ownerClientNumber,
        agentClientNumber,
        productTypeCode,
        parseSearchDate(receivedFromDate),
        parseSearchDate(receivedToDate),
        parseSearchDate(listingFromDate),
        parseSearchDate(listingToDate),
        regionNumbers == null ? List.of() : regionNumbers,
        broadClientMatch,
        sortField,
        page,
        size);
  }

  private LexisApplicationDetailDto withEditLock(
      LexisApplicationDetailDto detail, Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ApplicationEditPolicy policy =
        applicationEditPolicyService.resolve(
            authentication,
            applicationDetailsServiceProvider.getIfAvailable(),
            detail.applicationNumber());
    boolean canEdit = policy.anyEditable();
    boolean showLockOwner =
        authorizationService.canPerformAction(roles, LEGACY_ACTION_APPLICATIONS_REVIEW);
    boolean canViewRemarks =
        authorizationService.canPerformAction(roles, ACTION_APPLICATION_REMARKS);
    String userId = auditUser(authentication);
    ApplicationEditLockDto editLock =
        canEdit
            ? editLockService.acquire(detail.applicationNumber(), userId, userId, showLockOwner)
            : editLockService.snapshot(detail.applicationNumber(), userId, showLockOwner);
    boolean locked = detail.locked() || editLock.locked();
    ApplicationEditPolicy effectivePolicy = locked ? policy.withoutEdits() : policy;
    return new LexisApplicationDetailDto(
        detail.applicationNumber(),
        detail.exemptionNumber(),
        detail.applicationStatusCode(),
        detail.statusDescription(),
        detail.ownerClientNumber(),
        detail.agentClientNumber(),
        detail.orgUnitNumber(),
        detail.orgUnitName(),
        detail.productTypeCode(),
        detail.exemptionReasonCode(),
        detail.applicationDate(),
        detail.receivedDate(),
        detail.listingDate(),
        detail.teacMeetingDate(),
        detail.termDays(),
        detail.applicationVolume(),
        detail.averageLogVolume(),
        detail.canCreateOffers(),
        effectivePolicy.industryUser(),
        effectivePolicy.readOnly(),
        effectivePolicy.exemptionApprover(),
        effectivePolicy.canEditApplicationDetails(),
        effectivePolicy.canEditPackages(),
        effectivePolicy.canAddPackages(),
        effectivePolicy.canAddScales(),
        effectivePolicy.canUpdatePackageNumber(),
        locked,
        editLock.lockedBy(),
        editLock.message(),
        detail.packages(),
        canViewRemarks ? detail.remarks() : List.of(),
        detail.offers(),
        detail.jurisdictionCode(),
        detail.author());
  }

  private LexisApplicationSearchResponseDto withSearchLocks(
      LexisApplicationSearchResponseDto response, Authentication authentication) {
    if (response == null || response.results() == null || response.results().isEmpty()) {
      return response;
    }

    String userId = auditUser(authentication);
    List<LexisApplicationSearchResultDto> results =
        response.results().stream()
            .map(row -> withSearchLock(row, userId))
            .toList();
    return new LexisApplicationSearchResponseDto(
        results, response.total(), response.page(), response.size());
  }

  private LexisApplicationSearchResultDto withSearchLock(
      LexisApplicationSearchResultDto row, String userId) {
    ApplicationEditLockDto lock = editLockService.snapshot(row.application(), userId, false);
    if (!lock.locked()) {
      return row;
    }
    return new LexisApplicationSearchResultDto(
        row.application(),
        row.status(),
        row.client(),
        row.ownerClientNumber(),
        row.exemptionNumber(),
        row.listingDate(),
        row.region(),
        row.applicationVolume(),
        row.showCheckbox(),
        true);
  }

  private String auditUser(Authentication authentication) {
    if (principalService != null) {
      return principalService.resolvePrincipalName(authentication);
    }
    return authentication == null ? null : authentication.getName();
  }
}

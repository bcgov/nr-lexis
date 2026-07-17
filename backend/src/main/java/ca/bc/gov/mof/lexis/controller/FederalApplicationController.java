package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.firstPresent;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseApplicationNumbers;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationRemarkDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationValidationDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/lexis/federal/applications")
@Validated
public class FederalApplicationController {

  private static final Logger LOGGER = LoggerFactory.getLogger(FederalApplicationController.class);
  private static final String LOCKED_MESSAGE =
      "This application is currently locked for editing by another user. The ability to make changes has been disabled.";
  private static final String LOCK_STATE_UNAVAILABLE_MESSAGE =
      "Application edit lock state could not be verified. Editing is unavailable until the application is reloaded.";

  private final ObjectProvider<FederalApplicationService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final ApplicationEditLockService editLockService;
  private final ApplicationPermitOperationCoordinator operationCoordinator;
  private LexisPrincipalService principalService;
  private ProvincialAuthorizationService provincialAuthorizationService;

  public FederalApplicationController(
      ObjectProvider<FederalApplicationService> serviceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      ApplicationEditLockService editLockService,
      ApplicationPermitOperationCoordinator operationCoordinator) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.editLockService = editLockService;
    this.operationCoordinator = operationCoordinator;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
  }

  @Autowired
  void setProvincialAuthorizationService(
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @GetMapping("/search/options")
  public ResponseEntity<FederalApplicationSearchOptionsDto> searchOptions() {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<FederalApplicationSearchResponseDto> search(
      @RequestParam(name = "applicationNumber", required = false) String federalApplicationNumber,
      @RequestParam(name = "federalApplicationNumber", required = false) String federalApplicationNumberAlias,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "applicationStatus", required = false) String applicationStatus,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "agentClientNumber", required = false) String agentClientNumber,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "knownTotal", required = false) @PositiveOrZero Integer knownTotal) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    OrgUnitConstraint orgUnits = federalSearchOrgUnits();
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new FederalApplicationSearchResponseDto(List.of(), 0, page, size));
    }
    FederalApplicationSearchCriteria criteria =
        buildCriteria(
            federalApplicationNumber,
            federalApplicationNumberAlias,
            packageNumber,
            exemptionNumber,
            applicationStatus,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            ownerClientNumber,
            agentClientNumber,
            orgUnits.orgUnitNumbers(),
            page,
            size);

    if (knownTotal != null) {
      return ResponseEntity.ok(service.search(criteria, knownTotal));
    }
    return ResponseEntity.ok(service.search(criteria));
  }

  @GetMapping("/search/count")
  public ResponseEntity<SearchCountResponseDto> count(
      @RequestParam(name = "applicationNumber", required = false) String federalApplicationNumber,
      @RequestParam(name = "federalApplicationNumber", required = false) String federalApplicationNumberAlias,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "applicationStatus", required = false) String applicationStatus,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "agentClientNumber", required = false) String agentClientNumber) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    OrgUnitConstraint orgUnits = federalSearchOrgUnits();
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new SearchCountResponseDto(0));
    }
    FederalApplicationSearchCriteria criteria =
        buildCriteria(
            federalApplicationNumber,
            federalApplicationNumberAlias,
            packageNumber,
            exemptionNumber,
            applicationStatus,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            ownerClientNumber,
            agentClientNumber,
            orgUnits.orgUnitNumbers(),
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{applicationNumber}")
  public ResponseEntity<FederalApplicationDetailDto> getByApplicationNumber(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      Authentication authentication) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for detail");
      return ResponseEntity.noContent().build();
    }
    return service.findByApplicationNumber(applicationNumber)
        .filter(
            ignored ->
                provincialAuthorizationService.canAccessFederalApplication(
                    authentication, applicationNumber))
        .map(detail -> ResponseEntity.ok(withEditLock(detail, authentication)))
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @GetMapping("/{applicationNumber}/permit")
  public ResponseEntity<FederalApplicationPermitDto> getFederalPermit(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      Authentication authentication) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for permit lookup");
      return ResponseEntity.noContent().build();
    }
    provincialAuthorizationService.requireFederalApplication(
        authentication, applicationNumber);
    return service.findPermitByApplicationNumber(applicationNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @GetMapping("/{applicationNumber}/remarks")
  public ResponseEntity<List<FederalApplicationRemarkDto>> getRemarks(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      Authentication authentication) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.noContent().build();
    }
    provincialAuthorizationService.requireFederalApplication(
        authentication, applicationNumber);
    return service.findRemarksByApplicationNumber(applicationNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @PostMapping("/{applicationNumber}/remarks")
  public ResponseEntity<FederalApplicationService.FederalRemarkMutationResult> addRemark(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody FederalApplicationService.FederalRemarkMutationRequest request,
      Authentication authentication) {
    if (!canManageFederalApplication(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.noContent().build();
    }
    provincialAuthorizationService.requireFederalApplication(
        authentication, applicationNumber);
    String userId = principal(authentication);
    return ResponseEntity.ok(
        operationCoordinator.executeApplicationLocalMutation(
            applicationNumber,
            () -> {
              provincialAuthorizationService.requireFederalApplication(
                  authentication, applicationNumber);
              return withApplicationEditLock(
                  applicationNumber,
                  userId,
                  () -> service.addRemark(applicationNumber, request, userId));
            }));
  }

  @PutMapping("/{applicationNumber}/remarks/{remarkId}")
  public ResponseEntity<FederalApplicationService.FederalRemarkMutationResult> updateRemark(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @PathVariable("remarkId") @Positive Long remarkId,
      @RequestBody FederalApplicationService.FederalRemarkMutationRequest request,
      Authentication authentication) {
    if (!canManageFederalApplication(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.noContent().build();
    }
    provincialAuthorizationService.requireFederalApplication(
        authentication, applicationNumber);
    String userId = principal(authentication);
    return ResponseEntity.ok(
        operationCoordinator.executeApplicationLocalMutation(
            applicationNumber,
            () -> {
              provincialAuthorizationService.requireFederalApplication(
                  authentication, applicationNumber);
              return withApplicationEditLock(
                  applicationNumber,
                  userId,
                  () ->
                      service.updateRemark(
                          applicationNumber, remarkId, request, userId));
            }));
  }

  @PostMapping("/{applicationNumber}/permit")
  public ResponseEntity<FederalApplicationService.FederalMutationResult> addFederalPermit(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody FederalApplicationService.FederalPermitMutationRequest request,
      Authentication authentication) {
    if (!canManageFederalApplication(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) return ResponseEntity.noContent().build();
    provincialAuthorizationService.requireFederalApplication(
        authentication, applicationNumber);
    String userId = principal(authentication);
    return ResponseEntity.ok(
        operationCoordinator.executeApplicationLocalMutation(
            applicationNumber,
            () -> {
              provincialAuthorizationService.requireFederalApplication(
                  authentication, applicationNumber);
              return withApplicationEditLock(
                  applicationNumber,
                  userId,
                  () -> service.addPermit(applicationNumber, request, userId));
            }));
  }

  @PutMapping("/{applicationNumber}/permit")
  public ResponseEntity<FederalApplicationService.FederalMutationResult> updateFederalPermit(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody FederalApplicationService.FederalPermitMutationRequest request,
      Authentication authentication) {
    if (!canManageFederalApplication(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) return ResponseEntity.noContent().build();
    provincialAuthorizationService.requireFederalApplication(
        authentication, applicationNumber);
    String userId = principal(authentication);
    return ResponseEntity.ok(
        operationCoordinator.executeApplicationLocalMutation(
            applicationNumber,
            () -> {
              provincialAuthorizationService.requireFederalApplication(
                  authentication, applicationNumber);
              return withApplicationEditLock(
                  applicationNumber,
                  userId,
                  () -> service.updatePermit(applicationNumber, request, userId));
            }));
  }

  @PostMapping("/{applicationNumber}/status")
  public ResponseEntity<FederalApplicationService.FederalMutationResult> updateFederalStatus(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody FederalApplicationService.FederalStatusMutationRequest request,
      Authentication authentication) {
    if (!canManageFederalApplication(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) return ResponseEntity.noContent().build();
    provincialAuthorizationService.requireFederalApplication(
        authentication, applicationNumber);
    String userId = principal(authentication);
    return ResponseEntity.ok(
        operationCoordinator.executeApplicationLocalMutation(
            applicationNumber,
            () -> {
              provincialAuthorizationService.requireFederalApplication(
                  authentication, applicationNumber);
              return withApplicationEditLock(
                  applicationNumber,
                  userId,
                  () -> service.updateStatus(applicationNumber, request, userId));
            }));
  }

  @GetMapping("/search/verify-clients")
  public ResponseEntity<FederalApplicationValidationDto> verifyClients(
      @RequestParam(name = "applications") String applications,
      Authentication authentication) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for verify clients");
      return ResponseEntity.noContent().build();
    }
    List<Long> ids = parseApplicationNumbers(applications);
    ids.forEach(
        applicationNumber ->
            provincialAuthorizationService.requireFederalApplication(
                authentication, applicationNumber));
    return ResponseEntity.ok(new FederalApplicationValidationDto(service.verifyApplicationClients(ids)));
  }

  private FederalApplicationSearchCriteria buildCriteria(
      String federalApplicationNumber,
      String federalApplicationNumberAlias,
      String packageNumber,
      String exemptionNumber,
      String applicationStatus,
      String receivedFromDate,
      String receivedToDate,
      String listingFromDate,
      String listingToDate,
      String ownerClientNumber,
      String agentClientNumber,
      List<Long> regionNumbers,
      Integer page,
      Integer size) {
    return new FederalApplicationSearchCriteria(
        firstPresent(federalApplicationNumberAlias, federalApplicationNumber),
        packageNumber,
        exemptionNumber,
        applicationStatus,
        parseSearchDate(receivedFromDate),
        parseSearchDate(receivedToDate),
        parseSearchDate(listingFromDate),
        parseSearchDate(listingToDate),
        ownerClientNumber,
        agentClientNumber,
        regionNumbers == null ? List.of() : regionNumbers,
        page,
        size);
  }

  private OrgUnitConstraint federalSearchOrgUnits() {
    if (provincialAuthorizationService == null) {
      return new OrgUnitConstraint(false, List.of());
    }
    return provincialAuthorizationService.constrainOrgUnits(
        SecurityContextHolder.getContext().getAuthentication(),
        List.of(),
        OrgUnitSurface.FEDERAL_APPLICATION_SEARCH);
  }

  private boolean canManageFederalApplication(Authentication authentication) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), "manageFederalApplication");
  }

  private FederalApplicationDetailDto withEditLock(
      FederalApplicationDetailDto detail, Authentication authentication) {
    boolean canManage = canManageFederalApplication(authentication);
    try {
      String userId = principal(authentication);
      ApplicationEditLockDto lock =
          canManage
              ? editLockService.acquire(
                  detail.applicationNumber(), userId, userId, true)
              : editLockService.snapshot(detail.applicationNumber(), userId, false);
      if (lock == null) {
        return unavailableEditLock(detail);
      }
      if (!lock.locked()) {
        return detail.withEditLock(false, lock.heldByCurrentUser(), null, null);
      }

      String lockedBy = canManage ? lock.lockedBy() : null;
      String message =
          canManage && lock.message() != null && !lock.message().isBlank()
              ? lock.message()
              : LOCKED_MESSAGE;
      return detail.withEditLock(true, false, lockedBy, message);
    } catch (RuntimeException exception) {
      LOGGER.warn(
          "Federal application edit lock state unavailable [{}]",
          exception.getClass().getSimpleName());
      return unavailableEditLock(detail);
    }
  }

  private FederalApplicationDetailDto unavailableEditLock(FederalApplicationDetailDto detail) {
    return detail.withEditLock(true, false, null, LOCK_STATE_UNAVAILABLE_MESSAGE);
  }

  private <T> T withApplicationEditLock(
      Long applicationNumber, String userId, Supplier<T> mutation) {
    var existing = editLockService.snapshot(applicationNumber, userId, false);
    var acquired = editLockService.requireEditable(applicationNumber, userId, userId);
    if (acquired == null || acquired.locked()) {
      throw new EditLockConflictException(
          acquired == null ? "The application edit lock could not be acquired." : acquired.message());
    }

    boolean releaseAfterMutation = existing == null || !existing.heldByCurrentUser();
    try {
      return mutation.get();
    } finally {
      if (releaseAfterMutation) {
        editLockService.release(applicationNumber, userId);
      }
    }
  }

  private String principal(Authentication authentication) {
    if (principalService != null) {
      return principalService.resolvePrincipalName(authentication);
    }
    return authentication == null ? null : authentication.getName();
  }
}

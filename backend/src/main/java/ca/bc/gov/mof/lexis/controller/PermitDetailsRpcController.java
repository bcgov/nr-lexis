package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.sanitizeFileName;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.fromRequest;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.firstPresent;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/lexis/rpc/permit-details")
@Validated
public class PermitDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(PermitDetailsRpcController.class);
  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String ROLE_PROVINCIAL_SUBMITTER = "LEXIS_PROVINCIAL_SUBMITTER";
  private static final String PERMIT_STATUS_ACTIVE = "ACT";
  private static final String PERMIT_STATUS_EXPIRED = "EXP";
  private static final String LEGACY_ACTION_SAVE_PERMIT = "savePermit";
  private static final String LEGACY_ACTION_REVIEW_PERMITS = "/permitsReview";
  private static final String LEGACY_ACTION_APPLICATION_DETAILS = "/applicationDetails";
  private static final String LEGACY_PERMIT_LOCK_SESSION_KEY = "PERMIT_LOCK";

  private final ObjectProvider<PermitDetailsRpcService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final PermitOperationMutex permitOperationMutex;
  private final ApplicationPermitOperationCoordinator operationCoordinator;
  private final Set<String> configuredIndustryRoles;
  private ProvincialAuthorizationService provincialAuthorizationService;
  private LexisPrincipalService principalService;
  private ApplicationEditLockService editLockService;
  private PermitService permitService;

  public PermitDetailsRpcController(
      ObjectProvider<PermitDetailsRpcService> serviceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      PermitOperationMutex permitOperationMutex,
      ApplicationPermitOperationCoordinator operationCoordinator) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.permitOperationMutex = permitOperationMutex;
    this.operationCoordinator = operationCoordinator;
    this.configuredIndustryRoles = sessionService.getConfiguredIndustryRoles();
  }

  @Autowired
  void setProvincialAuthorizationService(
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
  }

  @Autowired
  void setApplicationEditLockService(ApplicationEditLockService editLockService) {
    this.editLockService = editLockService;
  }

  @Autowired(required = false)
  void setPermitService(PermitService permitService) {
    this.permitService = permitService;
  }

  @GetMapping("/permit-summary")
  public ResponseEntity<PermitSummaryRpcResponseDto> getPermitSummary(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "countryCode", required = false) String countryCode,
      @RequestParam(name = "applicationDate", required = false) String applicationDate,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for permit summary");
      return ResponseEntity.noContent().build();
    }
    if (packageNumber == null || packageNumber.isBlank()) {
      requirePermitAccess(permitNumber, authentication);
    } else {
      requirePackageAccess(service, packageNumber, permitNumber, authentication);
    }

    return ResponseEntity.ok(
        service.getPermitSummary(
            permitNumber,
            countryCode,
            applicationDate,
            packageNumber,
            isMinistryUser(authentication)));
  }

  @PostMapping("/request-email")
  public ResponseEntity<PermitDetailsRpcService.PermitEmailResult> sendRequestPermitEmail(
      @RequestParam(name = "permitNumber") Long permitNumber,
      @RequestParam(name = "copyToEmailAddress", required = false) String copyToEmailAddress,
      Authentication authentication) {
    if (isMinistryUser(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          return ResponseEntity.ok(
              service.sendRequestPermitEmail(
                  permitNumber,
                  copyToEmailAddress,
                  userId(authentication)));
        });
  }

  @PostMapping("/approval-email")
  public ResponseEntity<PermitDetailsRpcService.PermitEmailResult> sendApprovalPermitEmail(
      @RequestParam(name = "permitNumber") Long permitNumber,
      @RequestParam(name = "clientEmailAddress", required = false) String clientEmailAddress,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          return ResponseEntity.ok(
              service.sendApprovalPermitEmail(permitNumber, clientEmailAddress));
        });
  }

  @GetMapping("/approval-email-default")
  public ResponseEntity<PermitApprovalEmailDefaultResponseDto> getApprovalPermitEmailDefault(
      @RequestParam(name = "permitNumber") Long permitNumber,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    return ResponseEntity.ok(
        new PermitApprovalEmailDefaultResponseDto(
            service.getApprovalPermitEmailDefault(permitNumber).orElse("")));
  }

  @GetMapping("/total-fees-for-permit")
  public ResponseEntity<PermitTotalFeesRpcResponseDto> getTotalFeesForPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "countryCode", required = false) String countryCode,
      @RequestParam(name = "applicationDate", required = false) String applicationDate) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for total fees");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber);

    return ResponseEntity.ok(service.getTotalFeesForPermit(permitNumber, countryCode, applicationDate));
  }

  @GetMapping("/edit-context")
  public ResponseEntity<PermitEditContextResponseDto> getPermitEditContext(
      @RequestParam(name = "permitNumber") Long permitNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for edit context");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    ApplicationEditLockDto lock = null;
    if (canSavePermit(authentication)) {
      lock = acquirePermitLock(permitNumber, authentication);
    }
    PermitDetailsRpcService.PermitEditContext context = service.getEditContext(permitNumber);
    return ResponseEntity.ok(
        new PermitEditContextResponseDto(
            context.overrideEnabled(),
            context.overrideFee(),
            context.overrideComment(),
            lock != null && lock.locked(),
            lock == null ? null : lock.message()));
  }

  @GetMapping("/scale-fees-for-package")
  public ResponseEntity<PermitScaleFeesRpcResponseDto> getScaleFeesForPackage(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for scale fees");
      return ResponseEntity.noContent().build();
    }
    requirePackageAccess(service, packageNumber, permitNumber, authentication);

    return ResponseEntity.ok(
        service.getScaleFeesForPackage(packageNumber, permitNumber, isMinistryUser(authentication)));
  }

  @GetMapping("/scales-for-package")
  public ResponseEntity<PermitScalesForPackageRpcResponseDto> getScalesForPackage(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for scales for package");
      return ResponseEntity.noContent().build();
    }

    requirePackageAccess(service, packageNumber, permitNumber);
    return ResponseEntity.ok(service.getScalesForPackage(packageNumber));
  }

  @GetMapping("/permit-data-after-scale-update")
  public ResponseEntity<PermitDataAfterScaleUpdateRpcResponseDto> getPermitDataAfterScaleUpdate(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for permit data after scale update");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber);

    return ResponseEntity.ok(service.getPermitDataAfterScaleUpdate(permitNumber));
  }

  @GetMapping("/package-volume-sum")
  public ResponseEntity<PermitPackageVolumeSumRpcResponseDto> getPackageVolumeSum(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package volume sum");
      return ResponseEntity.noContent().build();
    }
    requirePackageAccess(service, packageNumber, permitNumber);

    return ResponseEntity.ok(service.getPackageVolumeSum(permitNumber, packageNumber));
  }

  @GetMapping("/package-list")
  public ResponseEntity<PermitPackageListRpcResponseDto> getPackageList(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package list");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber);

    return ResponseEntity.ok(service.getPackageList(permitNumber));
  }

  @GetMapping("/oic-package-list")
  public ResponseEntity<PermitPackageListRpcResponseDto> getOicPackageList(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for OIC package list");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber);

    return ResponseEntity.ok(service.getOicPackageList(permitNumber));
  }

  @GetMapping("/package-info")
  public ResponseEntity<PermitPackageInfoRpcResponseDto> getPackageInfo(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package info");
      return ResponseEntity.noContent().build();
    }

    requirePackageAccess(service, packageNumber, permitNumber);
    return ResponseEntity.ok(service.getPackageInfo(packageNumber));
  }

  @GetMapping("/package-details")
  public ResponseEntity<PermitPackageDetailsRpcResponseDto> getPackageDetails(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package details");
      return ResponseEntity.noContent().build();
    }

    requirePackageAccess(service, packageNumber, permitNumber);
    return ResponseEntity.ok(service.getPackageDetails(packageNumber));
  }

  @GetMapping("/permit-has-applications")
  public ResponseEntity<PermitHasApplicationsRpcResponseDto> getPermitHasApplications(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for permit has applications");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber);

    return ResponseEntity.ok(service.getPermitHasApplications(permitNumber));
  }

  @GetMapping("/country-list")
  public ResponseEntity<PermitCountryListRpcResponseDto> getCountryList() {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for country list");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getCountryList());
  }

  @GetMapping("/check-permit-number")
  public ResponseEntity<PermitNumberAvailabilityRpcResponseDto> checkPermitNumber(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for check permit number");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.checkPermitNumber(permitNumber));
  }

  @GetMapping("/application-list")
  public ResponseEntity<PermitApplicationListRpcResponseDto> getApplicationList(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for application list");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);

    return ResponseEntity.ok(
        service.getApplicationList(
            permitNumber, applicationAccessPredicate(authentication)));
  }

  @GetMapping("/available-application-list")
  public ResponseEntity<PermitAvailableApplicationListRpcResponseDto> getAvailableApplicationList(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "selectedApplications", required = false) String selectedApplications,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for available application list");
      return ResponseEntity.noContent().build();
    }

    requireExemptionAccess(exemptionNumber, authentication);
    return ResponseEntity.ok(
        service.getAvailableApplicationList(
            exemptionNumber,
            selectedApplications,
            applicationAccessPredicate(authentication)));
  }

  @GetMapping("/available-package-list")
  public ResponseEntity<PermitAvailablePackageListRpcResponseDto> getAvailablePackageList(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "selectedPackages", required = false) String selectedPackages,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for available package list");
      return ResponseEntity.noContent().build();
    }

    requireExemptionAccess(exemptionNumber, authentication);
    return ResponseEntity.ok(
        service.getAvailablePackageList(
            exemptionNumber,
            selectedPackages,
            applicationAccessPredicate(authentication)));
  }

  @GetMapping("/approved-exemption-volume")
  public ResponseEntity<PermitApprovedExemptionVolumeRpcResponseDto> getApprovedExemptionVolume(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for approved exemption volume");
      return ResponseEntity.noContent().build();
    }

    requireExemptionAccess(exemptionNumber);
    return ResponseEntity.ok(service.getApprovedExemptionVolume(exemptionNumber));
  }

  @GetMapping("/exemption-volume-remaining")
  public ResponseEntity<PermitExemptionVolumeRemainingRpcResponseDto> getExemptionVolumeRemaining(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for exemption volume remaining");
      return ResponseEntity.noContent().build();
    }

    requireExemptionAccess(exemptionNumber);
    return ResponseEntity.ok(service.getExemptionVolumeRemaining(exemptionNumber));
  }

  @GetMapping("/gbms-invoice-history")
  public ResponseEntity<List<PermitGbmsInvoiceHistoryItemRpcResponseDto>> getGbmsInvoiceHistory(
      @RequestParam(name = "receiptNumber", required = false) String receiptNumber,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for GBMS invoice history");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);

    return ResponseEntity.ok(
        service.getGbmsInvoiceHistory(receiptNumber, permitNumber, isReadOnlyUser(authentication)));
  }

  @PostMapping("/add-permit")
  public ResponseEntity<PermitMutationRpcResponseDto> addPermit(
      HttpServletRequest request, Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add permit");
      return ResponseEntity.noContent().build();
    }

    PermitMutationRequestDto mutationRequest = buildPermitMutationRequest(request);
    if (requestsFeeOverrideMutation(mutationRequest)
        && !canReviewPermits(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    requireExemptionAccess(mutationRequest.exemptionNumber(), authentication);
    Long requestedOicApplicationNumber = requestedOicApplicationNumber(mutationRequest);
    if (requestedOicApplicationNumber != null) {
      requireApplicationAccess(requestedOicApplicationNumber, authentication);
    }
    if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            authentication,
            mutationRequest.ownerClientNumber(),
            mutationRequest.agentClientNumber())) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    String exemptionNumber = requiredExemptionNumber(mutationRequest.exemptionNumber());
    PermitMutationRpcResponseDto response =
        operationCoordinator.executeExemptionMutation(
            List.of(exemptionNumber),
            () -> applicationNumbersForExemptionMutation(service, mutationRequest),
            () -> addPermitWhileSerialized(service, mutationRequest, authentication));
    return ResponseEntity.ok(response);
  }

  @PostMapping("/create-from-exemption")
  public ResponseEntity<PermitMutationRpcResponseDto> createPermitFromExemption(
      @RequestParam(name = "exemptionNumber") String exemptionNumber,
      Authentication authentication) {
    if (!canCreatePermit(authentication) || !isPermitCreatorRole(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Permit RPC service unavailable - returning no content for create from exemption");
      return ResponseEntity.noContent().build();
    }

    String normalizedExemptionNumber = normalizeExemptionNumber(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return ResponseEntity.badRequest().build();
    }
    requireExemptionAccess(normalizedExemptionNumber, authentication);

    PermitMutationRpcResponseDto response =
        operationCoordinator.executeExemptionMutation(
            List.of(normalizedExemptionNumber),
            () -> service.getApplicationNumbersForExemptionMutation(normalizedExemptionNumber),
            () ->
                createPermitFromExemptionWhileSerialized(
                    service, normalizedExemptionNumber, authentication));
    return ResponseEntity.ok(response);
  }

  private PermitMutationRpcResponseDto createPermitFromExemptionWhileSerialized(
      PermitDetailsRpcService service,
      String exemptionNumber,
      Authentication authentication) {
    requireExemptionAccess(exemptionNumber, authentication);
    List<MutationExemptionLock> exemptionLocks =
        acquireMutationExemptionLocks(List.of(exemptionNumber), authentication);
    try {
      return service.createPermitFromExemption(exemptionNumber, userId(authentication));
    } finally {
      releaseMutationExemptionLocks(exemptionLocks);
    }
  }

  private PermitMutationRpcResponseDto addPermitWhileSerialized(
      PermitDetailsRpcService service,
      PermitMutationRequestDto mutationRequest,
      Authentication authentication) {
    String exemptionNumber = requiredExemptionNumber(mutationRequest.exemptionNumber());
    requireExemptionAccess(exemptionNumber, authentication);
    if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            authentication,
            mutationRequest.ownerClientNumber(),
            mutationRequest.agentClientNumber())) {
      throw new AccessDeniedException(
          "Permit client scope changed while the mutation was waiting.");
    }
    Long requestedOicApplicationNumber = requestedOicApplicationNumber(mutationRequest);
    if (requestedOicApplicationNumber != null) {
      requireApplicationAccess(requestedOicApplicationNumber, authentication);
    }

    List<MutationExemptionLock> exemptionLocks =
        acquireMutationExemptionLocks(List.of(exemptionNumber), authentication);
    try {
      return service.addPermit(mutationRequest, userId(authentication));
    } finally {
      releaseMutationExemptionLocks(exemptionLocks);
    }
  }

  @PostMapping("/update-permit")
  public ResponseEntity<PermitMutationRpcResponseDto> updatePermit(
      HttpServletRequest request, Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for update permit");
      return ResponseEntity.noContent().build();
    }

    PermitMutationRequestDto mutationRequest = buildPermitMutationRequest(request);
    if (requestsFeeOverrideMutation(mutationRequest)
        && !canReviewPermits(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    Long permitNumber = parsePositiveLong(mutationRequest.permitNumber());
    requirePermitAccess(permitNumber, authentication);
    if (mutationRequest.exemptionNumber() != null
        && !mutationRequest.exemptionNumber().isBlank()) {
      requireExemptionAccess(mutationRequest.exemptionNumber(), authentication);
    }
    if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            authentication,
            mutationRequest.ownerClientNumber(),
            mutationRequest.agentClientNumber())) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    requireCanonicalPermitMutable(permitNumber);

    PermitMutationRpcResponseDto response =
        operationCoordinator.executePermitMutation(
            permitNumber,
            () -> exemptionNumbersForPermitMutation(service, mutationRequest),
            () -> applicationNumbersForPermitMutation(service, mutationRequest),
            () ->
                updatePermitWhileSerialized(
                    service, mutationRequest, permitNumber, authentication));
    return ResponseEntity.ok(response);
  }

  private PermitMutationRpcResponseDto updatePermitWhileSerialized(
      PermitDetailsRpcService service,
      PermitMutationRequestDto mutationRequest,
      Long permitNumber,
      Authentication authentication) {
    requirePermitAccess(permitNumber, authentication);
    List<String> exemptionNumbers =
        exemptionNumbersForPermitMutation(service, mutationRequest);
    exemptionNumbers.forEach(
        exemptionNumber -> requireExemptionAccess(exemptionNumber, authentication));
    if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            authentication,
            mutationRequest.ownerClientNumber(),
            mutationRequest.agentClientNumber())) {
      throw new AccessDeniedException(
          "Permit client scope changed while the mutation was waiting.");
    }
    requireCanonicalPermitMutable(permitNumber);
    List<MutationExemptionLock> exemptionLocks =
        acquireMutationExemptionLocks(exemptionNumbers, authentication);
    List<Long> applicationLocksToRelease = List.of();
    try {
      requirePermitEditable(permitNumber, authentication);
      List<Long> linkedApplicationNumbers =
          applicationNumbersForPermitMutation(service, mutationRequest);
      linkedApplicationNumbers.forEach(
          applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
      applicationLocksToRelease =
          acquireApplicationLocksForMutation(linkedApplicationNumbers, authentication);
      return service.updatePermit(mutationRequest, userId(authentication));
    } finally {
      releaseApplicationLocks(applicationLocksToRelease, authentication);
      releaseMutationExemptionLocks(exemptionLocks);
    }
  }

  private List<String> exemptionNumbersForPermitMutation(
      PermitDetailsRpcService service, PermitMutationRequestDto mutationRequest) {
    Long permitNumber = parsePositiveLong(mutationRequest.permitNumber());
    TreeSet<String> exemptionNumbers = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
    exemptionNumbers.add(
        requiredExemptionNumber(service.getExemptionNumberForPermitMutation(permitNumber)));
    String requestedExemptionNumber = normalizeExemptionNumber(mutationRequest.exemptionNumber());
    if (requestedExemptionNumber != null) {
      exemptionNumbers.add(requestedExemptionNumber);
    }
    return List.copyOf(exemptionNumbers);
  }

  private List<Long> applicationNumbersForPermitMutation(
      PermitDetailsRpcService service, PermitMutationRequestDto mutationRequest) {
    Long permitNumber = parsePositiveLong(mutationRequest.permitNumber());
    java.util.SortedSet<Long> applicationNumbers =
        new java.util.TreeSet<>(service.getApplicationNumbersForPermitMutation(permitNumber));
    Long requestedOicApplicationNumber = requestedOicApplicationNumber(mutationRequest);
    if (requestedOicApplicationNumber != null) {
      applicationNumbers.add(requestedOicApplicationNumber);
    }
    return List.copyOf(applicationNumbers);
  }

  private List<Long> applicationNumbersForExemptionMutation(
      PermitDetailsRpcService service, PermitMutationRequestDto mutationRequest) {
    String exemptionNumber = requiredExemptionNumber(mutationRequest.exemptionNumber());
    java.util.SortedSet<Long> applicationNumbers =
        new java.util.TreeSet<>(
            service.getApplicationNumbersForExemptionMutation(exemptionNumber));
    Long requestedOicApplicationNumber = requestedOicApplicationNumber(mutationRequest);
    if (requestedOicApplicationNumber != null) {
      applicationNumbers.add(requestedOicApplicationNumber);
    }
    return List.copyOf(applicationNumbers);
  }

  private Long requestedOicApplicationNumber(PermitMutationRequestDto mutationRequest) {
    String rawApplicationNumber =
        mutationRequest == null ? null : mutationRequest.oicApplicationNumber();
    if (rawApplicationNumber == null || rawApplicationNumber.isBlank()) {
      return null;
    }
    Long applicationNumber = parsePositiveLong(rawApplicationNumber);
    if (applicationNumber == null) {
      throw new DataRetrievalFailureException(
          "The requested OIC application relationship is invalid.");
    }
    return applicationNumber;
  }

  private String requiredExemptionNumber(String exemptionNumber) {
    String normalized = normalizeExemptionNumber(exemptionNumber);
    if (normalized == null) {
      throw new DataRetrievalFailureException(
          "A valid exemption relationship is required for permit mutation.");
    }
    return normalized;
  }

  private String normalizeExemptionNumber(String exemptionNumber) {
    return exemptionNumber == null || exemptionNumber.isBlank()
        ? null
        : exemptionNumber.trim();
  }

  @PostMapping("/update-shipping")
  public ResponseEntity<PermitMutationRpcResponseDto> updateShipping(
      HttpServletRequest request, Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for update shipping");
      return ResponseEntity.noContent().build();
    }

    PermitMutationRequestDto mutationRequest = buildPermitMutationRequest(request);
    Long permitNumber = parsePositiveLong(mutationRequest.permitNumber());
    requirePermitAccess(permitNumber, authentication);
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          return ResponseEntity.ok(
              service.updateShipping(mutationRequest, userId(authentication)));
        });
  }

  @PostMapping("/update-scale-attachment")
  public ResponseEntity<PermitPersistenceRpcResponseDto> updateScaleAttachment(
      @RequestParam(name = "scaleId", required = false) String scaleId,
      @RequestParam(name = "scaleDetailId", required = false) String scaleDetailId,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "attachInd", required = false) String attachInd,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for update scale attachment");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    String resolvedScaleId =
        scaleDetailId == null || scaleDetailId.isBlank() ? scaleId : scaleDetailId;
    List<Long> affectedApplications =
        service.getApplicationNumberForScaleMutation(resolvedScaleId).stream().toList();
    affectedApplications.forEach(
        applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
    return permitOperationMutex.executeAggregate(
        affectedApplications,
        List.of(permitNumber),
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          List<Long> actualApplications =
              service.getApplicationNumberForScaleMutation(resolvedScaleId).stream().toList();
          if (!new java.util.TreeSet<>(affectedApplications)
              .equals(new java.util.TreeSet<>(actualApplications))) {
            throw new DataRetrievalFailureException(
                "The scale application relationship changed during mutation.");
          }
          actualApplications.forEach(
              applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
          List<Long> applicationLocksToRelease =
              acquireApplicationLocksForMutation(actualApplications, authentication);
          try {
            return ResponseEntity.ok(
                service.updateScaleAttachment(
                    resolvedScaleId,
                    permitNumber,
                    Boolean.parseBoolean(attachInd),
                    userId(authentication)));
          } finally {
            releaseApplicationLocks(applicationLocksToRelease, authentication);
          }
        });
  }

  @PostMapping("/add-applications-to-permit")
  public ResponseEntity<PermitPersistenceRpcResponseDto> addApplicationsToPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "selectedApplications", required = false) String selectedApplications,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add applications to permit");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    List<Long> applicationNumbers = parseApplicationNumbers(selectedApplications);
    applicationNumbers.forEach(
        applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
    return permitOperationMutex.executeAggregate(
        applicationNumbers,
        List.of(permitNumber),
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          applicationNumbers.forEach(
              applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
          List<Long> applicationLocksToRelease =
              acquireApplicationLocksForMutation(applicationNumbers, authentication);
          try {
            return ResponseEntity.ok(
                service.addApplicationsToPermit(
                    permitNumber,
                    selectedApplications,
                    userId(authentication)));
          } finally {
            releaseApplicationLocks(applicationLocksToRelease, authentication);
          }
        });
  }

  @PostMapping("/remove-application-from-permit")
  public ResponseEntity<PermitPersistenceRpcResponseDto> removeApplicationFromPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for remove application from permit");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    if (applicationNumber != null && applicationNumber > 0) {
      requireApplicationAccess(applicationNumber, authentication);
    }
    List<Long> affectedApplications =
        applicationNumber == null ? List.of() : normalizedApplicationNumbers(List.of(applicationNumber));
    return permitOperationMutex.executeAggregate(
        affectedApplications,
        List.of(permitNumber),
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          affectedApplications.forEach(
              affectedApplication ->
                  requireApplicationAccess(affectedApplication, authentication));
          List<Long> applicationLocksToRelease =
              acquireApplicationLocksForMutation(affectedApplications, authentication);
          try {
            return ResponseEntity.ok(
                service.removeApplicationFromPermit(
                    permitNumber,
                    applicationNumber,
                    userId(authentication)));
          } finally {
            releaseApplicationLocks(applicationLocksToRelease, authentication);
          }
        });
  }

  @PostMapping("/add-boic-scale")
  public ResponseEntity<PermitPersistenceRpcResponseDto> addBlanketOicScale(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "timberMark", required = false) String timberMark,
      @RequestParam(name = "scaleVolume", required = false) String scaleVolume,
      @RequestParam(name = "scalePieces", required = false) Long scalePieces,
      @RequestParam(name = "speciesCode", required = false) String speciesCode,
      @RequestParam(name = "gradeCode", required = false) String gradeCode,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add BOIC scale");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    return operationCoordinator.executePermitMutation(
        permitNumber,
        () -> service.getApplicationNumbersForPermitMutation(permitNumber),
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          List<Long> applicationNumbers =
              service.getApplicationNumbersForPermitMutation(permitNumber);
          applicationNumbers.forEach(
              applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
          List<Long> applicationLocksToRelease =
              acquireApplicationLocksForMutation(applicationNumbers, authentication);
          try {
            return ResponseEntity.ok(
                service.addBlanketOicScale(
                    permitNumber,
                    packageNumber,
                    timberMark,
                    scaleVolume,
                    scalePieces,
                    speciesCode,
                    gradeCode,
                    userId(authentication)));
          } finally {
            releaseApplicationLocks(applicationLocksToRelease, authentication);
          }
        });
  }

  @PostMapping("/delete-boic-scale")
  public ResponseEntity<PermitPersistenceRpcResponseDto> deleteBlanketOicScale(
      @RequestParam(name = "scaleId", required = false) String scaleId,
      @RequestParam(name = "scaleDetailId", required = false) String scaleDetailId,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for delete BOIC scale");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    return operationCoordinator.executePermitMutation(
        permitNumber,
        () -> service.getApplicationNumbersForPermitMutation(permitNumber),
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          List<Long> applicationNumbers =
              service.getApplicationNumbersForPermitMutation(permitNumber);
          applicationNumbers.forEach(
              applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
          List<Long> applicationLocksToRelease =
              acquireApplicationLocksForMutation(applicationNumbers, authentication);
          try {
            return ResponseEntity.ok(
                service.deleteBlanketOicScale(
                    scaleDetailId == null || scaleDetailId.isBlank() ? scaleId : scaleDetailId,
                    permitNumber,
                    userId(authentication)));
          } finally {
            releaseApplicationLocks(applicationLocksToRelease, authentication);
          }
        });
  }

  @PostMapping("/add-invoice")
  public ResponseEntity<PermitPersistenceRpcResponseDto> addInvoice(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber,
      @RequestParam(name = "invoiceExportValue", required = false) String invoiceExportValue,
      @RequestParam(name = "invoiceConversionRate", required = false) String invoiceConversionRate,
      @RequestParam(name = "invoiceFeeInLieu", required = false) String invoiceFeeInLieu,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add invoice");
      return ResponseEntity.noContent().build();
    }
    requirePermitAccess(permitNumber, authentication);
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          requirePermitAccess(permitNumber, authentication);
          requirePermitEditable(permitNumber, authentication);
          return ResponseEntity.ok(
              service.addInvoice(
                  permitNumber,
                  salesInvoiceNumber,
                  parsePositiveDecimal(invoiceExportValue),
                  parsePositiveDecimal(invoiceConversionRate),
                  parsePositiveDecimal(invoiceFeeInLieu),
                  userId(authentication)));
        });
  }

  @GetMapping("/check-form-changes")
  public ResponseEntity<CheckFormChangesResponseDto> checkFormChanges(HttpServletRequest request) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning default check-form-changes payload");
      return ResponseEntity.ok(new CheckFormChangesResponseDto(false));
    }

    PermitMutationRequestDto mutationRequest = buildPermitMutationRequest(request);
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    Long permitNumber = parsePositiveLong(mutationRequest.permitNumber());
    if (permitNumber != null) {
      requirePermitAccess(permitNumber, authentication);
    } else if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            authentication,
            mutationRequest.ownerClientNumber(),
            mutationRequest.agentClientNumber())) {
      throw new AccessDeniedException("The permit is outside the authenticated client scope.");
    }
    boolean permitChanged = service.hasFormChanges(mutationRequest);
    return ResponseEntity.ok(new CheckFormChangesResponseDto(permitChanged));
  }

  @PostMapping("/release-lock")
  public ResponseEntity<ReleaseLockResponseDto> releaseLock(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      HttpServletRequest request,
      Authentication authentication) {
    if (editLockService != null && permitNumber != null) {
      editLockService.releasePermit(permitNumber, userId(authentication));
    }
    if (request != null) {
      var session = request.getSession(false);
      if (session != null) {
        session.removeAttribute(LEGACY_PERMIT_LOCK_SESSION_KEY);
      }
    }
    return ResponseEntity.ok(new ReleaseLockResponseDto("ok"));
  }

  ResponseEntity<ReleaseLockResponseDto> releaseLock(HttpServletRequest request) {
    return releaseLock(
        null, request, SecurityContextHolder.getContext().getAuthentication());
  }

  @GetMapping("/invoices-for-permit")
  public ResponseEntity<PermitInvoiceListRpcResponseDto> getInvoicesForPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for invoices for permit");
      return ResponseEntity.noContent().build();
    }

    requirePermitAccess(permitNumber);
    return ResponseEntity.ok(service.getInvoicesForPermit(permitNumber));
  }

  @GetMapping("/invoice-details")
  public ResponseEntity<PermitInvoiceDetailsRpcResponseDto> getInvoiceDetails(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for invoice details");
      return ResponseEntity.noContent().build();
    }

    requirePermitAccess(permitNumber);
    return ResponseEntity.ok(service.getInvoiceDetails(permitNumber, salesInvoiceNumber));
  }

  @GetMapping("/conversion-rate")
  public ResponseEntity<PermitConversionRateRpcResponseDto> getConversionRate() {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for conversion rate");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getConversionRate());
  }

  @GetMapping("/file-types")
  public ResponseEntity<List<PermitFileTypeRpcResponseDto>> getFileTypes() {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for file types");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getFileTypes());
  }

  @GetMapping("/document-details")
  public ResponseEntity<List<PermitDocumentItemRpcResponseDto>> getDocumentDetails(
      @RequestParam(name = "permitNumber", required = false) String permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }

    Long parsedPermitNumber = parsePositiveLong(permitNumber);
    Authentication authentication =
        SecurityContextHolder.getContext().getAuthentication();
    requirePermitAccess(parsedPermitNumber, authentication);
    return ResponseEntity.ok(
        service.getDocumentDetails(parsedPermitNumber).stream()
            .filter(
                item ->
                    canAccessPermitDocument(
                        item, parsedPermitNumber, authentication))
            .toList());
  }

  @GetMapping("/document")
  public ResponseEntity<StreamingResponseBody> streamDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName,
      @RequestParam(name = "permitNumber", required = false) String permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for get document");
      return ResponseEntity.noContent().build();
    }

    Long parsedFileId = parsePositiveLong(fileId);
    Long parsedPermitNumber = parsePositiveLong(permitNumber);
    Authentication authentication =
        SecurityContextHolder.getContext().getAuthentication();
    PermitDocumentItemRpcResponseDto document =
        requirePermitDocumentAccess(
            service,
            parsedFileId,
            parsedPermitNumber,
            authentication);

    return service
        .streamDocument(document.id())
        .map(
            content -> {
              HttpHeaders headers = new HttpHeaders();
              String normalizedFileName = sanitizeFileName(fileName);
              if (normalizedFileName != null && !normalizedFileName.isBlank()) {
                headers.setContentDisposition(
                    ContentDisposition.attachment()
                        .filename(normalizedFileName, StandardCharsets.UTF_8)
                        .build());
              }
              headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
              StreamingResponseBody body =
                  TemporaryDocumentStreamingBody.stream(content::writeTo);
              return ResponseEntity.ok().headers(headers).body(body);
            })
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @DeleteMapping("/document/permit")
  public ResponseEntity<RemoveDocumentResponseDto> removePermitDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!hasPermitDocumentDeleteRole(roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - rejecting remove permit document");
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }

    Long parsedDocumentId = parsePositiveLong(documentId);
    requirePermitDocumentSource(
        service, parsedDocumentId, permitNumber, authentication, "permit");
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          requirePermitDocumentSource(
              service, parsedDocumentId, permitNumber, authentication, "permit");
          requirePermitEditable(permitNumber, authentication);
          if (!canRemovePermitDocument(permitNumber, roles, false)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          boolean removed = service.removePermitDocument(parsedDocumentId);
          return ResponseEntity.ok(
              new RemoveDocumentResponseDto(Boolean.toString(removed)));
        });
  }

  @DeleteMapping("/document/application")
  public ResponseEntity<RemoveDocumentResponseDto> removeApplicationDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!hasPermitDocumentDeleteRole(roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    // Application-owned attachments are contextual, read-only rows on the permit aggregate.
    // They must be removed from the application workflow, where its status and edit lock apply.
    return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
  }

  @DeleteMapping("/document/invoice")
  public ResponseEntity<RemoveDocumentResponseDto> removeInvoiceDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!hasPermitDocumentDeleteRole(roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - rejecting remove invoice document");
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }

    Long parsedDocumentId = parsePositiveLong(documentId);
    requirePermitDocumentSource(
        service, parsedDocumentId, permitNumber, authentication, "invoice");
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          requirePermitDocumentSource(
              service, parsedDocumentId, permitNumber, authentication, "invoice");
          requirePermitEditable(permitNumber, authentication);
          if (!canRemovePermitDocument(permitNumber, roles, true)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          boolean removed = service.removeInvoiceDocument(parsedDocumentId);
          return ResponseEntity.ok(
              new RemoveDocumentResponseDto(Boolean.toString(removed)));
        });
  }

  private PermitMutationRequestDto buildPermitMutationRequest(HttpServletRequest request) {
    MultiValueMap<String, String> parameters = fromRequest(request);
    return new PermitMutationRequestDto(
        first(parameters, "permitNumber"),
        firstPresent(parameters, "permitStatus"),
        first(parameters, "permitSubmitDate"),
        first(parameters, "permitIssueDate"),
        first(parameters, "permitExpiryDate"),
        first(parameters, "permitRequestDate"),
        firstPresent(parameters, "exemptionNumber"),
        firstPresent(parameters, "destinationCompanyName"),
        firstPresent(parameters, "destinationCountry"),
        firstPresent(parameters, "transportType"),
        firstPresent(parameters, "transportName"),
        firstPresent(parameters, "estimatedShippingDate"),
        firstPresent(parameters, "portOfExport"),
        firstPresent(parameters, "otherPortOfExport"),
        firstPresent(parameters, "permitReceiptNo", "receiptNumber"),
        firstPresent(parameters, "permitRemarks"),
        firstPresent(parameters, "permitGrowthType", "growthType"),
        first(parameters, "permitTotalVolume"),
        first(parameters, "permitNumberOfPieces", "permitTotalPieces"),
        first(parameters, "orgUnitNo", "region"),
        firstPresent(parameters, "ownerClientNumber"),
        firstPresent(parameters, "ownerClientLocation"),
        firstPresent(parameters, "agentClientNumber"),
        firstPresent(parameters, "agentClientLocation"),
        first(parameters, "oicApplicationNumber"),
        first(parameters, "oicRegion"),
        first(parameters, "oicPermitTotalPieces"),
        first(parameters, "oicPermitTotalVolume"),
        firstPresent(parameters, "packageAgeClass"),
        firstPresent(parameters, "packageProductType"),
        first(parameters, "overrideInd"),
        first(parameters, "overrideFee"),
        firstPresent(parameters, "overrideComment"));
  }

  private boolean isMinistryUser(Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (roles == null || roles.isEmpty()) {
      return true;
    }
    for (String role : roles) {
      if (configuredIndustryRoles.contains(role)) {
        return false;
      }
    }
    return true;
  }

  private boolean isReadOnlyUser(Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (roles == null || roles.isEmpty()) {
      return false;
    }
    return roles.contains(ROLE_READ_ONLY);
  }

  private boolean canSavePermit(Authentication authentication) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), LEGACY_ACTION_SAVE_PERMIT);
  }

  private boolean canCreatePermit(Authentication authentication) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), "createPermit");
  }

  private boolean isPermitCreatorRole(Authentication authentication) {
    List<String> roles = normalizedRoles(sessionService.parseRolesFromPrincipal(authentication));
    return roles.contains(ROLE_ADMIN) || roles.contains(ROLE_APPLICATION_APPROVER);
  }

  private boolean canRemovePermitDocument(
      Long permitNumber, List<String> roles, boolean invoiceDocument) {
    if (permitService == null || permitNumber == null || permitNumber < 1) {
      return false;
    }
    List<String> normalizedRoles = normalizedRoles(roles);
    boolean readOnly = normalizedRoles.contains(ROLE_READ_ONLY);
    boolean admin = normalizedRoles.contains(ROLE_ADMIN);
    return permitService
        .findByPermitNumber(permitNumber)
        .map(detail -> detail.permitStatusCode())
        .map(status -> status.trim().toUpperCase(Locale.ROOT))
        .filter(status -> !status.isBlank())
        .map(
            status -> {
              if (invoiceDocument) {
                return PERMIT_STATUS_ACTIVE.equals(status) && (admin || !readOnly);
              }
              return (admin && !PERMIT_STATUS_EXPIRED.equals(status))
                  || (PERMIT_STATUS_ACTIVE.equals(status) && !readOnly);
            })
        .orElse(false);
  }

  private boolean hasPermitDocumentDeleteRole(List<String> roles) {
    List<String> normalizedRoles = normalizedRoles(roles);
    if (normalizedRoles.isEmpty()) {
      return false;
    }
    boolean readOnly = normalizedRoles.contains(ROLE_READ_ONLY);
    boolean authorizedActor =
        normalizedRoles.stream()
            .anyMatch(
                role ->
                    ROLE_ADMIN.equals(role)
                        || ROLE_APPLICATION_APPROVER.equals(role)
                        || ROLE_PROVINCIAL_SUBMITTER.equals(role)
                        || role.startsWith(ROLE_PROVINCIAL_SUBMITTER + "_"));
    return authorizedActor && (normalizedRoles.contains(ROLE_ADMIN) || !readOnly);
  }

  private List<String> normalizedRoles(List<String> roles) {
    if (roles == null || roles.isEmpty()) {
      return List.of();
    }
    return roles.stream()
        .filter(role -> role != null)
        .map(role -> role.trim().toUpperCase(Locale.ROOT))
        .toList();
  }

  private boolean canReviewPermits(Authentication authentication) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), LEGACY_ACTION_REVIEW_PERMITS);
  }

  private boolean requestsFeeOverrideMutation(PermitMutationRequestDto request) {
    return request != null
        && (request.overrideInd() != null
            || request.overrideFee() != null
            || request.overrideComment() != null);
  }

  private void requirePermitAccess(Long permitNumber, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requirePermit(authentication, permitNumber);
    }
  }

  private void requirePermitAccess(Long permitNumber) {
    requirePermitAccess(permitNumber, SecurityContextHolder.getContext().getAuthentication());
  }

  private void requireExemptionAccess(
      String exemptionNumber, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireExemption(
          authentication, exemptionNumber);
    }
  }

  private void requireExemptionAccess(String exemptionNumber) {
    requireExemptionAccess(
        exemptionNumber, SecurityContextHolder.getContext().getAuthentication());
  }

  private void requireApplicationAccess(
      Long applicationNumber, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireApplication(authentication, applicationNumber);
    }
  }

  private Predicate<Long> applicationAccessPredicate(Authentication authentication) {
    boolean canViewApplicationDetails =
        authorizationService.canPerformAction(
            sessionService.parseRolesFromPrincipal(authentication),
            LEGACY_ACTION_APPLICATION_DETAILS);
    return applicationNumber ->
        canViewApplicationDetails
            && provincialAuthorizationService != null
            && provincialAuthorizationService.canAccessApplication(
                authentication, applicationNumber);
  }

  private void requirePackageAccess(
      PermitDetailsRpcService service, String packageNumber, Long permitNumber) {
    requirePackageAccess(
        service,
        packageNumber,
        permitNumber,
        SecurityContextHolder.getContext().getAuthentication());
  }

  private void requirePackageAccess(
      PermitDetailsRpcService service,
      String packageNumber,
      Long permitNumber,
      Authentication authentication) {
    requirePermitAccess(permitNumber, authentication);
    if (!service.packageBelongsToPermit(packageNumber, permitNumber)) {
      throw new AccessDeniedException("Package does not belong to the supplied permit.");
    }
  }

  private List<Long> acquireApplicationLocksForMutation(
      List<Long> applicationNumbers, Authentication authentication) {
    if (editLockService == null) {
      return List.of();
    }
    String currentUser = userId(authentication);
    List<Long> acquiredForMutation = new java.util.ArrayList<>();
    try {
      for (Long applicationNumber : normalizedApplicationNumbers(applicationNumbers)) {
        ApplicationEditLockDto existing =
            editLockService.snapshot(applicationNumber, currentUser, false);
        ApplicationEditLockDto lock =
            editLockService.acquire(applicationNumber, currentUser, currentUser, false);
        if (lock == null || lock.locked()) {
          throw new EditLockConflictException(
              lock == null ? "The application edit lock could not be acquired." : lock.message());
        }
        if (existing == null || !existing.heldByCurrentUser()) {
          acquiredForMutation.add(applicationNumber);
        }
      }
      return List.copyOf(acquiredForMutation);
    } catch (RuntimeException exception) {
      acquiredForMutation.forEach(
          applicationNumber -> editLockService.release(applicationNumber, currentUser));
      throw exception;
    }
  }

  private void releaseApplicationLocks(
      List<Long> applicationNumbers, Authentication authentication) {
    if (editLockService == null || applicationNumbers == null || applicationNumbers.isEmpty()) {
      return;
    }
    String currentUser = userId(authentication);
    applicationNumbers.forEach(
        applicationNumber -> editLockService.release(applicationNumber, currentUser));
  }

  private List<Long> normalizedApplicationNumbers(List<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return List.of();
    }
    return applicationNumbers.stream()
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
        .distinct()
        .sorted()
        .toList();
  }

  private List<Long> parseApplicationNumbers(String csv) {
    if (csv == null || csv.isBlank()) {
      return List.of();
    }
    return java.util.Arrays.stream(csv.split(","))
        .map(RequestParameterUtils::parsePositiveLong)
        .filter(java.util.Objects::nonNull)
        .distinct()
        .sorted()
        .toList();
  }

  private PermitDocumentItemRpcResponseDto requirePermitDocumentAccess(
      PermitDetailsRpcService service,
      Long documentId,
      Long permitNumber,
      Authentication authentication) {
    requirePermitAccess(permitNumber, authentication);
    return service
        .findDocumentForPermit(documentId, permitNumber)
        .filter(item -> canAccessPermitDocument(item, permitNumber, authentication))
        .orElseThrow(
            () ->
                new AccessDeniedException(
                    "Document does not belong to an accessible source for the supplied permit."));
  }

  private PermitDocumentItemRpcResponseDto requirePermitDocumentSource(
      PermitDetailsRpcService service,
      Long documentId,
      Long permitNumber,
      Authentication authentication,
      String expectedSource) {
    PermitDocumentItemRpcResponseDto document =
        requirePermitDocumentAccess(service, documentId, permitNumber, authentication);
    if (!document.deletable() || !expectedSource.equals(document.source())) {
      throw new AccessDeniedException(
          "Document is not a " + expectedSource + " attachment for the supplied permit.");
    }
    return document;
  }

  private boolean canAccessPermitDocument(
      PermitDocumentItemRpcResponseDto document,
      Long permitNumber,
      Authentication authentication) {
    if (document == null || permitNumber == null || permitNumber < 1) {
      return false;
    }
    if ("application".equals(document.source())
        && document.sourceApplicationNumber() != null
        && document.sourcePermitNumber() == null) {
      if (!authorizationService.canPerformAction(
          sessionService.parseRolesFromPrincipal(authentication),
          LEGACY_ACTION_APPLICATION_DETAILS)) {
        return false;
      }
      try {
        requireApplicationAccess(document.sourceApplicationNumber(), authentication);
        return true;
      } catch (AccessDeniedException ex) {
        return false;
      }
    }
    return ("permit".equals(document.source()) || "invoice".equals(document.source()))
        && permitNumber.equals(document.sourcePermitNumber())
        && document.sourceApplicationNumber() == null;
  }

  private void requirePermitEditable(Long permitNumber, Authentication authentication) {
    requireCanonicalPermitMutable(permitNumber);
    if (editLockService == null) {
      return;
    }
    ApplicationEditLockDto lock = acquirePermitLock(permitNumber, authentication);
    if (lock == null || lock.locked()) {
      throw new EditLockConflictException(
          lock == null ? "The permit edit lock could not be acquired." : lock.message());
    }
  }

  private void requireCanonicalPermitMutable(Long permitNumber) {
    if (permitService == null) {
      throw new AccessDeniedException("Permit status is unavailable for mutation.");
    }
    String permitStatus =
        permitService
            .findByPermitNumber(permitNumber)
            .map(detail -> detail.permitStatusCode())
            .map(status -> status == null ? "" : status.trim().toUpperCase(Locale.ROOT))
            .filter(status -> !status.isBlank())
            .orElseThrow(
                () -> new AccessDeniedException("Permit status is unavailable for mutation."));
    if (PERMIT_STATUS_EXPIRED.equals(permitStatus)) {
      throw new AccessDeniedException("Expired permits are read-only.");
    }
  }

  private ApplicationEditLockDto acquirePermitLock(
      Long permitNumber, Authentication authentication) {
    if (editLockService == null) {
      return null;
    }
    String currentUser = userId(authentication);
    return editLockService.acquirePermit(
        permitNumber, currentUser, currentUser, false);
  }

  private MutationExemptionLock acquireMutationExemptionLock(
      String exemptionNumber, Authentication authentication) {
    if (editLockService == null
        || exemptionNumber == null
        || exemptionNumber.isBlank()) {
      return null;
    }
    String currentUser = userId(authentication);
    ApplicationEditLockDto previous =
        editLockService.snapshotExemption(exemptionNumber, currentUser, false);
    ApplicationEditLockDto acquired =
        editLockService.acquireExemption(
            exemptionNumber, currentUser, currentUser, false);
    if (acquired == null || acquired.locked()) {
      throw new EditLockConflictException(
          acquired == null
              ? "The exemption edit lock could not be acquired."
              : acquired.message());
    }
    return new MutationExemptionLock(
        exemptionNumber,
        currentUser,
        previous == null || !previous.heldByCurrentUser());
  }

  private List<MutationExemptionLock> acquireMutationExemptionLocks(
      List<String> exemptionNumbers, Authentication authentication) {
    if (editLockService == null || exemptionNumbers == null || exemptionNumbers.isEmpty()) {
      return List.of();
    }
    List<MutationExemptionLock> acquiredLocks = new ArrayList<>();
    try {
      for (String exemptionNumber : normalizedExemptionNumbers(exemptionNumbers)) {
        MutationExemptionLock lock =
            acquireMutationExemptionLock(exemptionNumber, authentication);
        if (lock != null) {
          acquiredLocks.add(lock);
        }
      }
      return List.copyOf(acquiredLocks);
    } catch (RuntimeException exception) {
      releaseMutationExemptionLocks(acquiredLocks);
      throw exception;
    }
  }

  private List<String> normalizedExemptionNumbers(List<String> exemptionNumbers) {
    if (exemptionNumbers == null || exemptionNumbers.isEmpty()) {
      return List.of();
    }
    TreeSet<String> normalized = new TreeSet<>();
    exemptionNumbers.stream()
        .map(this::normalizeExemptionNumber)
        .filter(java.util.Objects::nonNull)
        .map(value -> value.toUpperCase(Locale.ROOT))
        .forEach(normalized::add);
    return List.copyOf(normalized);
  }

  private void releaseMutationExemptionLock(MutationExemptionLock lock) {
    if (editLockService != null && lock != null && lock.releaseAfterMutation()) {
      editLockService.releaseExemption(lock.exemptionNumber(), lock.userId());
    }
  }

  private void releaseMutationExemptionLocks(List<MutationExemptionLock> locks) {
    if (locks == null || locks.isEmpty()) {
      return;
    }
    List<MutationExemptionLock> reverseOrder = new ArrayList<>(locks);
    Collections.reverse(reverseOrder);
    reverseOrder.forEach(this::releaseMutationExemptionLock);
  }

  private String userId(Authentication authentication) {
    if (principalService != null) {
      return principalService.resolvePrincipalName(authentication);
    }
    return authentication == null ? null : authentication.getName();
  }

  private BigDecimal parsePositiveDecimal(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      BigDecimal parsed = new BigDecimal(rawValue.trim());
      return parsed.compareTo(BigDecimal.ZERO) > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  public record CheckFormChangesResponseDto(boolean permitChanged) {}

  public record PermitEditContextResponseDto(
      boolean overrideEnabled,
      String overrideFee,
      String overrideComment,
      boolean locked,
      String lockMessage) {}

  public record ReleaseLockResponseDto(String release) {}

  public record PermitApprovalEmailDefaultResponseDto(String clientEmailAddress) {}

  public record RemoveDocumentResponseDto(String success) {}

  private record MutationExemptionLock(
      String exemptionNumber, String userId, boolean releaseAfterMutation) {}
}

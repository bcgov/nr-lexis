package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/application-reviews")
@Validated
public class ApplicationReviewController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ApplicationReviewController.class);

  private final ObjectProvider<ApplicationReviewService> serviceProvider;
  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ProvincialAuthorizationService provincialAuthorizationService;
  private final ApplicationPermitOperationCoordinator operationCoordinator;
  private LexisPrincipalService principalService;
  private ApplicationEditLockService editLockService;

  public ApplicationReviewController(
      ObjectProvider<ApplicationReviewService> serviceProvider,
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ProvincialAuthorizationService provincialAuthorizationService,
      ApplicationPermitOperationCoordinator operationCoordinator) {
    this.serviceProvider = serviceProvider;
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.provincialAuthorizationService = provincialAuthorizationService;
    this.operationCoordinator = operationCoordinator;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
  }

  @Autowired
  void setApplicationEditLockService(ApplicationEditLockService editLockService) {
    this.editLockService = editLockService;
  }

  @GetMapping("/search/options")
  public ResponseEntity<ApplicationReviewSearchOptionsDto> searchOptions() {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<ApplicationReviewSearchResponseDto> search(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
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
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.APPLICATION_REVIEW);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new ApplicationReviewSearchResponseDto(List.of(), 0, page, size));
    }
    ApplicationReviewSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            orgUnits.orgUnitNumbers(),
            sortField,
            page,
            size);

    if (knownTotal != null) {
      return ResponseEntity.ok(service.search(criteria, knownTotal));
    }
    return ResponseEntity.ok(service.search(criteria));
  }

  ResponseEntity<ApplicationReviewSearchResponseDto> search(
      String applicationNumber,
      String productTypeCode,
      String receivedFromDate,
      String receivedToDate,
      String listingFromDate,
      String listingToDate,
      List<Long> regionNumbers,
      String sortField,
      Integer page,
      Integer size,
      Integer knownTotal) {
    return search(
        applicationNumber,
        productTypeCode,
        receivedFromDate,
        receivedToDate,
        listingFromDate,
        listingToDate,
        regionNumbers,
        sortField,
        page,
        size,
        knownTotal,
        null);
  }

  @GetMapping("/search/count")
  public ResponseEntity<SearchCountResponseDto> count(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      Authentication authentication) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.APPLICATION_REVIEW);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new SearchCountResponseDto(0));
    }
    ApplicationReviewSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            orgUnits.orgUnitNumbers(),
            null,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/search/preview")
  public ResponseEntity<ApplicationReviewPreviewResponseDto> preview(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "5") @Min(1) @Max(50) Integer size,
      Authentication authentication) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for preview");
      return ResponseEntity.noContent().build();
    }

    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.APPLICATION_REVIEW);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new ApplicationReviewPreviewResponseDto(List.of(), false, page, size));
    }
    ApplicationReviewSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            orgUnits.orgUnitNumbers(),
            sortField,
            page,
            size);
    return ResponseEntity.ok(service.preview(criteria));
  }

  @PostMapping("/{applicationNumber}/approve")
  public ResponseEntity<ApplicationReviewStatusUpdateResultDto> approve(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      HttpServletRequest request,
      Authentication authentication) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for approve");
      return ResponseEntity.noContent().build();
    }

    provincialAuthorizationService.requireApplicationReview(authentication, applicationNumber);
    String userId = resolvePrincipalName(request);
    return ResponseEntity.ok(
        withApplicationAggregateLock(
            applicationNumber,
            authentication,
            () ->
                withApplicationEditLock(
                    applicationNumber,
                    userId,
                    () -> service.approve(applicationNumber, userId))));
  }

  ResponseEntity<ApplicationReviewStatusUpdateResultDto> approve(
      Long applicationNumber, HttpServletRequest request) {
    return approve(applicationNumber, request, null);
  }

  @PostMapping("/{applicationNumber}/status")
  public ResponseEntity<ApplicationReviewStatusUpdateResultDto> updateStatus(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody(required = false) ApplicationReviewStatusUpdateRequestDto requestBody,
      HttpServletRequest request,
      Authentication authentication) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for status update");
      return ResponseEntity.noContent().build();
    }

    provincialAuthorizationService.requireApplicationReview(authentication, applicationNumber);
    String userId = resolvePrincipalName(request);
    return ResponseEntity.ok(
        withApplicationAggregateLock(
            applicationNumber,
            authentication,
            () ->
                withApplicationEditLock(
                    applicationNumber,
                    userId,
                    () -> service.updateStatus(applicationNumber, requestBody, userId))));
  }

  ResponseEntity<ApplicationReviewStatusUpdateResultDto> updateStatus(
      Long applicationNumber,
      ApplicationReviewStatusUpdateRequestDto requestBody,
      HttpServletRequest request) {
    return updateStatus(applicationNumber, requestBody, request, null);
  }

  @PostMapping("/{applicationNumber}/status-email")
  public ResponseEntity<ApplicationReviewStatusEmailResultDto> sendStatusEmail(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody(required = false) ApplicationReviewStatusEmailRequestDto requestBody,
      Authentication authentication) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for status email");
      return ResponseEntity.noContent().build();
    }

    provincialAuthorizationService.requireApplicationReview(authentication, applicationNumber);
    return ResponseEntity.ok(service.sendStatusEmail(applicationNumber, requestBody));
  }

  ResponseEntity<ApplicationReviewStatusEmailResultDto> sendStatusEmail(
      Long applicationNumber, ApplicationReviewStatusEmailRequestDto requestBody) {
    return sendStatusEmail(applicationNumber, requestBody, null);
  }

  public ResponseEntity<Map<String, Object>> approveLegacy(
      MultiValueMap<String, String> parameters, HttpServletRequest request) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for legacy approve");
      return ResponseEntity.noContent().build();
    }

    Long applicationNumber = parsePositiveLong(first(parameters, "applicationNumber"));
    Authentication authentication = requestAuthentication(request);
    if (applicationNumber != null) {
      provincialAuthorizationService.requireApplicationReview(authentication, applicationNumber);
    }
    String userId = resolvePrincipalName(request);
    ApplicationReviewStatusUpdateResultDto result =
        applicationNumber == null
            ? invalidStatusUpdate("Application number must be a positive value.")
            : withApplicationAggregateLock(
                applicationNumber,
                authentication,
                () ->
                    withApplicationEditLock(
                        applicationNumber,
                        userId,
                        () -> service.approve(applicationNumber, userId)));

    return ResponseEntity.ok(legacyStatusUpdatePayload(result));
  }

  public ResponseEntity<Map<String, Object>> disapproveLegacy(
      MultiValueMap<String, String> parameters, HttpServletRequest request) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for legacy disapprove");
      return ResponseEntity.noContent().build();
    }

    Long applicationNumber = parsePositiveLong(first(parameters, "applicationNumber"));
    Authentication authentication = requestAuthentication(request);
    if (applicationNumber != null) {
      provincialAuthorizationService.requireApplicationReview(authentication, applicationNumber);
    }
    String statusCode = first(parameters, "applicationReviewStatus", "appStatus", "statusCode");
    String remark = first(parameters, "remarkBody", "remark");
    String clientEmail = first(parameters, "clientEmailAddress");
    String userId = resolvePrincipalName(request);
    ApplicationReviewStatusUpdateResultDto result =
        applicationNumber == null
            ? invalidStatusUpdate("Application number must be a positive value.")
            : withApplicationAggregateLock(
                applicationNumber,
                authentication,
                () ->
                    withApplicationEditLock(
                        applicationNumber,
                        userId,
                        () ->
                            service.updateStatus(
                                applicationNumber,
                                new ApplicationReviewStatusUpdateRequestDto(
                                    statusCode, remark, clientEmail),
                                userId)));

    Map<String, Object> payload = legacyStatusUpdatePayload(result);
    payload.put("clientEmail", legacyClientEmail(result.clientEmail()));
    payload.put("remark", result.remark() == null ? "" : result.remark());
    return ResponseEntity.ok(payload);
  }

  public ResponseEntity<Map<String, Object>> sendStatusEmailLegacy(
      MultiValueMap<String, String> parameters) {
    return sendStatusEmailLegacy(parameters, null);
  }

  public ResponseEntity<Map<String, Object>> sendStatusEmailLegacy(
      MultiValueMap<String, String> parameters, Authentication authentication) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for legacy status email");
      return ResponseEntity.noContent().build();
    }

    Long applicationNumber = parsePositiveLong(first(parameters, "applicationNumber"));
    if (applicationNumber != null) {
      provincialAuthorizationService.requireApplicationReview(authentication, applicationNumber);
    }
    ApplicationReviewStatusEmailResultDto result =
        applicationNumber == null
            ? new ApplicationReviewStatusEmailResultDto(
                false, "Application number must be a positive value.")
            : service.sendStatusEmail(
                applicationNumber,
                new ApplicationReviewStatusEmailRequestDto(
                    first(
                        parameters,
                        "appStatus",
                        "statusCode",
                        "applicationReviewStatus"),
                    first(parameters, "clientEmailAddress"),
                    first(parameters, "remark", "remarkBody")));

    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("success", Boolean.toString(result.success()));
    payload.put("message", result.message());
    return ResponseEntity.ok(payload);
  }

  private String resolvePrincipalName(HttpServletRequest request) {
    Principal principal = request.getUserPrincipal();
    if (principalService != null) {
      return principalService.resolvePrincipalName(principal);
    }
    return principal == null ? null : principal.getName();
  }

  private <T> T withApplicationEditLock(
      Long applicationNumber, String userId, Supplier<T> mutation) {
    if (editLockService == null) {
      return mutation.get();
    }

    ApplicationEditLockDto existing =
        editLockService.snapshot(applicationNumber, userId, false);
    ApplicationEditLockDto acquired =
        editLockService.acquire(applicationNumber, userId, userId, false);
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

  private <T> T withApplicationAggregateLock(
      Long applicationNumber,
      Authentication authentication,
      Supplier<T> mutation) {
    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    if (applicationDetailsService == null) {
      throw new org.springframework.dao.DataRetrievalFailureException(
          "Application permit relationships are unavailable for status mutation.");
    }
    return operationCoordinator.executeApplicationMutation(
        applicationNumber,
        () ->
            applicationDetailsService.getPermitNumbersForApplicationMutation(
                applicationNumber),
        () -> {
          provincialAuthorizationService.requireApplicationReview(
              authentication, applicationNumber);
          return mutation.get();
        });
  }

  private Authentication requestAuthentication(HttpServletRequest request) {
    if (request != null && request.getUserPrincipal() instanceof Authentication authentication) {
      return authentication;
    }
    return org.springframework.security.core.context.SecurityContextHolder.getContext()
        .getAuthentication();
  }

  private ApplicationReviewStatusUpdateResultDto invalidStatusUpdate(String message) {
    return new ApplicationReviewStatusUpdateResultDto(
        false, false, null, null, null, null, null, null, message);
  }

  private Map<String, Object> legacyStatusUpdatePayload(
      ApplicationReviewStatusUpdateResultDto result) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("hasLock", result.updated());
    payload.put("valid", result.valid());
    payload.put("statusCode", result.statusCode());
    payload.put("clientEmail", result.clientEmail());
    payload.put("remark", result.remark());
    payload.put("message", result.message());
    payload.put("errors", result.valid() ? List.of() : List.of(result.message()));
    payload.put("warnings", List.of());
    return payload;
  }

  private String legacyClientEmail(String clientEmail) {
    String normalized = trimToNull(clientEmail);
    return normalized == null ? "none" : normalized;
  }

  private ApplicationReviewSearchCriteria buildCriteria(
      String applicationNumber,
      String productTypeCode,
      String receivedFromDate,
      String receivedToDate,
      String listingFromDate,
      String listingToDate,
      List<Long> regionNumbers,
      String sortField,
      Integer page,
      Integer size) {
    return new ApplicationReviewSearchCriteria(
        applicationNumber,
        productTypeCode,
        parseSearchDate(receivedFromDate),
        parseSearchDate(receivedToDate),
        parseSearchDate(listingFromDate),
        parseSearchDate(listingToDate),
        regionNumbers == null ? List.of() : regionNumbers,
        sortField,
        page,
        size);
  }
}

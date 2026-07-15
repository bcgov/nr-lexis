package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
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

  public ApplicationReviewController(ObjectProvider<ApplicationReviewService> serviceProvider) {
    this.serviceProvider = serviceProvider;
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
      @RequestParam(name = "knownTotal", required = false) @PositiveOrZero Integer knownTotal) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    ApplicationReviewSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            regionNumbers,
            sortField,
            page,
            size);

    if (knownTotal != null) {
      return ResponseEntity.ok(service.search(criteria, knownTotal));
    }
    return ResponseEntity.ok(service.search(criteria));
  }

  @GetMapping("/search/count")
  public ResponseEntity<SearchCountResponseDto> count(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    ApplicationReviewSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            regionNumbers,
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
      @RequestParam(name = "size", defaultValue = "5") @Min(1) @Max(50) Integer size) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for preview");
      return ResponseEntity.noContent().build();
    }

    ApplicationReviewSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            productTypeCode,
            receivedFromDate,
            receivedToDate,
            listingFromDate,
            listingToDate,
            regionNumbers,
            sortField,
            page,
            size);
    return ResponseEntity.ok(service.preview(criteria));
  }

  @PostMapping("/{applicationNumber}/approve")
  public ResponseEntity<ApplicationReviewStatusUpdateResultDto> approve(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      HttpServletRequest request) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for approve");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.approve(applicationNumber, resolvePrincipalName(request)));
  }

  @PostMapping("/{applicationNumber}/status")
  public ResponseEntity<ApplicationReviewStatusUpdateResultDto> updateStatus(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody(required = false) ApplicationReviewStatusUpdateRequestDto requestBody,
      HttpServletRequest request) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for status update");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.updateStatus(applicationNumber, requestBody, resolvePrincipalName(request)));
  }

  @PostMapping("/{applicationNumber}/status-email")
  public ResponseEntity<ApplicationReviewStatusEmailResultDto> sendStatusEmail(
      @PathVariable("applicationNumber") @Positive Long applicationNumber,
      @RequestBody(required = false) ApplicationReviewStatusEmailRequestDto requestBody) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for status email");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.sendStatusEmail(applicationNumber, requestBody));
  }

  public ResponseEntity<Map<String, Object>> approveLegacy(
      MultiValueMap<String, String> parameters, HttpServletRequest request) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for legacy approve");
      return ResponseEntity.noContent().build();
    }

    Long applicationNumber = parsePositiveLong(first(parameters, "applicationNumber"));
    ApplicationReviewStatusUpdateResultDto result =
        applicationNumber == null
            ? invalidStatusUpdate("Application number must be a positive value.")
            : service.approve(applicationNumber, resolvePrincipalName(request));

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
    String statusCode = first(parameters, "applicationReviewStatus", "appStatus", "statusCode");
    String remark = first(parameters, "remarkBody", "remark");
    String clientEmail = first(parameters, "clientEmailAddress");
    ApplicationReviewStatusUpdateResultDto result =
        applicationNumber == null
            ? invalidStatusUpdate("Application number must be a positive value.")
            : service.updateStatus(
                applicationNumber,
                new ApplicationReviewStatusUpdateRequestDto(statusCode, remark, clientEmail),
                resolvePrincipalName(request));

    Map<String, Object> payload = legacyStatusUpdatePayload(result);
    payload.put("clientEmail", legacyClientEmail(result.clientEmail()));
    payload.put("remark", result.remark() == null ? "" : result.remark());
    return ResponseEntity.ok(payload);
  }

  public ResponseEntity<Map<String, Object>> sendStatusEmailLegacy(
      MultiValueMap<String, String> parameters) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for legacy status email");
      return ResponseEntity.noContent().build();
    }

    Long applicationNumber = parsePositiveLong(first(parameters, "applicationNumber"));
    ApplicationReviewStatusEmailResultDto result =
        applicationNumber == null
            ? new ApplicationReviewStatusEmailResultDto(
                false, "Application number must be a positive value.")
            : service.sendStatusEmail(
                applicationNumber,
                new ApplicationReviewStatusEmailRequestDto(
                    first(parameters, "appStatus", "statusCode", "applicationReviewStatus"),
                    first(parameters, "clientEmailAddress"),
                    first(parameters, "remark", "remarkBody")));

    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("success", Boolean.toString(result.success()));
    payload.put("message", result.message());
    return ResponseEntity.ok(payload);
  }

  private String resolvePrincipalName(HttpServletRequest request) {
    Principal principal = request.getUserPrincipal();
    return principal == null ? null : principal.getName();
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

package ca.bc.gov.mof.lexis.controller;

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
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/lexis/application-reviews")
@Validated
public class ApplicationReviewController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ApplicationReviewController.class);
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

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
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    ApplicationReviewService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    ApplicationReviewSearchCriteria criteria =
        new ApplicationReviewSearchCriteria(
            applicationNumber,
            productTypeCode,
            parseDate(receivedFromDate),
            parseDate(receivedToDate),
            parseDate(listingFromDate),
            parseDate(listingToDate),
            regionNumbers == null ? List.of() : regionNumbers,
            sortField,
            page,
            size);

    return ResponseEntity.ok(service.search(criteria));
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

  private String resolvePrincipalName(HttpServletRequest request) {
    Principal principal = request.getUserPrincipal();
    return principal == null ? null : principal.getName();
  }

  private LocalDate parseDate(String input) {
    if (input == null || input.trim().isEmpty()) {
      return null;
    }

    String value = input.trim();
    try {
      return LocalDate.parse(value);
    } catch (DateTimeParseException ignored) {
      // Fallback for legacy date format.
    }

    try {
      return LocalDate.parse(value, LEGACY_DATE_FORMATTER);
    } catch (DateTimeParseException ex) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST,
          "Invalid date value '" + value + "'. Use yyyy-MM-dd or MM/dd/yyyy.",
          ex);
    }
  }
}

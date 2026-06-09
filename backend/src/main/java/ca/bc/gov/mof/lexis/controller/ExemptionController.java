package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/lexis/exemptions")
@Validated
public class ExemptionController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionController.class);
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ObjectProvider<ExemptionService> serviceProvider;

  public ExemptionController(ObjectProvider<ExemptionService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @GetMapping("/search/options")
  public ResponseEntity<ExemptionSearchOptionsDto> searchOptions() {
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<ExemptionSearchResponseDto> search(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "exemptionType", required = false) String exemptionType,
      @RequestParam(name = "exemptionTypeCode", required = false) String exemptionTypeCode,
      @RequestParam(name = "exemptionStatus", required = false) String exemptionStatus,
      @RequestParam(name = "exemptionStatusCode", required = false) String exemptionStatusCode,
      @RequestParam(name = "approvalFromDate", required = false) String approvalFromDate,
      @RequestParam(name = "approvalToDate", required = false) String approvalToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listFromDate", required = false) String listFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "listToDate", required = false) String listToDate,
      @RequestParam(name = "applicantClientNumber", required = false) String applicantClientNumber,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    ExemptionSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            exemptionNumber,
            exemptionType,
            exemptionTypeCode,
            exemptionStatus,
            exemptionStatusCode,
            approvalFromDate,
            approvalToDate,
            listingFromDate,
            listFromDate,
            listingToDate,
            listToDate,
            applicantClientNumber,
            ownerClientNumber,
            regionNumbers,
            page,
            size);

    return ResponseEntity.ok(service.search(criteria));
  }

  @GetMapping("/search/count")
  public ResponseEntity<SearchCountResponseDto> count(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "exemptionType", required = false) String exemptionType,
      @RequestParam(name = "exemptionTypeCode", required = false) String exemptionTypeCode,
      @RequestParam(name = "exemptionStatus", required = false) String exemptionStatus,
      @RequestParam(name = "exemptionStatusCode", required = false) String exemptionStatusCode,
      @RequestParam(name = "approvalFromDate", required = false) String approvalFromDate,
      @RequestParam(name = "approvalToDate", required = false) String approvalToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listFromDate", required = false) String listFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "listToDate", required = false) String listToDate,
      @RequestParam(name = "applicantClientNumber", required = false) String applicantClientNumber,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers) {
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    ExemptionSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            exemptionNumber,
            exemptionType,
            exemptionTypeCode,
            exemptionStatus,
            exemptionStatusCode,
            approvalFromDate,
            approvalToDate,
            listingFromDate,
            listFromDate,
            listingToDate,
            listToDate,
            applicantClientNumber,
            ownerClientNumber,
            regionNumbers,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{exemptionNumber}")
  public ResponseEntity<ExemptionDetailDto> getByExemptionNumber(
      @PathVariable("exemptionNumber") String exemptionNumber) {
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption service unavailable - returning no content for detail");
      return ResponseEntity.noContent().build();
    }
    return service.findByExemptionNumber(exemptionNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  private String firstPresent(String primary, String fallback) {
    if (primary != null && !primary.isBlank()) {
      return primary;
    }
    return fallback;
  }

  private ExemptionSearchCriteria buildCriteria(
      String applicationNumber,
      String packageNumber,
      String exemptionNumber,
      String exemptionType,
      String exemptionTypeCode,
      String exemptionStatus,
      String exemptionStatusCode,
      String approvalFromDate,
      String approvalToDate,
      String listingFromDate,
      String listFromDate,
      String listingToDate,
      String listToDate,
      String applicantClientNumber,
      String ownerClientNumber,
      List<Long> regionNumbers,
      Integer page,
      Integer size) {
    return new ExemptionSearchCriteria(
        applicationNumber,
        packageNumber,
        exemptionNumber,
        firstPresent(exemptionType, exemptionTypeCode),
        firstPresent(exemptionStatus, exemptionStatusCode),
        applicantClientNumber,
        ownerClientNumber,
        parseDate(approvalFromDate),
        parseDate(approvalToDate),
        parseDate(firstPresent(listingFromDate, listFromDate)),
        parseDate(firstPresent(listingToDate, listToDate)),
        regionNumbers == null ? List.of() : regionNumbers,
        page,
        size);
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

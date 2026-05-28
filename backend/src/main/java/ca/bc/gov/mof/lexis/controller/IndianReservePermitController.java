package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.service.reserve.IndianReservePermitService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/lexis/indian-reserve/permits")
@Validated
public class IndianReservePermitController {

  private static final Logger LOGGER = LoggerFactory.getLogger(IndianReservePermitController.class);
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ObjectProvider<IndianReservePermitService> serviceProvider;

  public IndianReservePermitController(ObjectProvider<IndianReservePermitService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @GetMapping("/search/options")
  public ResponseEntity<IndianReservePermitSearchOptionsDto> searchOptions() {
    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<IndianReservePermitSearchResponseDto> search(
      @RequestParam(name = "permitNumber", required = false) String permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "fromPermitIssueDate", required = false) String issuedFromDate,
      @RequestParam(name = "toPermitIssueDate", required = false) String issuedToDate,
      @RequestParam(name = "fromEstimatedShippingDate", required = false) String shippingFromDate,
      @RequestParam(name = "toEstimatedShippingDate", required = false) String shippingToDate,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    IndianReservePermitSearchCriteria criteria =
        new IndianReservePermitSearchCriteria(
            permitNumber,
            packageNumber,
            parseDate(issuedFromDate),
            parseDate(issuedToDate),
            parseDate(shippingFromDate),
            parseDate(shippingToDate),
            page,
            size);

    return ResponseEntity.ok(service.search(criteria));
  }

  @GetMapping("/{permitNumber}")
  public ResponseEntity<IndianReservePermitDetailDto> getByPermitNumber(
      @PathVariable("permitNumber") String permitNumber) {
    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for detail");
      return ResponseEntity.noContent().build();
    }
    return service.findByPermitNumber(permitNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
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

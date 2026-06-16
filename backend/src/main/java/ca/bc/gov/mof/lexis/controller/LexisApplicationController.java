package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationOfferValidationDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationValidationDto;
import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.Arrays;
import java.util.List;
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
@RequestMapping("/api/lexis/applications")
@Validated
public class LexisApplicationController {

  private final LexisApplicationService service;

  public LexisApplicationController(LexisApplicationService service) {
    this.service = service;
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
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {

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
            sortField,
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
      @RequestParam(name = "applicationStatus", required = false) String applicationStatus,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "agentClientNumber", required = false) String agentClientNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers) {
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
            null,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{applicationNumber}")
  public ResponseEntity<LexisApplicationDetailDto> getByApplicationNumber(
      @PathVariable("applicationNumber") @Positive Long applicationNumber) {
    return service.findByApplicationNumber(applicationNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @GetMapping("/search/verify-clients")
  public ResponseEntity<LexisApplicationValidationDto> verifyClients(
      @RequestParam(name = "applications") String applications) {
    List<Long> ids = parseApplicationNumbers(applications);
    return ResponseEntity.ok(new LexisApplicationValidationDto(service.verifyApplicationClients(ids)));
  }

  @GetMapping("/search/has-valid-offer")
  public ResponseEntity<LexisApplicationOfferValidationDto> hasValidOffer(
      @RequestParam(name = "applications") String applications) {
    List<Long> ids = parseApplicationNumbers(applications);
    return ResponseEntity.ok(new LexisApplicationOfferValidationDto(service.hasValidOffer(ids)));
  }

  private List<Long> parseApplicationNumbers(String applications) {
    if (applications == null || applications.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "`applications` must not be empty");
    }

    try {
      return Arrays.stream(applications.split(","))
          .map(String::trim)
          .filter(value -> !value.isEmpty())
          .map(Long::valueOf)
          .toList();
    } catch (NumberFormatException ex) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "`applications` must be a comma-separated numeric list", ex);
    }
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
        sortField,
        page,
        size);
  }
}

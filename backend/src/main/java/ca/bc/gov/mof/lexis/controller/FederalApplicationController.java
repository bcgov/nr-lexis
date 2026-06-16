package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.firstPresent;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseApplicationNumbers;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationValidationDto;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
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

@RestController
@RequestMapping("/api/lexis/federal/applications")
@Validated
public class FederalApplicationController {

  private static final Logger LOGGER = LoggerFactory.getLogger(FederalApplicationController.class);

  private final ObjectProvider<FederalApplicationService> serviceProvider;

  public FederalApplicationController(ObjectProvider<FederalApplicationService> serviceProvider) {
    this.serviceProvider = serviceProvider;
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
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
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
            page,
            size);

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
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{applicationNumber}")
  public ResponseEntity<FederalApplicationDetailDto> getByApplicationNumber(
      @PathVariable("applicationNumber") @Positive Long applicationNumber) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for detail");
      return ResponseEntity.noContent().build();
    }
    return service.findByApplicationNumber(applicationNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @GetMapping("/{applicationNumber}/permit")
  public ResponseEntity<FederalApplicationPermitDto> getFederalPermit(
      @PathVariable("applicationNumber") @Positive Long applicationNumber) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for permit lookup");
      return ResponseEntity.noContent().build();
    }
    return service.findPermitByApplicationNumber(applicationNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @GetMapping("/search/verify-clients")
  public ResponseEntity<FederalApplicationValidationDto> verifyClients(
      @RequestParam(name = "applications") String applications) {
    FederalApplicationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Federal application service unavailable - returning no content for verify clients");
      return ResponseEntity.noContent().build();
    }
    List<Long> ids = parseApplicationNumbers(applications);
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
        page,
        size);
  }
}

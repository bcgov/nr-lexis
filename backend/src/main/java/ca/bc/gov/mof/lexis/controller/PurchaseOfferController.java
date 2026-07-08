package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.firstPresent;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.currentForestClientNumber;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.matchesScopedClient;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/purchase-offers")
@Validated
public class PurchaseOfferController {

  private static final Logger LOGGER = LoggerFactory.getLogger(PurchaseOfferController.class);

  private final ObjectProvider<PurchaseOfferService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisApplicationService applicationService;

  public PurchaseOfferController(
      ObjectProvider<PurchaseOfferService> serviceProvider,
      LexisSessionService sessionService,
      LexisApplicationService applicationService) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.applicationService = applicationService;
  }

  @GetMapping("/search/options")
  public ResponseEntity<PurchaseOfferSearchOptionsDto> searchOptions() {
    PurchaseOfferService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<PurchaseOfferSearchResponseDto> search(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listFromDate", required = false) String listFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "listToDate", required = false) String listToDate,
      @RequestParam(name = "withdrawalFromDate", required = false) String withdrawalFromDate,
      @RequestParam(name = "withdrawalToDate", required = false) String withdrawalToDate,
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "knownTotal", required = false) @PositiveOrZero Integer knownTotal,
      Authentication authentication) {
    PurchaseOfferService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null) {
      clientNumber = scopedClientNumber;
    }

    PurchaseOfferSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            listingFromDate,
            listFromDate,
            listingToDate,
            listToDate,
            withdrawalFromDate,
            withdrawalToDate,
            clientNumber,
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
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listFromDate", required = false) String listFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "listToDate", required = false) String listToDate,
      @RequestParam(name = "withdrawalFromDate", required = false) String withdrawalFromDate,
      @RequestParam(name = "withdrawalToDate", required = false) String withdrawalToDate,
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      Authentication authentication) {
    PurchaseOfferService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null) {
      clientNumber = scopedClientNumber;
    }

    PurchaseOfferSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            listingFromDate,
            listFromDate,
            listingToDate,
            listToDate,
            withdrawalFromDate,
            withdrawalToDate,
            clientNumber,
            regionNumbers,
            null,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{offerNumber}")
  public ResponseEntity<PurchaseOfferDetailDto> getByOfferNumber(
      @PathVariable("offerNumber") @Positive Long offerNumber,
      Authentication authentication) {
    PurchaseOfferService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for detail");
      return ResponseEntity.noContent().build();
    }
    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    return service.findByOfferNumber(offerNumber)
        .filter(detail -> canAccessOfferDetail(scopedClientNumber, detail))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  private boolean canAccessOfferDetail(
      String scopedClientNumber, PurchaseOfferDetailDto detail) {
    if (scopedClientNumber == null || scopedClientNumber.isBlank()) {
      return true;
    }
    Long applicationNumber = detail == null ? null : detail.applicationNumber();
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    if (matchesScopedClient(scopedClientNumber, detail.offeringClientNumber())) {
      return true;
    }
    return applicationService.findByApplicationNumber(applicationNumber)
        .map(application -> matchesScopedApplicationClient(scopedClientNumber, application))
        .orElse(false);
  }

  private boolean matchesScopedApplicationClient(
      String scopedClientNumber, LexisApplicationDetailDto application) {
    return matchesScopedClient(
        scopedClientNumber, application.ownerClientNumber(), application.agentClientNumber());
  }

  private PurchaseOfferSearchCriteria buildCriteria(
      String applicationNumber,
      String packageNumber,
      String listingFromDate,
      String listFromDate,
      String listingToDate,
      String listToDate,
      String withdrawalFromDate,
      String withdrawalToDate,
      String clientNumber,
      List<Long> regionNumbers,
      String sortField,
      Integer page,
      Integer size) {
    return new PurchaseOfferSearchCriteria(
        applicationNumber,
        packageNumber,
        parseSearchDate(firstPresent(listingFromDate, listFromDate)),
        parseSearchDate(firstPresent(listingToDate, listToDate)),
        parseSearchDate(withdrawalFromDate),
        parseSearchDate(withdrawalToDate),
        clientNumber,
        regionNumbers == null ? List.of() : regionNumbers,
        sortField,
        page,
        size);
  }
}

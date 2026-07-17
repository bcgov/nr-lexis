package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.currentForestClientNumber;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
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
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/lexis/permits")
@Validated
public class PermitController {

  private static final Logger LOGGER = LoggerFactory.getLogger(PermitController.class);

  private final ObjectProvider<PermitService> serviceProvider;
  private final LexisSessionService sessionService;
  private final ProvincialAuthorizationService provincialAuthorizationService;

  public PermitController(
      ObjectProvider<PermitService> serviceProvider,
      LexisSessionService sessionService,
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @GetMapping("/search/options")
  public ResponseEntity<PermitSearchOptionsDto> searchOptions() {
    PermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<PermitSearchResponseDto> search(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "permitNumber", required = false) String permitNumber,
      @RequestParam(name = "issuedFromDate", required = false) String issuedFromDate,
      @RequestParam(name = "issuedToDate", required = false) String issuedToDate,
      @RequestParam(name = "permitStatus", required = false) String permitStatus,
      @RequestParam(name = "invoiceNumber", required = false) String invoiceNumber,
      @RequestParam(name = "applicantClientNumber", required = false) String applicantClientNumber,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "knownTotal", required = false) @PositiveOrZero Integer knownTotal,
      Authentication authentication) {
    PermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.PERMIT_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new PermitSearchResponseDto(List.of(), 0, page, size));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

    PermitSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            permitNumber,
            issuedFromDate,
            issuedToDate,
            permitStatus,
            invoiceNumber,
            applicantClientNumber,
            ownerClientNumber,
            scopedClientNumber,
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
      @RequestParam(name = "permitNumber", required = false) String permitNumber,
      @RequestParam(name = "issuedFromDate", required = false) String issuedFromDate,
      @RequestParam(name = "issuedToDate", required = false) String issuedToDate,
      @RequestParam(name = "permitStatus", required = false) String permitStatus,
      @RequestParam(name = "invoiceNumber", required = false) String invoiceNumber,
      @RequestParam(name = "applicantClientNumber", required = false) String applicantClientNumber,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      Authentication authentication) {
    PermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.PERMIT_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new SearchCountResponseDto(0));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

    PermitSearchCriteria criteria =
        buildCriteria(
            applicationNumber,
            packageNumber,
            permitNumber,
            issuedFromDate,
            issuedToDate,
            permitStatus,
            invoiceNumber,
            applicantClientNumber,
            ownerClientNumber,
            scopedClientNumber,
            regionNumbers,
            null,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{permitNumber}")
  public ResponseEntity<PermitDetailDto> getByPermitNumber(
      @PathVariable("permitNumber") @Positive Long permitNumber,
      Authentication authentication) {
    PermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit service unavailable - returning no content for detail");
      return ResponseEntity.noContent().build();
    }
    return service.findByPermitNumber(permitNumber)
        .filter(detail -> provincialAuthorizationService.canAccessPermit(authentication, detail))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  private PermitSearchCriteria buildCriteria(
      String applicationNumber,
      String packageNumber,
      String permitNumber,
      String issuedFromDate,
      String issuedToDate,
      String permitStatus,
      String invoiceNumber,
      String applicantClientNumber,
      String ownerClientNumber,
      String accessClientNumber,
      List<Long> regionNumbers,
      String sortField,
      Integer page,
      Integer size) {
    return new PermitSearchCriteria(
        applicationNumber,
        packageNumber,
        permitNumber,
        parseSearchDate(issuedFromDate),
        parseSearchDate(issuedToDate),
        permitStatus,
        invoiceNumber,
        applicantClientNumber,
        ownerClientNumber,
        accessClientNumber,
        false,
        regionNumbers == null ? List.of() : regionNumbers,
        sortField,
        page,
        size);
  }
}

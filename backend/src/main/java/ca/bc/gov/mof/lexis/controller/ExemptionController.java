package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.firstPresent;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.currentForestClientNumber;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/exemptions")
@Validated
public class ExemptionController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionController.class);

  private final ObjectProvider<ExemptionService> serviceProvider;
  private final ApplicationEditLockService editLockService;
  private final LexisSessionService sessionService;
  private final ProvincialAuthorizationService provincialAuthorizationService;

  public ExemptionController(
      ObjectProvider<ExemptionService> serviceProvider,
      ApplicationEditLockService editLockService,
      LexisSessionService sessionService,
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.serviceProvider = serviceProvider;
    this.editLockService = editLockService;
    this.sessionService = sessionService;
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @GetMapping("/search/options")
  public ResponseEntity<ExemptionSearchOptionsDto> searchOptions(Authentication authentication) {
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    ExemptionSearchOptionsDto options = service.searchOptions();
    if (provincialAuthorizationService.canViewBlanketOic(authentication)) {
      return ResponseEntity.ok(options);
    }
    return ResponseEntity.ok(
        new ExemptionSearchOptionsDto(
            options.exemptionTypes().stream()
                .filter(option -> option.code() == null || !"B".equalsIgnoreCase(option.code()))
                .toList(),
            options.exemptionStatuses(),
            options.regions()));
  }

  public ResponseEntity<ExemptionSearchOptionsDto> searchOptions() {
    return searchOptions(null);
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
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "knownTotal", required = false) @PositiveOrZero Integer knownTotal,
      Authentication authentication) {
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null) {
      applicantClientNumber = scopedClientNumber;
      ownerClientNumber = null;
    }
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.EXEMPTION_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new ExemptionSearchResponseDto(List.of(), 0, page, size));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

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
            scopedClientNumber != null,
            !provincialAuthorizationService.canViewBlanketOic(authentication),
            sortField,
            page,
            size);

    ExemptionSearchResponseDto response;
    if (knownTotal != null) {
      response = service.search(criteria, knownTotal);
    } else {
      response = service.search(criteria);
    }
    if (response == null) {
      throw new DataAccessResourceFailureException(
          "Oracle exemption search returned no response");
    }
    return ResponseEntity.ok(withSearchLocks(response));
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
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      Authentication authentication) {
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null) {
      applicantClientNumber = scopedClientNumber;
      ownerClientNumber = null;
    }
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.EXEMPTION_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new SearchCountResponseDto(0));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

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
            scopedClientNumber != null,
            !provincialAuthorizationService.canViewBlanketOic(authentication),
            null,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{exemptionNumber}")
  public ResponseEntity<ExemptionDetailDto> getByExemptionNumber(
      @PathVariable("exemptionNumber") String exemptionNumber,
      Authentication authentication) {
    long startedAtNanos = System.nanoTime();
    ExemptionService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "event=lexis_exemption_detail operation=get outcome=service_unavailable exemptionNumber={} durationMs={}",
          exemptionNumber,
          elapsedMillis(startedAtNanos));
      return ResponseEntity.noContent().build();
    }

    LOGGER.info(
        "event=lexis_exemption_detail operation=get outcome=started exemptionNumber={}",
        exemptionNumber);
    try {
      long lookupStartedAtNanos = System.nanoTime();
      ExemptionDetailDto detail = service.findByExemptionNumber(exemptionNumber).orElse(null);
      long lookupDurationMillis = elapsedMillis(lookupStartedAtNanos);

      long authorizationStartedAtNanos = System.nanoTime();
      boolean authorized =
          detail != null && provincialAuthorizationService.canAccessExemption(authentication, detail);
      long authorizationDurationMillis = elapsedMillis(authorizationStartedAtNanos);
      String outcome = detail == null ? "not_found" : authorized ? "found" : "access_denied";
      ResponseEntity<ExemptionDetailDto> response =
          authorized
              // Permit identifiers use the dedicated row-level-authorized RPC contract.
              ? ResponseEntity.ok(withoutPermitIdentifiers(detail))
              : ResponseEntity.notFound().build();

      LOGGER.info(
          "event=lexis_exemption_detail operation=get outcome={} exemptionNumber={} lookupDurationMs={} authorizationDurationMs={} durationMs={}",
          outcome,
          exemptionNumber,
          lookupDurationMillis,
          authorizationDurationMillis,
          elapsedMillis(startedAtNanos));
      return response;
    } catch (RuntimeException exception) {
      LOGGER.warn(
          "event=lexis_exemption_detail operation=get outcome=failed exemptionNumber={} durationMs={} failureType={}",
          exemptionNumber,
          elapsedMillis(startedAtNanos),
          exceptionType(exception));
      throw exception;
    }
  }

  private static long elapsedMillis(long startedAtNanos) {
    return Math.max(0L, (System.nanoTime() - startedAtNanos) / 1_000_000L);
  }

  private ExemptionDetailDto withoutPermitIdentifiers(ExemptionDetailDto detail) {
    return new ExemptionDetailDto(
        detail.exemptionNumber(),
        detail.exemptionTypeCode(),
        detail.exemptionTypeDescription(),
        detail.exemptionStatusCode(),
        detail.exemptionStatusDescription(),
        detail.ownerClientNumber(),
        detail.agentClientNumber(),
        detail.applicationNumber(),
        detail.applicationStatus(),
        detail.approvalDate(),
        detail.expiryDate(),
        detail.approvedVolume(),
        detail.usedVolume(),
        detail.remainingVolume(),
        detail.otherConditions(),
        detail.blanketOic(),
        List.of(),
        detail.remarks(),
        detail.author());
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
      boolean includeBlanketOic,
      boolean excludeBlanketOic,
      String sortField,
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
        parseSearchDate(approvalFromDate),
        parseSearchDate(approvalToDate),
        parseSearchDate(firstPresent(listingFromDate, listFromDate)),
        parseSearchDate(firstPresent(listingToDate, listToDate)),
        regionNumbers == null ? List.of() : regionNumbers,
        includeBlanketOic,
        excludeBlanketOic,
        sortField,
        page,
        size);
  }

  private ExemptionSearchResponseDto withSearchLocks(ExemptionSearchResponseDto response) {
    if (response.results() == null || response.results().isEmpty()) {
      return response;
    }

    List<ExemptionSearchResultDto> results =
        response.results().stream().map(this::withSearchLock).toList();
    return new ExemptionSearchResponseDto(
        results, response.total(), response.page(), response.size());
  }

  private ExemptionSearchResultDto withSearchLock(ExemptionSearchResultDto row) {
    // Legacy approval search treated an exemption as locked even when held by the current session.
    ApplicationEditLockDto lock =
        editLockService.snapshotExemption(row.exemptionNumber(), null, false);
    boolean locked = lock == null || lock.locked();
    if (row.locked() == locked) {
      return row;
    }
    return new ExemptionSearchResultDto(
        row.exemptionNumber(),
        row.exemptionType(),
        row.status(),
        row.applicantClientNumber(),
        row.ownerClientNumber(),
        row.applicationNumber(),
        row.approvalDate(),
        row.listingDate(),
        row.expiryDate(),
        row.region(),
        row.approvedVolume(),
        row.balanceRemaining(),
        locked);
  }
}

package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.firstPresent;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.currentForestClientNumber;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.matchesScopedClient;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
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
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";

  private final ObjectProvider<PurchaseOfferService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final LexisApplicationService applicationService;
  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ProvincialAuthorizationService provincialAuthorizationService;
  private final ApplicationEditLockService editLockService;
  private LexisPrincipalService principalService;

  public PurchaseOfferController(
      ObjectProvider<PurchaseOfferService> serviceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      LexisApplicationService applicationService,
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ProvincialAuthorizationService provincialAuthorizationService,
      ApplicationEditLockService editLockService) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.applicationService = applicationService;
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.provincialAuthorizationService = provincialAuthorizationService;
    this.editLockService = editLockService;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
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
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.OFFER_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new PurchaseOfferSearchResponseDto(List.of(), 0, page, size));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

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
    OrgUnitConstraint orgUnits =
        provincialAuthorizationService.constrainOrgUnits(
            authentication, regionNumbers, OrgUnitSurface.OFFER_SEARCH);
    if (orgUnits.denied()) {
      return ResponseEntity.ok(new SearchCountResponseDto(0));
    }
    regionNumbers = orgUnits.orgUnitNumbers();

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
            scopedClientNumber,
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
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    return service.findByOfferNumber(offerNumber)
        .flatMap(
            detail ->
                authorizeAndEnrichOfferDetail(
                    authentication, scopedClientNumber, roles, detail))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  private Optional<PurchaseOfferDetailDto> authorizeAndEnrichOfferDetail(
      Authentication authentication,
      String scopedClientNumber,
      List<String> roles,
      PurchaseOfferDetailDto detail) {
    if (detail == null) {
      return Optional.empty();
    }

    Optional<LexisApplicationDetailDto> application = findOfferApplication(detail);
    if (!canAccessOfferDetail(scopedClientNumber, detail, application)
        || !provincialAuthorizationService.canAccessOffer(authentication, detail)) {
      return Optional.empty();
    }
    boolean canEditScheduleDates = canEditScheduleDates(roles);
    boolean canEditOfferRemarks = canEditOfferRemarks(roles);
    boolean canEditOfferDetails = canEditOfferDetails(scopedClientNumber, roles, detail);
    boolean canEditWithdrawFields = canEditWithdrawFields(scopedClientNumber, roles, detail);
    PurchaseOfferDetailDto enriched =
        detail
            .withApplicationContext(
                resolveApplicationPackageVolume(detail, application),
                resolveApplicationSpeciesGradeCode(detail.applicationNumber()))
            .withEditPermissions(
                canEditScheduleDates,
                canEditOfferRemarks,
                canEditOfferDetails,
                canEditWithdrawFields);
    boolean canEdit =
        canEditScheduleDates
            || canEditOfferRemarks
            || canEditOfferDetails
            || canEditWithdrawFields;
    String userId = auditUser(authentication);
    ApplicationEditLockDto editLock =
        canEdit
            ? editLockService.acquireOffer(
                detail.offerNumber(), userId, userId, isApplicationApprover(roles))
            : editLockService.snapshotOffer(
                detail.offerNumber(), userId, isApplicationApprover(roles));
    return Optional.of(
        enriched.withEditLock(editLock.locked(), editLock.lockedBy(), editLock.message()));
  }

  private Optional<LexisApplicationDetailDto> findOfferApplication(PurchaseOfferDetailDto detail) {
    Long applicationNumber = detail.applicationNumber();
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return applicationService.findByApplicationNumber(applicationNumber);
  }

  private boolean canAccessOfferDetail(
      String scopedClientNumber,
      PurchaseOfferDetailDto detail,
      Optional<LexisApplicationDetailDto> application) {
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
    return application
        .map(
            parentApplication ->
                matchesScopedApplicationClient(scopedClientNumber, parentApplication))
        .orElse(false);
  }

  private Double resolveApplicationPackageVolume(
      PurchaseOfferDetailDto detail, Optional<LexisApplicationDetailDto> application) {
    if (application.isEmpty()) {
      return null;
    }

    LexisApplicationDetailDto parentApplication = application.get();
    String packageNumber = detail.packageNumber();
    if (packageNumber == null || packageNumber.isBlank()) {
      return parentApplication.applicationVolume();
    }

    List<LexisApplicationDetailDto.LexisPackageDto> packages = parentApplication.packages();
    if (packages == null) {
      return null;
    }
    return packages.stream()
        .filter(pack -> packageNumber.equalsIgnoreCase(pack.packageNumber()))
        .findFirst()
        .map(LexisApplicationDetailDto.LexisPackageDto::volume)
        .orElse(null);
  }

  private String resolveApplicationSpeciesGradeCode(Long applicationNumber) {
    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    if (applicationDetailsService == null || applicationNumber == null || applicationNumber < 1) {
      return null;
    }
    return ApplicationDetailsRpcService.toSpeciesEndUseSort(
        applicationDetailsService.getSpeciesForApplication(applicationNumber));
  }

  private boolean matchesScopedApplicationClient(
      String scopedClientNumber, LexisApplicationDetailDto application) {
    return matchesScopedClient(
        scopedClientNumber, application.ownerClientNumber(), application.agentClientNumber());
  }

  private boolean canEditScheduleDates(List<String> roles) {
    return isApplicationApprover(roles);
  }

  private boolean canEditOfferRemarks(List<String> roles) {
    return isApplicationApprover(roles);
  }

  private boolean canEditOfferDetails(
      String scopedClientNumber, List<String> roles, PurchaseOfferDetailDto detail) {
    return isApplicationApprover(roles) || isOfferingClient(scopedClientNumber, detail);
  }

  private boolean canEditWithdrawFields(
      String scopedClientNumber, List<String> roles, PurchaseOfferDetailDto detail) {
    return isApplicationApprover(roles)
        || (isOfferingClient(scopedClientNumber, detail)
            && detail.offerWithdrawalDate() == null
            && canWithdrawByDate(detail.offerEndDate()));
  }

  private boolean isApplicationApprover(List<String> roles) {
    return roles != null
        && (roles.contains(ROLE_ADMIN) || roles.contains(ROLE_APPLICATION_APPROVER));
  }

  private boolean isOfferingClient(String scopedClientNumber, PurchaseOfferDetailDto detail) {
    return scopedClientNumber != null
        && !scopedClientNumber.isBlank()
        && detail != null
        && matchesScopedClient(scopedClientNumber, detail.offeringClientNumber());
  }

  private boolean canWithdrawByDate(LocalDate offerEndDate) {
    return offerEndDate != null && !offerEndDate.isBefore(LexisBusinessTime.today());
  }

  private String auditUser(Authentication authentication) {
    if (principalService != null) {
      return principalService.resolvePrincipalName(authentication);
    }
    return authentication == null ? null : authentication.getName();
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
      String accessClientNumber,
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
        null,
        accessClientNumber,
        false,
        false,
        regionNumbers == null ? List.of() : regionNumbers,
        sortField,
        page,
        size);
  }
}

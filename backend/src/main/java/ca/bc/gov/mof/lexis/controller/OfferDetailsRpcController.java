package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.firstPresent;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.fromRequest;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDate;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.currentForestClientNumber;
import static ca.bc.gov.mof.lexis.controller.ScopedClientRequestSupport.matchesScopedClient;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/rpc/offer-details")
@Validated
public class OfferDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(OfferDetailsRpcController.class);
  private static final String LEGACY_ACTION_CREATE_OFFER = "createOffer";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String FAIR_OFFER_DEFAULT = "N";
  private static final String VALID_OFFER_DEFAULT = "Y";
  private static final String APPROVAL_DEFAULT = "N";
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ObjectProvider<LexisApplicationService> applicationServiceProvider;
  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ObjectProvider<FederalApplicationService> federalApplicationServiceProvider;
  private final ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  private final ObjectProvider<PurchaseOfferService> purchaseOfferServiceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final ApplicationPermitOperationCoordinator operationCoordinator;
  private final ApplicationEditLockService editLockService;
  private ProvincialAuthorizationService provincialAuthorizationService;
  private LexisPrincipalService principalService;

  public OfferDetailsRpcController(
      ObjectProvider<LexisApplicationService> applicationServiceProvider,
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ObjectProvider<FederalApplicationService> federalApplicationServiceProvider,
      ObjectProvider<ClientLookupService> clientLookupServiceProvider,
      ObjectProvider<PurchaseOfferService> purchaseOfferServiceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      ApplicationPermitOperationCoordinator operationCoordinator,
      ApplicationEditLockService editLockService) {
    this.applicationServiceProvider = applicationServiceProvider;
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.federalApplicationServiceProvider = federalApplicationServiceProvider;
    this.clientLookupServiceProvider = clientLookupServiceProvider;
    this.purchaseOfferServiceProvider = purchaseOfferServiceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.operationCoordinator = operationCoordinator;
    this.editLockService = editLockService;
  }

  @Autowired
  void setProvincialAuthorizationService(
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
  }

  @GetMapping("/validate-application-number")
  public ResponseEntity<OfferValidationResponseDto> validateApplicationNumber(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    if (applicationService == null) {
      LOGGER.warn("Application service unavailable - returning validation failure");
      return ResponseEntity.ok(
          new OfferValidationResponseDto(false, List.of("Application service is unavailable.")));
    }

    String normalized = trimToNull(applicationNumber);
    List<String> errors = new ArrayList<>();
    Long parsed = parseApplicationNumber(normalized);
    if (parsed == null) {
      errors.add("Application " + fallbackApplicationNumber(applicationNumber) + " does not exist");
      return ResponseEntity.ok(new OfferValidationResponseDto(false, errors));
    }

    Optional<LexisApplicationDetailDto> detail = applicationService.findByApplicationNumber(parsed);
    requireOfferApplicationAccess(parsed, detail, currentAuthentication(), false);
    errors.addAll(validateOfferApplication(parsed, detail));

    return ResponseEntity.ok(new OfferValidationResponseDto(errors.isEmpty(), errors));
  }

  @GetMapping("/application-details")
  public ResponseEntity<OfferApplicationDetailsResponseDto> getApplicationDetails(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    if (applicationService == null) {
      LOGGER.warn("Application service unavailable - returning unsuccessful application detail");
      return ResponseEntity.ok(new OfferApplicationDetailsResponseDto(false, "", "", "", ""));
    }

    Long parsed = parseApplicationNumber(trimToNull(applicationNumber));
    if (parsed == null) {
      return ResponseEntity.ok(new OfferApplicationDetailsResponseDto(false, "", "", "", ""));
    }
    Optional<LexisApplicationDetailDto> detail = applicationService.findByApplicationNumber(parsed);
    requireOfferApplicationAccess(parsed, detail, currentAuthentication(), true);
    if (detail.isEmpty()) {
      return ResponseEntity.ok(new OfferApplicationDetailsResponseDto(false, "", "", "", ""));
    }

    return ResponseEntity.ok(
        new OfferApplicationDetailsResponseDto(
            true,
            resolveApplicationSpeciesGradeCode(parsed),
            formatLegacyDate(detail.get().listingDate()),
            formatIsoDate(detail.get().teacMeetingDate()),
            applicationRegion(detail.get())));
  }

  @GetMapping("/package-list")
  public ResponseEntity<OfferPackageListResponseDto> getPackageList(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    if (applicationService == null) {
      LOGGER.warn("Application service unavailable - returning empty package list");
      return ResponseEntity.ok(new OfferPackageListResponseDto(List.of("No Packages")));
    }

    Long parsed = parseApplicationNumber(trimToNull(applicationNumber));
    if (parsed == null) {
      return ResponseEntity.ok(new OfferPackageListResponseDto(List.of("No Packages")));
    }
    Optional<LexisApplicationDetailDto> detail = applicationService.findByApplicationNumber(parsed);
    requireOfferApplicationAccess(parsed, detail, currentAuthentication(), true);
    if (detail.isEmpty() || detail.get().packages() == null || detail.get().packages().isEmpty()) {
      return ResponseEntity.ok(new OfferPackageListResponseDto(List.of("No Packages")));
    }

    TreeSet<String> packageNumbers = new TreeSet<>();
    for (LexisApplicationDetailDto.LexisPackageDto pkg : detail.get().packages()) {
      String packageNumber = trimToNull(pkg.packageNumber());
      if (packageNumber != null) {
        packageNumbers.add(packageNumber);
      }
    }

    if (packageNumbers.isEmpty()) {
      return ResponseEntity.ok(new OfferPackageListResponseDto(List.of("No Packages")));
    }

    return ResponseEntity.ok(new OfferPackageListResponseDto(List.copyOf(packageNumbers)));
  }

  @GetMapping("/package-volume")
  public ResponseEntity<OfferVolumeResponseDto> getPackageVolume(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      Authentication authentication) {
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    if (applicationService == null) {
      LOGGER.warn("Application service unavailable - returning zero package volume");
      return ResponseEntity.ok(new OfferVolumeResponseDto("0.0"));
    }

    String normalized = trimToNull(packageNumber);
    if (normalized == null) {
      return ResponseEntity.ok(new OfferVolumeResponseDto("0.0"));
    }
    requirePackageAccess(normalized, authentication);

    Optional<LexisPackageLookupDto> pkg = applicationService.findPackageByPackageNumber(normalized);
    return ResponseEntity.ok(
        new OfferVolumeResponseDto(
            pkg.map(LexisPackageLookupDto::packageVolume).map(this::formatVolume).orElse("0.0")));
  }

  @GetMapping("/application-volume")
  public ResponseEntity<OfferVolumeResponseDto> getApplicationVolume(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    if (applicationService == null) {
      LOGGER.warn("Application service unavailable - returning zero application volume");
      return ResponseEntity.ok(new OfferVolumeResponseDto("0.0"));
    }

    Long parsed = parseApplicationNumber(trimToNull(applicationNumber));
    if (parsed == null) {
      return ResponseEntity.ok(new OfferVolumeResponseDto("0.0"));
    }
    Optional<LexisApplicationDetailDto> detail = applicationService.findByApplicationNumber(parsed);
    requireOfferApplicationAccess(parsed, detail, currentAuthentication(), true);
    if (detail.isEmpty()) {
      return ResponseEntity.ok(new OfferVolumeResponseDto("0.0"));
    }

    return ResponseEntity.ok(new OfferVolumeResponseDto(formatVolume(detail.get().applicationVolume())));
  }

  @GetMapping("/client-data")
  public ResponseEntity<OfferClientDataResponseDto> getClientData(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for client data");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    return clientLookupService
        .getClientData(clientNumber, clientLocationCode)
        .map(
            data ->
                ResponseEntity.ok(
                    new OfferClientDataResponseDto(
                        data.clientNumber(),
                        data.companyName(),
                        data.address(),
                        data.city(),
                        data.province(),
                        data.postalCode(),
                        data.country(),
                        data.phone(),
                        data.fax(),
                        data.email(),
                        null)))
        .orElseGet(
            () ->
                ResponseEntity.ok(
                    new OfferClientDataResponseDto(
                        null, null, null, null, null, null, null, null, null, null, "true")));
  }

  @GetMapping("/client-locations")
  public ResponseEntity<List<OfferClientLocationResponseDto>> getClientLocations(
      @RequestParam(name = "clientNumber", required = false) String clientNumber) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for client locations");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    List<OfferClientLocationResponseDto> response =
        clientLookupService.getClientLocations(clientNumber).stream()
            .map(
                location ->
                    new OfferClientLocationResponseDto(
                        location.locationName(), location.locationCode(), location.selected()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping("/offer")
  public ResponseEntity<OfferPersistenceResponseDto> addOffer(
      HttpServletRequest request,
      Authentication authentication) {
    return addOffer(fromRequest(request), authentication);
  }

  private ResponseEntity<OfferPersistenceResponseDto> addOffer(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!authorizationService.canPerformAction(roles, LEGACY_ACTION_CREATE_OFFER)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PurchaseOfferService service = purchaseOfferServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for add offer");
      return ResponseEntity.noContent().build();
    }

    String userId = userId(authentication);
    PurchaseOfferService.CreateOfferRequest request = toCreateOfferRequest(parameters);
    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null
        && request.offerWithdrawalDate() != null
        && !LexisBusinessTime.today().equals(request.offerWithdrawalDate())) {
      return invalidPersistence(
          request.applicationNumber(), null, false, "Offer withdrawn date must be the current date.");
    }
    if (request.applicationNumber() == null || request.applicationNumber() < 1) {
      return invalidPersistence(
          request.applicationNumber(), null, false, "A valid application number is required.");
    }

    return operationCoordinator.executeApplicationLocalMutation(
        request.applicationNumber(),
        () ->
            addOfferWhileSerialized(
                service,
                request,
                roles,
                scopedClientNumber,
                userId,
                authentication));
  }

  private ResponseEntity<OfferPersistenceResponseDto> addOfferWhileSerialized(
      PurchaseOfferService service,
      PurchaseOfferService.CreateOfferRequest originalRequest,
      List<String> roles,
      String scopedClientNumber,
      String userId,
      Authentication authentication) {
    Optional<LexisApplicationDetailDto> application =
        findApplication(originalRequest.applicationNumber());
    requireOfferApplicationAccess(
        originalRequest.applicationNumber(), application, authentication, true);
    List<String> applicationErrors =
        validateOfferApplication(originalRequest.applicationNumber(), application);
    if (!applicationErrors.isEmpty()) {
      return invalidPersistence(
          originalRequest.applicationNumber(), null, false, applicationErrors);
    }
    PurchaseOfferService.CreateOfferRequest request = originalRequest;
    if (scopedClientNumber != null) {
      ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
      if (clientLookupService == null) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
      }
      Optional<ClientLookupService.ClientData> bidder =
          clientLookupService.getClientDataRequired(scopedClientNumber, "00");
      if (bidder.isEmpty() || trimToNull(bidder.get().companyName()) == null) {
        return invalidPersistence(
            request.applicationNumber(),
            null,
            false,
            "The authenticated offering client could not be resolved.");
      }
      request =
          withOfferingClientIdentity(
              request, scopedClientNumber, bidder.get().companyName());
    }
    if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            authentication, request.offeringClientNumber(), null)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    if (!isOfferApprover(roles)) {
      request = withLegacyNonApproverCreateDefaults(request);
    }
    PurchaseOfferService.CreateOfferResult result =
        service.addOffer(request, userId);
    return ResponseEntity.ok(toPersistenceResponse(result));
  }

  @PostMapping("/offer/update")
  public ResponseEntity<OfferPersistenceResponseDto> updateOffer(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    PurchaseOfferService service = purchaseOfferServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for update offer");
      return ResponseEntity.noContent().build();
    }

    Long offerNumber =
        parsePositiveLong(first(parameters, "exportPurchaseOfferNumber", "offerNumber"));
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    boolean canCreateOffer =
        authorizationService.canPerformAction(roles, LEGACY_ACTION_CREATE_OFFER);
    boolean offerApprover = isOfferApprover(roles);
    Optional<PurchaseOfferDetailDto> currentOffer =
        service.findByOfferNumber(offerNumber);
    if (currentOffer.isEmpty()) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    Long applicationNumber = currentOffer.get().applicationNumber();
    return operationCoordinator.executeApplicationOfferMutation(
        applicationNumber,
        offerNumber,
        () ->
            updateOfferWhileSerialized(
                service,
                parameters,
                offerNumber,
                canCreateOffer,
                offerApprover,
                applicationNumber,
                authentication));
  }

  private ResponseEntity<OfferPersistenceResponseDto> updateOfferWhileSerialized(
      PurchaseOfferService service,
      MultiValueMap<String, String> parameters,
      Long offerNumber,
      boolean canCreateOffer,
      boolean offerApprover,
      Long expectedApplicationNumber,
      Authentication authentication) {
    Optional<PurchaseOfferDetailDto> currentOffer =
        service.findByOfferNumber(offerNumber);
    if (currentOffer.isEmpty()
        || !expectedApplicationNumber.equals(currentOffer.get().applicationNumber())) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    PurchaseOfferService.UpdateOfferRequest request =
        toUpdateOfferRequest(parameters, currentOffer.get());
    boolean scopedOfferingClient =
        isScopedOfferingClient(authentication, currentOffer.get());
    if (scopedOfferingClient
        && withdrawalDateChanged(request, currentOffer.get())
        && !LexisBusinessTime.today().equals(request.offerWithdrawalDate())) {
      return invalidUpdate(
          currentOffer.get(), "Offer withdrawn date must be the current date.");
    }

    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    if (scopedClientNumber != null) {
      if (!canPerform(authentication, "/offerDetails") || !scopedOfferingClient) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
      }
      request = restrictOfferingClientUpdate(request, currentOffer.get());
    } else if (canCreateOffer) {
      requireApplicationAccess(currentOffer.get().applicationNumber(), authentication);
      if (!offerApprover) {
        request = preserveLegacyApproverFields(request, currentOffer.get());
      }
    } else {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    String userId = userId(authentication);
    PurchaseOfferService.CreateOfferResult result =
        service.updateOfferSnapshot(request, userId);
    return ResponseEntity.ok(toPersistenceResponse(result));
  }

  @PostMapping("/release-lock")
  public ResponseEntity<ReleaseLockResponseDto> releaseLock(
      @RequestParam(name = "offerNumber", required = false) Long offerNumber,
      Authentication authentication) {
    if (offerNumber == null
        || offerNumber < 1
        || provincialAuthorizationService == null
        || !provincialAuthorizationService.canAccessOffer(authentication, offerNumber)) {
      throw new AccessDeniedException("The purchase offer is outside the authenticated scope.");
    }
    editLockService.releaseOffer(offerNumber, userId(authentication));
    return ResponseEntity.ok(new ReleaseLockResponseDto("ok"));
  }

  public ResponseEntity<OfferPersistenceResponseDto> addOfferLegacy(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return addOffer(parameters, authentication);
  }

  public ResponseEntity<OfferPersistenceResponseDto> updateOfferLegacy(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return updateOffer(parameters, authentication);
  }

  private boolean isFederalApplication(Long applicationNumber) {
    FederalApplicationService federalService = federalApplicationServiceProvider.getIfAvailable();
    if (federalService == null) {
      return false;
    }
    return federalService.findByApplicationNumber(applicationNumber).isPresent();
  }

  private boolean canPerform(Authentication authentication, String action) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), action);
  }

  private String userId(Authentication authentication) {
    if (principalService != null) {
      return principalService.resolvePrincipalName(authentication);
    }
    return authentication == null ? null : authentication.getName();
  }

  private Authentication currentAuthentication() {
    return SecurityContextHolder.getContext().getAuthentication();
  }

  private void requireApplicationAccess(
      Long applicationNumber, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireApplication(authentication, applicationNumber);
    }
  }

  private Optional<LexisApplicationDetailDto> findApplication(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    return applicationService == null
        ? Optional.empty()
        : applicationService.findByApplicationNumber(applicationNumber);
  }

  private void requireOfferApplicationAccess(
      Long applicationNumber,
      Optional<LexisApplicationDetailDto> application,
      Authentication authentication,
      boolean requireAcceptingOffers) {
    if (!isScopedOfferCreator(authentication)) {
      requireApplicationAccess(applicationNumber, authentication);
      return;
    }
    if (requireAcceptingOffers
        && !validateOfferApplication(applicationNumber, application).isEmpty()) {
      throw new AccessDeniedException(
          "The application is not currently available to accept offers.");
    }
  }

  private boolean isScopedOfferCreator(Authentication authentication) {
    return currentForestClientNumber(sessionService, authentication) != null
        && canPerform(authentication, LEGACY_ACTION_CREATE_OFFER);
  }

  private List<String> validateOfferApplication(
      Long applicationNumber, Optional<LexisApplicationDetailDto> application) {
    if (applicationNumber == null || applicationNumber < 1 || application.isEmpty()) {
      return List.of(
          "Application " + (applicationNumber == null ? "" : applicationNumber) + " does not exist");
    }

    LexisApplicationDetailDto detail = application.get();
    if (!"P".equalsIgnoreCase(trimToNull(detail.jurisdictionCode()))
        || isFederalApplication(applicationNumber)) {
      return List.of(
          "Application "
              + applicationNumber
              + " does not have a valid jurisdiction to accept offers");
    }

    String statusCode = trimToNull(detail.applicationStatusCode());
    if (!"APP".equalsIgnoreCase(statusCode)
        && !"NEW".equalsIgnoreCase(statusCode)
        && !"PND".equalsIgnoreCase(statusCode)) {
      return List.of(
          "Application " + applicationNumber + " does not have a valid status to accept offers");
    }

    if (detail.canCreateOffers()) {
      return List.of();
    }
    LocalDate listingDate = detail.listingDate();
    if (listingDate != null && listingDate.isAfter(LexisBusinessTime.today())) {
      return List.of(
          "Application "
              + applicationNumber
              + " can not accept offers until "
              + listingDate.format(LEGACY_DATE_FORMATTER));
    }
    if (listingDate != null) {
      return List.of("Application " + applicationNumber + " is no longer accepting offers");
    }
    return List.of("Application " + applicationNumber + " does not have a valid listing date");
  }

  private void requirePackageAccess(String packageNumber, Authentication authentication) {
    ApplicationDetailsRpcService service = applicationDetailsServiceProvider.getIfAvailable();
    Long applicationNumber =
        service == null
            ? null
            : service.findApplicationNumberForPackage(packageNumber).orElse(null);
    if (applicationNumber == null) {
      throw new AccessDeniedException("Package parent application is unavailable.");
    }
    requireOfferApplicationAccess(
        applicationNumber, findApplication(applicationNumber), authentication, true);
  }

  private void requireClientAccess(String clientNumber) {
    if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            currentAuthentication(), clientNumber, null)) {
      throw new AccessDeniedException("Client is outside the authenticated client scope.");
    }
  }

  private boolean isOfferApprover(List<String> roles) {
    return roles != null
        && (roles.contains(ROLE_ADMIN) || roles.contains(ROLE_APPLICATION_APPROVER));
  }

  private boolean isScopedOfferingClient(
      Authentication authentication, PurchaseOfferDetailDto currentOffer) {
    return isScopedOfferingClient(authentication, currentOffer.offeringClientNumber());
  }

  private boolean isScopedOfferingClient(
      Authentication authentication, String offeringClientNumber) {
    String scopedClientNumber = currentForestClientNumber(sessionService, authentication);
    return scopedClientNumber != null
        && matchesScopedClient(scopedClientNumber, offeringClientNumber);
  }

  private boolean withdrawalDateChanged(
      PurchaseOfferService.UpdateOfferRequest requested, PurchaseOfferDetailDto currentOffer) {
    return requested.offerWithdrawalDate() != null
        && !requested.offerWithdrawalDate().equals(currentOffer.offerWithdrawalDate());
  }

  private ResponseEntity<OfferPersistenceResponseDto> invalidUpdate(
      PurchaseOfferDetailDto currentOffer, String error) {
    return invalidPersistence(
        currentOffer.applicationNumber(), currentOffer.offerNumber(), true, error);
  }

  private ResponseEntity<OfferPersistenceResponseDto> invalidPersistence(
      Long applicationNumber, Long offerNumber, boolean update, String error) {
    return invalidPersistence(
        applicationNumber, offerNumber, update, List.of(error));
  }

  private ResponseEntity<OfferPersistenceResponseDto> invalidPersistence(
      Long applicationNumber, Long offerNumber, boolean update, List<String> errors) {
    return ResponseEntity.ok(
        new OfferPersistenceResponseDto(
            false,
            null,
            applicationNumber,
            offerNumber,
            false,
            null,
            false,
            update,
            List.copyOf(errors),
            List.of()));
  }

  private PurchaseOfferService.CreateOfferRequest withOfferingClientIdentity(
      PurchaseOfferService.CreateOfferRequest request,
      String offeringClientNumber,
      String companyName) {
    return new PurchaseOfferService.CreateOfferRequest(
        request.applicationNumber(),
        request.exportPurchaseOfferNumber(),
        request.packageNumber(),
        companyName,
        request.contactName(),
        request.purchaseOfferAmount(),
        request.purchaseOfferDate(),
        request.offerWithdrawalDate(),
        request.teacReviewDate(),
        request.fairOfferIndicator(),
        request.validOfferIndicator(),
        request.offerRemark(),
        request.approvalIndicator(),
        request.withdrawReason(),
        request.exportJurisdictionCode(),
        request.manufacturingFacilityInfo(),
        offeringClientNumber,
        request.pickupLocation(),
        request.offerCondition(),
        request.offerVolume());
  }

  private PurchaseOfferService.UpdateOfferRequest restrictOfferingClientUpdate(
      PurchaseOfferService.UpdateOfferRequest requested, PurchaseOfferDetailDto currentOffer) {
    boolean canWithdraw =
        currentOffer.offerWithdrawalDate() == null
            && currentOffer.offerEndDate() != null
            && !currentOffer.offerEndDate().isBefore(LexisBusinessTime.today());
    return new PurchaseOfferService.UpdateOfferRequest(
        currentOffer.applicationNumber(),
        currentOffer.offerNumber(),
        currentOffer.packageNumber(),
        currentOffer.companyName(),
        currentOffer.contactName(),
        requested.purchaseOfferAmount(),
        currentOffer.purchaseOfferDate(),
        canWithdraw ? requested.offerWithdrawalDate() : currentOffer.offerWithdrawalDate(),
        currentOffer.teacReviewDate(),
        currentOffer.fairOfferIndicator(),
        currentOffer.validOfferIndicator(),
        currentOffer.offerRemark(),
        currentOffer.approvalIndicator(),
        canWithdraw ? requested.withdrawReason() : currentOffer.withdrawReason(),
        currentOffer.exportJurisdictionCode(),
        currentOffer.manufacturingFacilityInfo(),
        currentOffer.offeringClientNumber(),
        requested.pickupLocation(),
        requested.offerCondition(),
        requested.offerVolume());
  }

  private PurchaseOfferService.UpdateOfferRequest preserveLegacyApproverFields(
      PurchaseOfferService.UpdateOfferRequest requested, PurchaseOfferDetailDto currentOffer) {
    return new PurchaseOfferService.UpdateOfferRequest(
        requested.applicationNumber(),
        requested.exportPurchaseOfferNumber(),
        requested.packageNumber(),
        requested.companyName(),
        requested.contactName(),
        requested.purchaseOfferAmount(),
        requested.purchaseOfferDate(),
        requested.offerWithdrawalDate(),
        requested.teacReviewDate(),
        currentOffer.fairOfferIndicator(),
        currentOffer.validOfferIndicator(),
        currentOffer.offerRemark(),
        currentOffer.approvalIndicator(),
        requested.withdrawReason(),
        requested.exportJurisdictionCode(),
        requested.manufacturingFacilityInfo(),
        requested.offeringClientNumber(),
        requested.pickupLocation(),
        requested.offerCondition(),
        requested.offerVolume());
  }

  private Long parseApplicationNumber(String applicationNumber) {
    if (applicationNumber == null) {
      return null;
    }
    try {
      return Long.parseLong(applicationNumber);
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private PurchaseOfferService.UpdateOfferRequest toUpdateOfferRequest(
      MultiValueMap<String, String> parameters, PurchaseOfferDetailDto current) {
    return new PurchaseOfferService.UpdateOfferRequest(
        hasAnyParameter(parameters, "applicationNumber")
            ? parsePositiveLong(firstPresent(parameters, "applicationNumber"))
            : current.applicationNumber(),
        current.offerNumber(),
        hasAnyParameter(parameters, "packageNumber")
            ? firstPresent(parameters, "packageNumber")
            : current.packageNumber(),
        hasAnyParameter(parameters, "companyName")
            ? firstPresent(parameters, "companyName")
            : current.companyName(),
        hasAnyParameter(parameters, "contactName")
            ? firstPresent(parameters, "contactName")
            : current.contactName(),
        hasAnyParameter(parameters, "purchaseOfferAmount")
            ? parseOfferDecimal(firstPresent(parameters, "purchaseOfferAmount"))
            : Double.valueOf(current.purchaseOfferAmount()),
        hasAnyParameter(parameters, "purchaseOfferDate")
            ? parseDate(firstPresent(parameters, "purchaseOfferDate"))
            : current.purchaseOfferDate(),
        hasAnyParameter(parameters, "offerWithdrawalDate", "offerEndDate")
            ? parseDate(firstPresent(parameters, "offerWithdrawalDate", "offerEndDate"))
            : current.offerWithdrawalDate(),
        hasAnyParameter(parameters, "teacReviewDate")
            ? parseDate(firstPresent(parameters, "teacReviewDate"))
            : current.teacReviewDate(),
        hasAnyParameter(parameters, "fairOfferIndicator")
            ? firstPresent(parameters, "fairOfferIndicator")
            : current.fairOfferIndicator(),
        hasAnyParameter(parameters, "validOfferIndicator")
            ? firstPresent(parameters, "validOfferIndicator")
            : current.validOfferIndicator(),
        hasAnyParameter(parameters, "offerRemark")
            ? firstPresent(parameters, "offerRemark")
            : current.offerRemark(),
        hasAnyParameter(parameters, "approvalIndicator")
            ? firstPresent(parameters, "approvalIndicator")
            : current.approvalIndicator(),
        hasAnyParameter(parameters, "withdrawReason")
            ? firstPresent(parameters, "withdrawReason")
            : current.withdrawReason(),
        hasAnyParameter(parameters, "exportJurisdictionCode", "jurisdictionCode")
            ? firstPresent(parameters, "exportJurisdictionCode", "jurisdictionCode")
            : current.exportJurisdictionCode(),
        current.manufacturingFacilityInfo(),
        hasAnyParameter(parameters, "offeringClientNumber", "clientNumber")
            ? firstPresent(parameters, "offeringClientNumber", "clientNumber")
            : current.offeringClientNumber(),
        hasAnyParameter(parameters, "pickupLocation")
            ? firstPresent(parameters, "pickupLocation")
            : current.pickupLocation(),
        hasAnyParameter(parameters, "offerCondition")
            ? firstPresent(parameters, "offerCondition")
            : current.offerCondition(),
        hasAnyParameter(parameters, "offerVolume")
            ? parseOfferDecimal(firstPresent(parameters, "offerVolume"))
            : current.offerVolume());
  }

  private boolean hasAnyParameter(
      MultiValueMap<String, String> parameters, String... names) {
    for (String name : names) {
      if (parameters.containsKey(name)) {
        return true;
      }
    }
    return false;
  }

  private PurchaseOfferService.CreateOfferRequest toCreateOfferRequest(
      MultiValueMap<String, String> parameters) {
    return new PurchaseOfferService.CreateOfferRequest(
        parsePositiveLong(first(parameters, "applicationNumber")),
        parsePositiveLong(first(parameters, "exportPurchaseOfferNumber", "offerNumber")),
        first(parameters, "packageNumber"),
        first(parameters, "companyName"),
        first(parameters, "contactName"),
        parseOfferDecimal(first(parameters, "purchaseOfferAmount")),
        parseDate(first(parameters, "purchaseOfferDate")),
        parseDate(first(parameters, "offerWithdrawalDate", "offerEndDate")),
        parseDate(first(parameters, "teacReviewDate")),
        first(parameters, "fairOfferIndicator"),
        first(parameters, "validOfferIndicator"),
        first(parameters, "offerRemark"),
        first(parameters, "approvalIndicator"),
        first(parameters, "withdrawReason"),
        first(parameters, "exportJurisdictionCode", "jurisdictionCode"),
        first(parameters, "manufacturingFacilityInfo"),
        first(parameters, "offeringClientNumber", "clientNumber"),
        first(parameters, "pickupLocation"),
        first(parameters, "offerCondition"),
        parseOfferDecimal(first(parameters, "offerVolume")));
  }

  private Double parseOfferDecimal(String rawValue) {
    String normalized = trimToNull(rawValue);
    if (normalized == null) {
      return null;
    }
    try {
      BigDecimal decimal = new BigDecimal(normalized);
      if (decimal.scale() > 2) {
        return Double.NaN;
      }
      double value = decimal.doubleValue();
      return Double.isFinite(value) ? value : Double.NaN;
    } catch (NumberFormatException exception) {
      return Double.NaN;
    }
  }

  private PurchaseOfferService.CreateOfferRequest withLegacyNonApproverCreateDefaults(
      PurchaseOfferService.CreateOfferRequest request) {
    return new PurchaseOfferService.CreateOfferRequest(
        request.applicationNumber(),
        request.exportPurchaseOfferNumber(),
        request.packageNumber(),
        request.companyName(),
        request.contactName(),
        request.purchaseOfferAmount(),
        request.purchaseOfferDate(),
        request.offerWithdrawalDate(),
        request.teacReviewDate(),
        FAIR_OFFER_DEFAULT,
        VALID_OFFER_DEFAULT,
        null,
        APPROVAL_DEFAULT,
        request.withdrawReason(),
        request.exportJurisdictionCode(),
        request.manufacturingFacilityInfo(),
        request.offeringClientNumber(),
        request.pickupLocation(),
        request.offerCondition(),
        request.offerVolume());
  }

  private OfferPersistenceResponseDto toPersistenceResponse(
      PurchaseOfferService.CreateOfferResult result) {
    return new OfferPersistenceResponseDto(
        result.success(),
        result.message(),
        result.applicationNumber(),
        result.exportPurchaseOfferNumber(),
        result.clientHasEmail(),
        result.toEmails(),
        result.sendEmail(),
        result.update(),
        result.errors(),
        result.warnings());
  }

  private String formatLegacyDate(LocalDate value) {
    if (value == null) {
      return "";
    }
    return value.format(LEGACY_DATE_FORMATTER);
  }

  private String formatIsoDate(LocalDate value) {
    return value == null ? "" : value.toString();
  }

  private String formatVolume(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private String resolveApplicationSpeciesGradeCode(Long applicationNumber) {
    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    if (applicationDetailsService == null) {
      LOGGER.warn("Application details RPC service unavailable - returning blank species grade");
      return "";
    }
    return ApplicationDetailsRpcService.toSpeciesEndUseSort(
        applicationDetailsService.getSpeciesForApplication(applicationNumber));
  }

  private String fallbackApplicationNumber(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "" : normalized;
  }

  private String nonNull(String value) {
    return value == null ? "" : value;
  }

  private String applicationRegion(LexisApplicationDetailDto application) {
    String regionName = trimToNull(application.orgUnitName());
    if (regionName != null) {
      return regionName;
    }
    return application.orgUnitNumber() == null ? "" : application.orgUnitNumber().toString();
  }

  public record OfferValidationResponseDto(boolean isValid, List<String> errors) {}

  public record OfferApplicationDetailsResponseDto(
      boolean success,
      String speciesGradeCode,
      String advertisingDate,
      String teacReviewDate,
      String region) {}

  public record OfferPackageListResponseDto(List<String> packageList) {}

  public record OfferVolumeResponseDto(String volume) {}

  public record OfferClientDataResponseDto(
      String clientNumber,
      String companyName,
      String address,
      String city,
      String province,
      String postalCode,
      String country,
      String phone,
      String fax,
      String email,
      String notfound) {}

  public record OfferClientLocationResponseDto(
      String locationName, String locationCode, boolean selected) {}

  public record OfferPersistenceResponseDto(
      boolean success,
      String message,
      Long applicationNumber,
      Long exportPurchaseOfferNumber,
      boolean clientHasEmail,
      String toEmails,
      boolean sendEmail,
      boolean isUpdate,
      List<String> errors,
      List<String> warnings) {}

  public record ReleaseLockResponseDto(String release) {}
}

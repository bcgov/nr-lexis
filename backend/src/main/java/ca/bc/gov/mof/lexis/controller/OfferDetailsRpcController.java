package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.fromRequest;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDate;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDouble;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ObjectProvider<LexisApplicationService> applicationServiceProvider;
  private final ObjectProvider<FederalApplicationService> federalApplicationServiceProvider;
  private final ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  private final ObjectProvider<PurchaseOfferService> purchaseOfferServiceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;

  public OfferDetailsRpcController(
      ObjectProvider<LexisApplicationService> applicationServiceProvider,
      ObjectProvider<FederalApplicationService> federalApplicationServiceProvider,
      ObjectProvider<ClientLookupService> clientLookupServiceProvider,
      ObjectProvider<PurchaseOfferService> purchaseOfferServiceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService) {
    this.applicationServiceProvider = applicationServiceProvider;
    this.federalApplicationServiceProvider = federalApplicationServiceProvider;
    this.clientLookupServiceProvider = clientLookupServiceProvider;
    this.purchaseOfferServiceProvider = purchaseOfferServiceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
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
    if (detail.isEmpty()) {
      errors.add("Application " + parsed + " does not exist");
      return ResponseEntity.ok(new OfferValidationResponseDto(false, errors));
    }

    if (isFederalApplication(parsed)) {
      errors.add("Application " + parsed + " does not have a valid jurisdiction to accept offers");
      return ResponseEntity.ok(new OfferValidationResponseDto(false, errors));
    }

    String statusCode = trimToNull(detail.get().applicationStatusCode());
    if (!"APP".equalsIgnoreCase(statusCode)
        && !"NEW".equalsIgnoreCase(statusCode)
        && !"PND".equalsIgnoreCase(statusCode)) {
      errors.add("Application " + parsed + " does not have a valid status to accept offers");
      return ResponseEntity.ok(new OfferValidationResponseDto(false, errors));
    }

    if (!detail.get().canCreateOffers()) {
      LocalDate listingDate = detail.get().listingDate();
      if (listingDate != null && listingDate.isAfter(LocalDate.now())) {
        errors.add(
            "Application "
                + parsed
                + " can not accept offers until "
                + listingDate.format(LEGACY_DATE_FORMATTER));
      } else if (listingDate != null) {
        errors.add("Application " + parsed + " is no longer accepting offers");
      } else {
        errors.add("Application " + parsed + " does not have a valid listing date");
      }
    }

    return ResponseEntity.ok(new OfferValidationResponseDto(errors.isEmpty(), errors));
  }

  @GetMapping("/application-details")
  public ResponseEntity<OfferApplicationDetailsResponseDto> getApplicationDetails(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    if (applicationService == null) {
      LOGGER.warn("Application service unavailable - returning unsuccessful application detail");
      return ResponseEntity.ok(new OfferApplicationDetailsResponseDto(false, "", "", ""));
    }

    Long parsed = parseApplicationNumber(trimToNull(applicationNumber));
    if (parsed == null) {
      return ResponseEntity.ok(new OfferApplicationDetailsResponseDto(false, "", "", ""));
    }

    Optional<LexisApplicationDetailDto> detail = applicationService.findByApplicationNumber(parsed);
    if (detail.isEmpty()) {
      return ResponseEntity.ok(new OfferApplicationDetailsResponseDto(false, "", "", ""));
    }

    return ResponseEntity.ok(
        new OfferApplicationDetailsResponseDto(
            true,
            nonNull(detail.get().productTypeCode()),
            formatLegacyDate(detail.get().listingDate()),
            ""));
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
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    LexisApplicationService applicationService = applicationServiceProvider.getIfAvailable();
    if (applicationService == null) {
      LOGGER.warn("Application service unavailable - returning zero package volume");
      return ResponseEntity.ok(new OfferVolumeResponseDto("0.0"));
    }

    String normalized = trimToNull(packageNumber);
    if (normalized == null) {
      return ResponseEntity.ok(new OfferVolumeResponseDto("0.0"));
    }

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
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_OFFER)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PurchaseOfferService service = purchaseOfferServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for add offer");
      return ResponseEntity.noContent().build();
    }

    String userId = authentication == null ? null : authentication.getName();
    PurchaseOfferService.CreateOfferResult result =
        service.addOffer(toCreateOfferRequest(parameters), userId);
    return ResponseEntity.ok(toPersistenceResponse(result));
  }

  @PostMapping("/offer/update")
  public ResponseEntity<OfferPersistenceResponseDto> updateOffer(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_OFFER)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PurchaseOfferService service = purchaseOfferServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Purchase offer service unavailable - returning no content for update offer");
      return ResponseEntity.noContent().build();
    }

    String userId = authentication == null ? null : authentication.getName();
    PurchaseOfferService.CreateOfferResult result =
        service.updateOffer(toCreateOfferRequest(parameters), userId);
    return ResponseEntity.ok(toPersistenceResponse(result));
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

  private PurchaseOfferService.CreateOfferRequest toCreateOfferRequest(
      MultiValueMap<String, String> parameters) {
    return new PurchaseOfferService.CreateOfferRequest(
        parsePositiveLong(first(parameters, "applicationNumber")),
        parsePositiveLong(first(parameters, "exportPurchaseOfferNumber", "offerNumber")),
        first(parameters, "packageNumber"),
        first(parameters, "companyName"),
        first(parameters, "contactName"),
        parseDouble(first(parameters, "purchaseOfferAmount")),
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
        parseDouble(first(parameters, "offerVolume")));
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

  private String formatVolume(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private String fallbackApplicationNumber(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "" : normalized;
  }

  private String nonNull(String value) {
    return value == null ? "" : value;
  }

  public record OfferValidationResponseDto(boolean isValid, List<String> errors) {}

  public record OfferApplicationDetailsResponseDto(
      boolean success,
      String speciesGradeCode,
      String advertisingDate,
      String teacReviewDate) {}

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
}

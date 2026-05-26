package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
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
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/rpc/offer-details")
@Validated
public class OfferDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(OfferDetailsRpcController.class);
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ObjectProvider<LexisApplicationService> applicationServiceProvider;
  private final ObjectProvider<FederalApplicationService> federalApplicationServiceProvider;

  public OfferDetailsRpcController(
      ObjectProvider<LexisApplicationService> applicationServiceProvider,
      ObjectProvider<FederalApplicationService> federalApplicationServiceProvider) {
    this.applicationServiceProvider = applicationServiceProvider;
    this.federalApplicationServiceProvider = federalApplicationServiceProvider;
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

  private boolean isFederalApplication(Long applicationNumber) {
    FederalApplicationService federalService = federalApplicationServiceProvider.getIfAvailable();
    if (federalService == null) {
      return false;
    }
    return federalService.findByApplicationNumber(applicationNumber).isPresent();
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

  private String formatLegacyDate(LocalDate value) {
    if (value == null) {
      return "";
    }
    return value.format(LEGACY_DATE_FORMATTER);
  }

  private String formatVolume(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
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
}

package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.sanitizeFileName;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.fromRequest;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/rpc/permit-details")
@Validated
public class PermitDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(PermitDetailsRpcController.class);
  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String LEGACY_ACTION_SAVE_PERMIT = "savePermit";
  private static final String LEGACY_PERMIT_LOCK_SESSION_KEY = "PERMIT_LOCK";

  private final ObjectProvider<PermitDetailsRpcService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final Set<String> configuredIndustryRoles;

  public PermitDetailsRpcController(
      ObjectProvider<PermitDetailsRpcService> serviceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.configuredIndustryRoles = sessionService.getConfiguredIndustryRoles();
  }

  @GetMapping("/permit-summary")
  public ResponseEntity<PermitSummaryRpcResponseDto> getPermitSummary(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "countryCode", required = false) String countryCode,
      @RequestParam(name = "applicationDate", required = false) String applicationDate,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for permit summary");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.getPermitSummary(
            permitNumber,
            countryCode,
            applicationDate,
            packageNumber,
            isMinistryUser(authentication)));
  }

  @GetMapping("/total-fees-for-permit")
  public ResponseEntity<PermitTotalFeesRpcResponseDto> getTotalFeesForPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "countryCode", required = false) String countryCode,
      @RequestParam(name = "applicationDate", required = false) String applicationDate) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for total fees");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getTotalFeesForPermit(permitNumber, countryCode, applicationDate));
  }

  @GetMapping("/scale-fees-for-package")
  public ResponseEntity<PermitScaleFeesRpcResponseDto> getScaleFeesForPackage(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for scale fees");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.getScaleFeesForPackage(packageNumber, permitNumber, isMinistryUser(authentication)));
  }

  @GetMapping("/scales-for-package")
  public ResponseEntity<PermitScalesForPackageRpcResponseDto> getScalesForPackage(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for scales for package");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getScalesForPackage(packageNumber));
  }

  @GetMapping("/permit-data-after-scale-update")
  public ResponseEntity<PermitDataAfterScaleUpdateRpcResponseDto> getPermitDataAfterScaleUpdate(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for permit data after scale update");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getPermitDataAfterScaleUpdate(permitNumber));
  }

  @GetMapping("/package-volume-sum")
  public ResponseEntity<PermitPackageVolumeSumRpcResponseDto> getPackageVolumeSum(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package volume sum");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getPackageVolumeSum(permitNumber, packageNumber));
  }

  @GetMapping("/package-list")
  public ResponseEntity<PermitPackageListRpcResponseDto> getPackageList(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package list");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getPackageList(permitNumber));
  }

  @GetMapping("/oic-package-list")
  public ResponseEntity<PermitPackageListRpcResponseDto> getOicPackageList(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for OIC package list");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getOicPackageList(permitNumber));
  }

  @GetMapping("/package-info")
  public ResponseEntity<PermitPackageInfoRpcResponseDto> getPackageInfo(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package info");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getPackageInfo(packageNumber));
  }

  @GetMapping("/package-details")
  public ResponseEntity<PermitPackageDetailsRpcResponseDto> getPackageDetails(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for package details");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getPackageDetails(packageNumber));
  }

  @GetMapping("/permit-has-applications")
  public ResponseEntity<PermitHasApplicationsRpcResponseDto> getPermitHasApplications(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for permit has applications");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getPermitHasApplications(permitNumber));
  }

  @GetMapping("/country-list")
  public ResponseEntity<PermitCountryListRpcResponseDto> getCountryList() {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for country list");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getCountryList());
  }

  @GetMapping("/check-permit-number")
  public ResponseEntity<PermitNumberAvailabilityRpcResponseDto> checkPermitNumber(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for check permit number");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.checkPermitNumber(permitNumber));
  }

  @GetMapping("/application-list")
  public ResponseEntity<PermitApplicationListRpcResponseDto> getApplicationList(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for application list");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getApplicationList(permitNumber));
  }

  @GetMapping("/available-application-list")
  public ResponseEntity<PermitAvailableApplicationListRpcResponseDto> getAvailableApplicationList(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "selectedApplications", required = false) String selectedApplications) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for available application list");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.getAvailableApplicationList(exemptionNumber, selectedApplications));
  }

  @GetMapping("/available-package-list")
  public ResponseEntity<PermitAvailablePackageListRpcResponseDto> getAvailablePackageList(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "selectedPackages", required = false) String selectedPackages) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for available package list");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getAvailablePackageList(exemptionNumber, selectedPackages));
  }

  @GetMapping("/approved-exemption-volume")
  public ResponseEntity<PermitApprovedExemptionVolumeRpcResponseDto> getApprovedExemptionVolume(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for approved exemption volume");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getApprovedExemptionVolume(exemptionNumber));
  }

  @GetMapping("/exemption-volume-remaining")
  public ResponseEntity<PermitExemptionVolumeRemainingRpcResponseDto> getExemptionVolumeRemaining(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for exemption volume remaining");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getExemptionVolumeRemaining(exemptionNumber));
  }

  @GetMapping("/gbms-invoice-history")
  public ResponseEntity<List<PermitGbmsInvoiceHistoryItemRpcResponseDto>> getGbmsInvoiceHistory(
      @RequestParam(name = "receiptNumber", required = false) String receiptNumber,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for GBMS invoice history");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.getGbmsInvoiceHistory(receiptNumber, permitNumber, isReadOnlyUser(authentication)));
  }

  @PostMapping("/add-permit")
  public ResponseEntity<PermitMutationRpcResponseDto> addPermit(
      HttpServletRequest request, Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add permit");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.addPermit(
            buildPermitMutationRequest(request),
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/update-permit")
  public ResponseEntity<PermitMutationRpcResponseDto> updatePermit(
      HttpServletRequest request, Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for update permit");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.updatePermit(
            buildPermitMutationRequest(request),
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/update-shipping")
  public ResponseEntity<PermitMutationRpcResponseDto> updateShipping(
      HttpServletRequest request, Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for update shipping");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.updateShipping(
            buildPermitMutationRequest(request),
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/update-scale-attachment")
  public ResponseEntity<PermitPersistenceRpcResponseDto> updateScaleAttachment(
      @RequestParam(name = "scaleId", required = false) String scaleId,
      @RequestParam(name = "scaleDetailId", required = false) String scaleDetailId,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "attachInd", required = false) String attachInd,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for update scale attachment");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.updateScaleAttachment(
            scaleDetailId == null || scaleDetailId.isBlank() ? scaleId : scaleDetailId,
            permitNumber,
            Boolean.parseBoolean(attachInd),
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/add-applications-to-permit")
  public ResponseEntity<PermitPersistenceRpcResponseDto> addApplicationsToPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "selectedApplications", required = false) String selectedApplications,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add applications to permit");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.addApplicationsToPermit(
            permitNumber,
            selectedApplications,
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/remove-application-from-permit")
  public ResponseEntity<PermitPersistenceRpcResponseDto> removeApplicationFromPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for remove application from permit");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.removeApplicationFromPermit(
            permitNumber,
            applicationNumber,
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/add-boic-scale")
  public ResponseEntity<PermitPersistenceRpcResponseDto> addBlanketOicScale(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "timberMark", required = false) String timberMark,
      @RequestParam(name = "scaleVolume", required = false) String scaleVolume,
      @RequestParam(name = "scalePieces", required = false) Long scalePieces,
      @RequestParam(name = "speciesCode", required = false) String speciesCode,
      @RequestParam(name = "gradeCode", required = false) String gradeCode,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add BOIC scale");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.addBlanketOicScale(
            permitNumber,
            packageNumber,
            timberMark,
            scaleVolume,
            scalePieces,
            speciesCode,
            gradeCode,
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/delete-boic-scale")
  public ResponseEntity<PermitPersistenceRpcResponseDto> deleteBlanketOicScale(
      @RequestParam(name = "scaleId", required = false) String scaleId,
      @RequestParam(name = "scaleDetailId", required = false) String scaleDetailId,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for delete BOIC scale");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.deleteBlanketOicScale(
            scaleDetailId == null || scaleDetailId.isBlank() ? scaleId : scaleDetailId,
            permitNumber,
            authentication == null ? null : authentication.getName()));
  }

  @PostMapping("/add-invoice")
  public ResponseEntity<PermitPersistenceRpcResponseDto> addInvoice(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber,
      @RequestParam(name = "invoiceExportValue", required = false) String invoiceExportValue,
      @RequestParam(name = "invoiceConversionRate", required = false) String invoiceConversionRate,
      @RequestParam(name = "invoiceFeeInLieu", required = false) String invoiceFeeInLieu,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for add invoice");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.addInvoice(
            permitNumber,
            salesInvoiceNumber,
            parsePositiveDecimal(invoiceExportValue),
            parsePositiveDecimal(invoiceConversionRate),
            parsePositiveDecimal(invoiceFeeInLieu),
            authentication == null ? null : authentication.getName()));
  }

  @GetMapping("/check-form-changes")
  public ResponseEntity<CheckFormChangesResponseDto> checkFormChanges(HttpServletRequest request) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning default check-form-changes payload");
      return ResponseEntity.ok(new CheckFormChangesResponseDto(false));
    }

    boolean permitChanged = service.hasFormChanges(buildPermitMutationRequest(request));
    return ResponseEntity.ok(new CheckFormChangesResponseDto(permitChanged));
  }

  @PostMapping("/release-lock")
  public ResponseEntity<ReleaseLockResponseDto> releaseLock(HttpServletRequest request) {
    if (request != null) {
      var session = request.getSession(false);
      if (session != null) {
        session.removeAttribute(LEGACY_PERMIT_LOCK_SESSION_KEY);
      }
    }
    return ResponseEntity.ok(new ReleaseLockResponseDto("ok"));
  }

  @GetMapping("/invoices-for-permit")
  public ResponseEntity<PermitInvoiceListRpcResponseDto> getInvoicesForPermit(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for invoices for permit");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getInvoicesForPermit(permitNumber));
  }

  @GetMapping("/invoice-details")
  public ResponseEntity<PermitInvoiceDetailsRpcResponseDto> getInvoiceDetails(
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for invoice details");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getInvoiceDetails(permitNumber, salesInvoiceNumber));
  }

  @GetMapping("/conversion-rate")
  public ResponseEntity<PermitConversionRateRpcResponseDto> getConversionRate() {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for conversion rate");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getConversionRate());
  }

  @GetMapping("/file-types")
  public ResponseEntity<List<PermitFileTypeRpcResponseDto>> getFileTypes() {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for file types");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getFileTypes());
  }

  @GetMapping("/document-details")
  public ResponseEntity<List<PermitDocumentItemRpcResponseDto>> getDocumentDetails(
      @RequestParam(name = "permitNumber", required = false) String permitNumber) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getDocumentDetails(parsePositiveLong(permitNumber)));
  }

  @GetMapping("/document")
  public ResponseEntity<byte[]> getDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for get document");
      return ResponseEntity.noContent().build();
    }

    return service
        .getDocument(parsePositiveLong(fileId))
        .map(
            content -> {
              HttpHeaders headers = new HttpHeaders();
              String normalizedFileName = sanitizeFileName(fileName);
              if (normalizedFileName != null && !normalizedFileName.isBlank()) {
                headers.setContentDisposition(
                    ContentDisposition.attachment()
                        .filename(normalizedFileName, StandardCharsets.UTF_8)
                        .build());
              }
              headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
              return ResponseEntity.ok().headers(headers).body(content.bytes());
            })
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @DeleteMapping("/document/permit")
  public ResponseEntity<RemoveDocumentResponseDto> removePermitDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for remove permit document");
      return ResponseEntity.noContent().build();
    }

    boolean removed = service.removePermitDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
  }

  @DeleteMapping("/document/application")
  public ResponseEntity<RemoveDocumentResponseDto> removeApplicationDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for remove application document");
      return ResponseEntity.noContent().build();
    }

    boolean removed = service.removeApplicationDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
  }

  @DeleteMapping("/document/invoice")
  public ResponseEntity<RemoveDocumentResponseDto> removeInvoiceDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      Authentication authentication) {
    if (!canSavePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for remove invoice document");
      return ResponseEntity.noContent().build();
    }

    boolean removed = service.removeInvoiceDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
  }

  private PermitMutationRequestDto buildPermitMutationRequest(HttpServletRequest request) {
    MultiValueMap<String, String> parameters = fromRequest(request);
    return new PermitMutationRequestDto(
        first(parameters, "permitNumber"),
        first(parameters, "permitStatus"),
        first(parameters, "permitSubmitDate"),
        first(parameters, "permitIssueDate"),
        first(parameters, "permitExpiryDate"),
        first(parameters, "permitRequestDate"),
        first(parameters, "exemptionNumber"),
        first(parameters, "destinationCompanyName"),
        first(parameters, "destinationCountry"),
        first(parameters, "transportType"),
        first(parameters, "transportName"),
        first(parameters, "estimatedShippingDate"),
        first(parameters, "portOfExport"),
        first(parameters, "otherPortOfExport"),
        first(parameters, "permitReceiptNo", "receiptNumber"),
        first(parameters, "permitRemarks"),
        first(parameters, "permitGrowthType", "growthType"),
        first(parameters, "permitTotalVolume"),
        first(parameters, "permitNumberOfPieces", "permitTotalPieces"),
        first(parameters, "orgUnitNo", "region"),
        first(parameters, "ownerClientNumber"),
        first(parameters, "ownerClientLocation"),
        first(parameters, "agentClientNumber"),
        first(parameters, "agentClientLocation"),
        first(parameters, "oicApplicationNumber"),
        first(parameters, "oicRegion"),
        first(parameters, "oicPermitTotalPieces"),
        first(parameters, "oicPermitTotalVolume"),
        first(parameters, "packageAgeClass"),
        first(parameters, "packageProductType"),
        first(parameters, "overrideInd"),
        first(parameters, "overrideFee"),
        first(parameters, "overrideComment"));
  }

  private boolean isMinistryUser(Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (roles == null || roles.isEmpty()) {
      return true;
    }
    for (String role : roles) {
      if (configuredIndustryRoles.contains(role)) {
        return false;
      }
    }
    return true;
  }

  private boolean isReadOnlyUser(Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (roles == null || roles.isEmpty()) {
      return false;
    }
    return roles.contains(ROLE_READ_ONLY);
  }

  private boolean canSavePermit(Authentication authentication) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), LEGACY_ACTION_SAVE_PERMIT);
  }

  private BigDecimal parsePositiveDecimal(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      BigDecimal parsed = new BigDecimal(rawValue.trim());
      return parsed.compareTo(BigDecimal.ZERO) > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  public record CheckFormChangesResponseDto(boolean permitChanged) {}

  public record ReleaseLockResponseDto(String release) {}

  public record RemoveDocumentResponseDto(String success) {}
}

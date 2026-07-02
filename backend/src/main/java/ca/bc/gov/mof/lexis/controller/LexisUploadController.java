package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.upload.ApplicationSubmissionImportService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.math.BigDecimal;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class LexisUploadController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisUploadController.class);

  private final ObjectProvider<LexisUploadService> uploadServiceProvider;
  private final ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider;
  private final ApplicationEditLockService applicationEditLockService;

  public LexisUploadController(
      ObjectProvider<LexisUploadService> uploadServiceProvider,
      ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider,
      ApplicationEditLockService applicationEditLockService) {
    this.uploadServiceProvider = uploadServiceProvider;
    this.applicationSubmissionImportServiceProvider = applicationSubmissionImportServiceProvider;
    this.applicationEditLockService = applicationEditLockService;
  }

  @PostMapping(
      value = {"/fileApplicationUpload", "/uploads/application", "/admin/uploads/applications"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileApplicationUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || applicationNumber == null || applicationNumber < 1) {
      return uploadBadRequest(
          "application", "Choose a file and enter a valid application number before uploading documents.");
    }
    ApplicationEditLockDto lock =
        applicationEditLockService.snapshot(applicationNumber, userId(authentication), false);
    if (lock.locked()) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(uploadFailure("application", lock.message()));
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileApplicationUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadApplication(
            uploadFile,
            applicationNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "application",
                    "We were unable to save this application document. Confirm the application exists and try again."));
  }

  @PostMapping(
      value = {"/filePermitUpload", "/uploads/permit", "/admin/uploads/permits"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> filePermitUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || permitNumber == null || permitNumber < 1) {
      return uploadBadRequest(
          "permit", "Choose a file and enter a valid permit number before uploading documents.");
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for filePermitUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadPermit(
            uploadFile,
            permitNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "permit",
                    "We were unable to save this permit document. Confirm the permit exists and try again."));
  }

  @PostMapping(
      value = {"/fileExemptionUpload", "/uploads/exemption", "/admin/uploads/exemptions"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileExemptionUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null
        || uploadFile.isEmpty()
        || exemptionNumber == null
        || exemptionNumber.isBlank()) {
      return uploadBadRequest(
          "exemption", "Choose a file and enter a valid exemption number before uploading documents.");
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileExemptionUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadExemption(
            uploadFile,
            exemptionNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "exemption",
                    "We were unable to save this exemption document. Confirm the exemption exists and try again."));
  }

  @PostMapping(
      value = {"/fileInvoiceUpload", "/uploads/invoice", "/admin/uploads/invoices"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileInvoiceUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      @RequestParam(name = "invoiceExportValue", required = false) BigDecimal invoiceExportValue,
      @RequestParam(name = "exportValue", required = false) BigDecimal exportValueAlias,
      @RequestParam(name = "invoiceConversionRate", required = false)
          BigDecimal invoiceConversionRate,
      @RequestParam(name = "currencyConversionRate", required = false)
          BigDecimal conversionRateAlias,
      @RequestParam(name = "invoiceFeeInLieu", required = false) BigDecimal invoiceFeeInLieu,
      @RequestParam(name = "feeInLieu", required = false) BigDecimal feeInLieuAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null
        || uploadFile.isEmpty()
        || permitNumber == null
        || permitNumber < 1
        || salesInvoiceNumber == null
        || salesInvoiceNumber.isBlank()) {
      return uploadBadRequest(
          "invoice", "Choose a file and enter valid permit and invoice numbers before uploading documents.");
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileInvoiceUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadInvoice(
            uploadFile,
            permitNumber,
            salesInvoiceNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            firstNonNull(invoiceExportValue, exportValueAlias),
            firstNonNull(invoiceConversionRate, conversionRateAlias),
            firstNonNull(invoiceFeeInLieu, feeInLieuAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "invoice",
                    "We were unable to save this invoice document. Confirm the permit exists and try again."));
  }

  @PostMapping(
      value = {
        "/application-submissions",
        "/uploads/lexis-xml",
        "/admin/uploads/lexis-xml"
      },
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApplicationSubmissionImportResultDto> applicationSubmissionUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "userReference", required = false) String userReference,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty()) {
      return ResponseEntity.badRequest()
          .body(applicationSubmissionFailure("Choose a LEXIS application submission file before uploading."));
    }

    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "LEXIS application submission import service unavailable - returning no content for applicationSubmissionUpload");
      return ResponseEntity.noContent().build();
    }

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            uploadFile, resolveEntryUserId(authentication), userReference);
    return ResponseEntity.status(applicationSubmissionResponseStatus(result)).body(result);
  }

  @PostMapping(
      value = {
        "/application-submissions/validation",
        "/uploads/lexis-xml/validation",
        "/admin/uploads/lexis-xml/validation"
      },
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApplicationSubmissionImportResultDto> applicationSubmissionValidation(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "userReference", required = false) String userReference,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty()) {
      return ResponseEntity.badRequest()
          .body(applicationSubmissionFailure("Choose a LEXIS application submission file before validating."));
    }

    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "LEXIS application submission import service unavailable - returning no content for applicationSubmissionValidation");
      return ResponseEntity.noContent().build();
    }

    ApplicationSubmissionImportResultDto result =
        service.validateApplicationSubmission(uploadFile, userReference);
    return ResponseEntity.status(applicationSubmissionResponseStatus(result)).body(result);
  }

  private String resolveEntryUserId(Authentication authentication) {
    String principalName = userId(authentication);
    if (principalName == null) {
      return null;
    }
    int slash = Math.max(principalName.lastIndexOf('\\'), principalName.lastIndexOf('/'));
    if (slash >= 0 && slash < principalName.length() - 1) {
      return principalName.substring(slash + 1);
    }
    return principalName;
  }

  private String userId(Authentication authentication) {
    if (authentication == null || authentication.getName() == null) {
      return null;
    }
    String principalName = authentication.getName().trim();
    if (principalName.isEmpty()) {
      return null;
    }
    return principalName;
  }

  private ResponseEntity<LexisUploadResultDto> uploadResponse(LexisUploadResultDto result) {
    HttpStatus status =
        "accepted".equalsIgnoreCase(result.status()) ? HttpStatus.OK : HttpStatus.UNPROCESSABLE_ENTITY;
    return ResponseEntity.status(status).body(result);
  }

  private ResponseEntity<LexisUploadResultDto> uploadBadRequest(
      String uploadType, String message) {
    return ResponseEntity.badRequest().body(uploadFailure(uploadType, message));
  }

  private ResponseEntity<LexisUploadResultDto> uploadPersistenceFailure(
      String uploadType, String message) {
    return ResponseEntity.unprocessableEntity().body(uploadFailure(uploadType, message));
  }

  private LexisUploadResultDto uploadFailure(String uploadType, String message) {
    return new LexisUploadResultDto(uploadType, null, 0L, "rejected", message);
  }

  private ApplicationSubmissionImportResultDto applicationSubmissionFailure(String message) {
    return new ApplicationSubmissionImportResultDto(
        "applicationSubmission",
        null,
        0L,
        "rejected",
        message,
        null,
        null,
        0,
        List.of(message),
        List.of());
  }

  private HttpStatus applicationSubmissionResponseStatus(ApplicationSubmissionImportResultDto result) {
    return "accepted".equalsIgnoreCase(result.status()) || "validated".equalsIgnoreCase(result.status())
        ? HttpStatus.OK
        : HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private String firstNonBlank(String primary, String alias) {
    if (primary != null && !primary.isBlank()) {
      return primary;
    }
    if (alias != null && !alias.isBlank()) {
      return alias;
    }
    return null;
  }

  private BigDecimal firstNonNull(BigDecimal primary, BigDecimal alias) {
    return primary != null ? primary : alias;
  }

  private MultipartFile firstNonNull(MultipartFile primary, MultipartFile alias) {
    return primary != null ? primary : alias;
  }
}

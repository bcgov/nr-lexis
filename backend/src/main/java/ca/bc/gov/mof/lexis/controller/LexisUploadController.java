package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.dto.upload.LexisXmlImportResultDto;
import ca.bc.gov.mof.lexis.service.esf.LexisEsfXmlImportService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.math.BigDecimal;
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
  private final ObjectProvider<LexisEsfXmlImportService> esfXmlImportServiceProvider;

  public LexisUploadController(
      ObjectProvider<LexisUploadService> uploadServiceProvider,
      ObjectProvider<LexisEsfXmlImportService> esfXmlImportServiceProvider) {
    this.uploadServiceProvider = uploadServiceProvider;
    this.esfXmlImportServiceProvider = esfXmlImportServiceProvider;
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
      return ResponseEntity.badRequest().build();
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
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.unprocessableEntity().build());
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
      return ResponseEntity.badRequest().build();
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
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.unprocessableEntity().build());
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
      return ResponseEntity.badRequest().build();
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
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.unprocessableEntity().build());
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
      return ResponseEntity.badRequest().build();
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
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.unprocessableEntity().build());
  }

  @PostMapping(
      value = {"/uploads/lexis-xml", "/admin/uploads/lexis-xml"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisXmlImportResultDto> lexisXmlUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty()) {
      return ResponseEntity.badRequest().build();
    }

    LexisEsfXmlImportService service = esfXmlImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("ESF XML import service unavailable - returning no content for lexisXmlUpload");
      return ResponseEntity.noContent().build();
    }

    LexisXmlImportResultDto result = service.importLexisXml(uploadFile, resolveEntryUserId(authentication));
    HttpStatus status = "accepted".equalsIgnoreCase(result.status()) ? HttpStatus.OK : HttpStatus.UNPROCESSABLE_ENTITY;
    return ResponseEntity.status(status).body(result);
  }

  private String resolveEntryUserId(Authentication authentication) {
    if (authentication == null || authentication.getName() == null) {
      return null;
    }
    String principalName = authentication.getName().trim();
    if (principalName.isEmpty()) {
      return null;
    }
    int slash = Math.max(principalName.lastIndexOf('\\'), principalName.lastIndexOf('/'));
    if (slash >= 0 && slash < principalName.length() - 1) {
      return principalName.substring(slash + 1);
    }
    return principalName;
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

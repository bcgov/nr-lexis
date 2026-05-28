package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.math.BigDecimal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
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

  public LexisUploadController(ObjectProvider<LexisUploadService> uploadServiceProvider) {
    this.uploadServiceProvider = uploadServiceProvider;
  }

  @PostMapping(
      value = {"/fileApplicationUpload", "/uploads/application"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileApplicationUpload(
      @RequestParam("file") MultipartFile file,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    if (file == null || file.isEmpty() || applicationNumber == null || applicationNumber < 1) {
      return ResponseEntity.badRequest().build();
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileApplicationUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadApplication(
            file,
            applicationNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping(
      value = {"/filePermitUpload", "/uploads/permit"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> filePermitUpload(
      @RequestParam("file") MultipartFile file,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    if (file == null || file.isEmpty() || permitNumber == null || permitNumber < 1) {
      return ResponseEntity.badRequest().build();
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for filePermitUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadPermit(
            file,
            permitNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping(
      value = {"/fileExemptionUpload", "/uploads/exemption"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileExemptionUpload(
      @RequestParam("file") MultipartFile file,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    if (file == null
        || file.isEmpty()
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
            file,
            exemptionNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping(
      value = {"/fileInvoiceUpload", "/uploads/invoice"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileInvoiceUpload(
      @RequestParam("file") MultipartFile file,
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
    if (file == null
        || file.isEmpty()
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
            file,
            permitNumber,
            salesInvoiceNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            firstNonNull(invoiceExportValue, exportValueAlias),
            firstNonNull(invoiceConversionRate, conversionRateAlias),
            firstNonNull(invoiceFeeInLieu, feeInLieuAlias),
            resolveEntryUserId(authentication))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
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
}

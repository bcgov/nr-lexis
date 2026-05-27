package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
      @RequestParam("file") MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return ResponseEntity.badRequest().build();
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileApplicationUpload");
      return ResponseEntity.noContent().build();
    }
    return service.uploadApplication(file).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping(
      value = {"/filePermitUpload", "/uploads/permit"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> filePermitUpload(@RequestParam("file") MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return ResponseEntity.badRequest().build();
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for filePermitUpload");
      return ResponseEntity.noContent().build();
    }
    return service.uploadPermit(file).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping(
      value = {"/fileExemptionUpload", "/uploads/exemption"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileExemptionUpload(
      @RequestParam("file") MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return ResponseEntity.badRequest().build();
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileExemptionUpload");
      return ResponseEntity.noContent().build();
    }
    return service.uploadExemption(file).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping(
      value = {"/fileInvoiceUpload", "/uploads/invoice"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileInvoiceUpload(@RequestParam("file") MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return ResponseEntity.badRequest().build();
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileInvoiceUpload");
      return ResponseEntity.noContent().build();
    }
    return service.uploadInvoice(file).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }
}


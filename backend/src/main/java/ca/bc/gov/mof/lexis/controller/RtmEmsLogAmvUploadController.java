package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Retains the previous AMV workbook workflow without exposing it by default.
 * Set {@code lexis.rtm.amv.upload.enabled=true} only when the upload experience is intentionally
 * restored.
 */
@RestController
@ConditionalOnProperty(prefix = "lexis.rtm.amv.upload", name = "enabled", havingValue = "true")
@RequestMapping("/api/lexis/rtm")
@Validated
public class RtmEmsLogAmvUploadController {

  private static final Logger LOGGER = LoggerFactory.getLogger(RtmEmsLogAmvUploadController.class);

  private final ObjectProvider<RtmEmsLogAmvService> serviceProvider;

  public RtmEmsLogAmvUploadController(ObjectProvider<RtmEmsLogAmvService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @PostMapping(value = "/emslogamv/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<RtmEmsLogAmvUploadPreviewDto> previewUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "retrievalDate", required = false) String retrievalDate,
      @RequestParam(name = "growthIndicator", required = false) String growthIndicator) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("RTM EMS AMV service unavailable - returning no content for previewUpload");
      return ResponseEntity.noContent().build();
    }

    MultipartFile uploadFile = firstNonNull(file, formFile);
    RtmEmsLogAmvUploadPreviewDto result = service.previewUpload(uploadFile);
    return ResponseEntity.status(responseStatus(result.status())).body(result);
  }

  @PostMapping(value = "/emslogamv/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<RtmEmsLogAmvUploadResultDto> upload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "retrievalDate", required = false) String retrievalDate,
      @RequestParam(name = "growthIndicator", required = false) String growthIndicator) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("RTM EMS AMV service unavailable - returning no content for upload");
      return ResponseEntity.noContent().build();
    }

    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty()) {
      return ResponseEntity.unprocessableEntity()
          .body(
              buildUploadFailure(
                  uploadFile,
                  "Upload template validation failed.",
                  List.of("No file provided."),
                  List.of(),
                  List.of()));
    }

    RtmEmsLogAmvUploadResultDto result = service.upload(uploadFile, retrievalDate, growthIndicator);
    return ResponseEntity.status(responseStatus(result.status())).body(result);
  }

  private HttpStatus responseStatus(String status) {
    return "accepted".equalsIgnoreCase(status) ? HttpStatus.OK : HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private RtmEmsLogAmvUploadResultDto buildUploadFailure(
      MultipartFile uploadFile,
      String message,
      List<String> errors,
      List<String> warnings,
      List<RtmEmsLogAmvRowDto> rows) {
    return new RtmEmsLogAmvUploadResultDto(
        "rejected",
        uploadFile == null ? null : trimToNull(uploadFile.getOriginalFilename()),
        uploadFile == null ? 0L : uploadFile.getSize(),
        message,
        0,
        0,
        errors,
        warnings,
        rows);
  }

  private MultipartFile firstNonNull(MultipartFile primary, MultipartFile alias) {
    return primary == null ? alias : primary;
  }
}

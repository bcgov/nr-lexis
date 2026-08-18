package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
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

/** Exposes the AMV workbook validation, review, and atomic upload workflow. */
@RestController
@RequestMapping("/api/lexis/rtm")
@Validated
public class RtmEmsLogAmvUploadController {

  private static final Logger LOGGER = LoggerFactory.getLogger(RtmEmsLogAmvUploadController.class);

  private final ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  private final LexisPrincipalService principalService;

  public RtmEmsLogAmvUploadController(
      ObjectProvider<RtmEmsLogAmvService> serviceProvider,
      LexisPrincipalService principalService) {
    this.serviceProvider = serviceProvider;
    this.principalService = principalService;
  }

  @PostMapping(value = "/emslogamv/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<RtmEmsLogAmvUploadPreviewDto> previewUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "effectiveMonth", required = false) String effectiveMonth) {
    RtmEmsLogAmvService service = requiredService("preview");

    MultipartFile uploadFile = firstNonNull(file, formFile);
    RtmEmsLogAmvUploadPreviewDto result = service.previewUpload(uploadFile, effectiveMonth);
    return ResponseEntity.status(responseStatus(result.status())).body(result);
  }

  @PostMapping(value = "/emslogamv/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<RtmEmsLogAmvUploadResultDto> upload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "effectiveMonth", required = false) String effectiveMonth,
      Authentication authentication) {
    RtmEmsLogAmvService service = requiredService("upload");

    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty()) {
      return ResponseEntity.unprocessableEntity()
          .body(
              buildUploadFailure(
                  uploadFile,
                  "This file couldn't be used.",
                  List.of("No file provided."),
                  List.of(),
                  List.of()));
    }

    String actor = RtmEmsLogAmvAuditActor.resolve(principalService, authentication);
    if (actor == null) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    RtmEmsLogAmvUploadResultDto result = service.upload(uploadFile, effectiveMonth, actor);
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

  private RtmEmsLogAmvService requiredService(String operation) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service != null) {
      return service;
    }

    LOGGER.warn(
        "event=lexis_rtm_amv operation={} outcome=service_unavailable", operation);
    throw new DataAccessResourceFailureException(
        "The authoritative RTM AMV service is temporarily unavailable.");
  }
}

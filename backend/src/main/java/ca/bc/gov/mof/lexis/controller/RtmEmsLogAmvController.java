package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.parseRetrievalDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/lexis/rtm")
@Validated
public class RtmEmsLogAmvController {

  private static final Logger LOGGER = LoggerFactory.getLogger(RtmEmsLogAmvController.class);

  private final ObjectProvider<RtmEmsLogAmvService> serviceProvider;

  public RtmEmsLogAmvController(ObjectProvider<RtmEmsLogAmvService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @GetMapping("/emslogamv")
  public ResponseEntity<List<RtmEmsLogAmvRowDto>> find(
      @RequestParam(name = "species", required = false) String species,
      @RequestParam(name = "growthIndicator", required = false) String growthIndicator,
      @RequestParam(name = "retrievalDate", required = false) String retrievalDate,
      @RequestParam(name = "updateDate", required = false) String updateDate) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("RTM EMS AMV service unavailable - returning no content for find");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.find(species, growthIndicator, retrievalDate, updateDate));
  }

  @PostMapping("/emslogamv")
  public ResponseEntity<RtmEmsLogAmvMutationResultDto> save(
      @RequestBody(required = false) RtmEmsLogAmvSaveRequestDto request) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("RTM EMS AMV service unavailable - returning no content for save");
      return ResponseEntity.noContent().build();
    }

    RtmEmsLogAmvSaveRequestDto normalizedRequest =
        request == null
            ? new RtmEmsLogAmvSaveRequestDto(null, null, null, null, null, null, null)
            : request;

    RtmEmsLogAmvMutationResultDto result = service.save(normalizedRequest);
    return ResponseEntity.status(responseStatus(result.status())).body(result);
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
    List<String> metadataErrors = uploadMetadataErrors(retrievalDate, growthIndicator);
    if (!metadataErrors.isEmpty()) {
      return ResponseEntity.unprocessableEntity()
          .body(buildPreviewFailure(uploadFile, metadataErrors, "Upload template validation failed."));
    }

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
    List<String> metadataErrors = uploadMetadataErrors(retrievalDate, growthIndicator);
    if (!metadataErrors.isEmpty()) {
      return ResponseEntity.unprocessableEntity()
          .body(
              buildUploadFailure(
                  uploadFile,
                  "Upload template validation failed.",
                  metadataErrors,
                  List.of(),
                  List.of()));
    }
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

    String normalizedRetrievalDate = normalizeRetrievalDate(retrievalDate);
    String normalizedGrowthIndicator = trimToNull(growthIndicator);
    RtmEmsLogAmvUploadResultDto result =
        service.upload(uploadFile, normalizedRetrievalDate, normalizedGrowthIndicator);
    return ResponseEntity.status(responseStatus(result.status())).body(result);
  }

  private HttpStatus responseStatus(String status) {
    return "accepted".equalsIgnoreCase(status) ? HttpStatus.OK : HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private List<String> uploadMetadataErrors(String retrievalDate, String growthIndicator) {
    List<String> errors = new ArrayList<>();
    String normalizedGrowthIndicator = trimToNull(growthIndicator);
    String normalizedRetrievalDate = trimToNull(retrievalDate);

    if (normalizedGrowthIndicator == null) {
      errors.add("Growth indicator is required.");
    }
    if (normalizedRetrievalDate == null) {
      errors.add("Retrieval date is required.");
    } else if (parseRetrievalDate(normalizedRetrievalDate) == null) {
      errors.add("Retrieval date must be a valid date.");
    }

    return errors;
  }

  private String normalizeRetrievalDate(String retrievalDate) {
    String normalized = trimToNull(retrievalDate);
    if (normalized == null) {
      return null;
    }
    LocalDate parsed = parseRetrievalDate(normalized);
    return parsed == null ? null : parsed.toString();
  }

  private RtmEmsLogAmvUploadPreviewDto buildPreviewFailure(
      MultipartFile uploadFile, List<String> errors, String message) {
    return new RtmEmsLogAmvUploadPreviewDto(
        "validation_failed",
        uploadFile == null ? null : trimToNull(uploadFile.getOriginalFilename()),
        uploadFile == null ? 0L : uploadFile.getSize(),
        message,
        0,
        errors,
        List.of());
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

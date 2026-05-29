package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitRequestDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitResponseDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class ApplicationDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ApplicationDetailsRpcController.class);
  private static final String ACTION_GET_DOCUMENT_DETAILS = "getDocumentDetails";
  private static final String ACTION_GET_DOCUMENT = "getDocument";
  private static final String ACTION_REMOVE_DOCUMENT = "removeDocument";
  private static final String ACTION_GET_REMARK = "getRemark";
  private static final String ACTION_PERSIST_REMARK = "persistRemark";

  private final ObjectProvider<ApplicationDetailsRpcService> serviceProvider;

  public ApplicationDetailsRpcController(ObjectProvider<ApplicationDetailsRpcService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @GetMapping("/rpc/application-details/document-details")
  public ResponseEntity<List<DocumentDetailsResponseDto>> getDocumentDetails(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }

    List<DocumentDetailsResponseDto> response =
        service.getDocumentDetails(parsePositiveLong(applicationNumber)).stream()
            .map(
                item ->
                    new DocumentDetailsResponseDto(
                        item.name(), item.description(), item.type(), item.id()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT_DETAILS)
  public ResponseEntity<List<DocumentDetailsResponseDto>> getDocumentDetailsLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return getDocumentDetails(applicationNumber);
  }

  @GetMapping("/rpc/application-details/document")
  public ResponseEntity<byte[]> getDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for get document");
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

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT)
  public ResponseEntity<byte[]> getDocumentLegacy(
      @RequestParam(name = "fileID", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    return getDocument(fileId, fileName);
  }

  @DeleteMapping("/rpc/application-details/document")
  public ResponseEntity<RemoveDocumentResponseDto> removeDocument(
      @RequestParam(name = "documentId", required = false) String documentId) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for remove document");
      return ResponseEntity.noContent().build();
    }
    boolean removed = service.removeDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_DOCUMENT)
  public ResponseEntity<RemoveDocumentResponseDto> removeDocumentLegacy(
      @RequestParam(name = "documentId", required = false) String documentId) {
    return removeDocument(documentId);
  }

  @GetMapping("/rpc/application-details/remark")
  public ResponseEntity<GetRemarkResponseDto> getRemark(
      @RequestParam(name = "remarkId", required = false) String remarkId) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for get remark");
      return ResponseEntity.noContent().build();
    }

    return service
        .getRemark(parsePositiveLong(remarkId))
        .map(remark -> ResponseEntity.ok(new GetRemarkResponseDto(remark, false)))
        .orElseGet(() -> ResponseEntity.ok(new GetRemarkResponseDto(null, true)));
  }

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_REMARK)
  public ResponseEntity<GetRemarkResponseDto> getRemarkLegacy(
      @RequestParam(name = "remarkId", required = false) String remarkId) {
    return getRemark(remarkId);
  }

  @PostMapping("/rpc/application-details/remark")
  public ResponseEntity<PersistRemarkResponseDto> persistRemark(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "remarkBody", required = false) String remarkBody,
      Authentication authentication) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for persist remark");
      return ResponseEntity.noContent().build();
    }

    String userId = authentication == null ? null : authentication.getName();
    return service
        .persistRemark(remarkId, parsePositiveLong(applicationNumber), remarkBody, userId)
        .map(
            persisted ->
                ResponseEntity.ok(
                    new PersistRemarkResponseDto(
                        "ok",
                        persisted.date(),
                        persisted.user(),
                        persisted.displayRemark(),
                        persisted.remark(),
                        persisted.remarkId())))
        .orElseGet(
            () ->
                ResponseEntity.ok(
                    new PersistRemarkResponseDto("error", null, null, null, null, null)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_PERSIST_REMARK)
  public ResponseEntity<PersistRemarkResponseDto> persistRemarkLegacy(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "remarkBody", required = false) String remarkBody,
      Authentication authentication) {
    return persistRemark(remarkId, applicationNumber, remarkBody, authentication);
  }

  @PostMapping(
      value = "/rpc/application-details/scale-upload/preview",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApplicationScaleUploadPreviewResponseDto> previewScaleXmlUpload(
      @RequestParam("file") List<MultipartFile> files,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for scale upload preview");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.previewScaleXmlUpload(files, applicationNumber, packageNumber));
  }

  @PostMapping(
      value = "/rpc/application-details/scale-upload/submit",
      consumes = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<ApplicationScaleUploadSubmitResponseDto> submitScaleXmlUpload(
      @RequestBody ApplicationScaleUploadSubmitRequestDto request,
      Authentication authentication) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for scale upload submit");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.submitScaleXmlUpload(request, authentication == null ? null : authentication.getName()));
  }

  private Long parsePositiveLong(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      long parsed = Long.parseLong(rawValue.trim());
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String sanitizeFileName(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    String normalized = rawValue.trim();
    int slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    if (slashIndex >= 0 && slashIndex < normalized.length() - 1) {
      normalized = normalized.substring(slashIndex + 1);
    }
    return normalized;
  }

  public record DocumentDetailsResponseDto(
      String name, String description, String type, long id) {}

  public record RemoveDocumentResponseDto(String success) {}

  public record GetRemarkResponseDto(String remark, boolean notfound) {}

  public record PersistRemarkResponseDto(
      String status, Instant date, String user, String remark, String title, Long remarkId) {}
}

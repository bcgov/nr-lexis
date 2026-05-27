package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.nio.charset.StandardCharsets;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class ExemptionDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionDetailsRpcController.class);

  private static final String ROLE_READ_ONLY = "READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "APPLICATION_APPROVER";

  private static final String ACTION_GET_APPLICATIONS = "getApplications";
  private static final String ACTION_GET_PERMITS = "getPermits";
  private static final String ACTION_GET_BLANKET_OIC_TOTALS = "getBlanketOICTotals";
  private static final String ACTION_GET_DOCUMENT_DETAILS = "getDocumentDetails";
  private static final String ACTION_GET_DOCUMENT = "getDocument";
  private static final String ACTION_REMOVE_DOCUMENT = "removeDocument";

  private final ObjectProvider<ExemptionDetailsRpcService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;

  public ExemptionDetailsRpcController(
      ObjectProvider<ExemptionDetailsRpcService> serviceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
  }

  @GetMapping("/rpc/exemption-details/applications")
  public ResponseEntity<ExemptionApplicationsResponseDto> getApplications(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for get applications");
      return ResponseEntity.noContent().build();
    }

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.ExemptionApplicationsResponse payload =
        service.getApplications(
            exemptionNumber,
            authorizationService.canPerformAction(roles, "viewFederalApplication"),
            authorizationService.canPerformAction(roles, "viewOICApplication"));

    return ResponseEntity.ok(toApplicationsResponse(payload));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_APPLICATIONS)
  public ResponseEntity<ExemptionApplicationsResponseDto> getApplicationsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    return getApplications(exemptionNumber, authentication);
  }

  @GetMapping("/rpc/exemption-details/permits")
  public ResponseEntity<List<PermitItemDto>> getPermits(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for get permits");
      return ResponseEntity.noContent().build();
    }

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    boolean industryUser =
        roles.stream().anyMatch(role -> sessionService.getConfiguredIndustryRoles().contains(role));
    boolean privilegedUser =
        roles.contains(ROLE_READ_ONLY) || roles.contains(ROLE_APPLICATION_APPROVER);
    boolean ministryUser = !industryUser;
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    List<PermitItemDto> permits =
        service
            .getPermits(exemptionNumber, ministryUser, privilegedUser, forestClientNumber)
            .stream()
            .map(
                row ->
                    new PermitItemDto(
                        row.permitNumber(),
                        row.permitVolume(),
                        row.permitStatus(),
                        row.permitIssueDate(),
                        row.canViewPermit()))
            .toList();
    return ResponseEntity.ok(permits);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_PERMITS)
  public ResponseEntity<List<PermitItemDto>> getPermitsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    return getPermits(exemptionNumber, authentication);
  }

  @GetMapping("/rpc/exemption-details/blanket-oic-totals")
  public ResponseEntity<BlanketOicTotalsResponseDto> getBlanketOicTotals(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Exemption details RPC service unavailable - returning no content for get blanket OIC totals");
      return ResponseEntity.noContent().build();
    }

    ExemptionDetailsRpcService.BlanketOicTotalsResponse payload =
        service.getBlanketOicTotals(exemptionNumber);
    return ResponseEntity.ok(
        new BlanketOicTotalsResponseDto(payload.requestedVolume(), payload.completedVolume()));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_BLANKET_OIC_TOTALS)
  public ResponseEntity<BlanketOicTotalsResponseDto> getBlanketOicTotalsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    return getBlanketOicTotals(exemptionNumber);
  }

  @GetMapping("/rpc/exemption-details/document-details")
  public ResponseEntity<List<DocumentItemDto>> getDocumentDetails(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }

    List<DocumentItemDto> response =
        service.getDocumentDetails(exemptionNumber).stream()
            .map(
                item ->
                    new DocumentItemDto(item.name(), item.description(), item.type(), item.id()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT_DETAILS)
  public ResponseEntity<List<DocumentItemDto>> getDocumentDetailsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    return getDocumentDetails(exemptionNumber);
  }

  @GetMapping("/rpc/exemption-details/document")
  public ResponseEntity<byte[]> getDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for get document");
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

  @GetMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT)
  public ResponseEntity<byte[]> getDocumentLegacy(
      @RequestParam(name = "fileID", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    return getDocument(fileId, fileName);
  }

  @DeleteMapping("/rpc/exemption-details/document")
  public ResponseEntity<RemoveDocumentResponseDto> removeDocument(
      @RequestParam(name = "documentId", required = false) String documentId) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for remove document");
      return ResponseEntity.noContent().build();
    }

    boolean removed = service.removeDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_DOCUMENT)
  public ResponseEntity<RemoveDocumentResponseDto> removeDocumentLegacy(
      @RequestParam(name = "documentId", required = false) String documentId) {
    return removeDocument(documentId);
  }

  private ExemptionApplicationsResponseDto toApplicationsResponse(
      ExemptionDetailsRpcService.ExemptionApplicationsResponse response) {
    List<ApplicationItemDto> applications =
        response.applications().stream()
            .map(
                row ->
                    new ApplicationItemDto(
                        row.applicationNumber(),
                        row.requestedVolume(),
                        row.scaleVolume(),
                        row.locked(),
                        row.jurisdiction()))
            .toList();

    return new ExemptionApplicationsResponseDto(
        applications, response.containsUnmanu(), response.ownerNumber());
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

  public record ExemptionApplicationsResponseDto(
      List<ApplicationItemDto> applications, boolean containsUnmanu, String ownerNumber) {}

  public record ApplicationItemDto(
      long applicationNumber,
      String requestedVolume,
      String scaleVolume,
      boolean locked,
      String jurisdiction) {}

  public record PermitItemDto(
      long permitNumber,
      String permitVolume,
      String permitStatus,
      String permitIssueDate,
      boolean canViewPermit) {}

  public record BlanketOicTotalsResponseDto(String requestedVolume, String completedVolume) {}

  public record DocumentItemDto(String name, String description, String type, long id) {}

  public record RemoveDocumentResponseDto(String success) {}
}

package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import java.nio.charset.StandardCharsets;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.util.List;
import java.util.Set;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/rpc/permit-details")
@Validated
public class PermitDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(PermitDetailsRpcController.class);

  private final ObjectProvider<PermitDetailsRpcService> serviceProvider;
  private final LexisSessionService sessionService;
  private final Set<String> configuredIndustryRoles;

  public PermitDetailsRpcController(
      ObjectProvider<PermitDetailsRpcService> serviceProvider, LexisSessionService sessionService) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
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
      @RequestParam(name = "documentId", required = false) String documentId) {
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
      @RequestParam(name = "documentId", required = false) String documentId) {
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
      @RequestParam(name = "documentId", required = false) String documentId) {
    PermitDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Permit RPC service unavailable - returning no content for remove invoice document");
      return ResponseEntity.noContent().build();
    }

    boolean removed = service.removeInvoiceDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
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

  public record RemoveDocumentResponseDto(String success) {}
}

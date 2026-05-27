package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
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
}

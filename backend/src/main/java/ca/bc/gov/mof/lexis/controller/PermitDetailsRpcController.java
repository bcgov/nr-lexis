package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
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
  private final Set<String> configuredIndustryRoles;

  public PermitDetailsRpcController(
      ObjectProvider<PermitDetailsRpcService> serviceProvider,
      @Value("${lexis.auth.industry-roles:}") String industryRolesCsv) {
    this.serviceProvider = serviceProvider;
    this.configuredIndustryRoles = parseRoleCsv(industryRolesCsv);
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

  private Set<String> parseRoleCsv(String csv) {
    if (csv == null || csv.isBlank()) {
      return Set.of();
    }

    LinkedHashSet<String> parsed = new LinkedHashSet<>();
    for (String role : Arrays.asList(csv.split(","))) {
      if (role == null) {
        continue;
      }
      String normalizedRole = role.trim().toUpperCase(Locale.ROOT);
      if (!normalizedRole.isEmpty()) {
        parsed.add(normalizedRole);
      }
    }
    return Set.copyOf(parsed);
  }

  private boolean isMinistryUser(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return true;
    }
    for (GrantedAuthority authority : authentication.getAuthorities()) {
      String role = normalizeRole(authority.getAuthority());
      if (role == null) {
        continue;
      }
      if (configuredIndustryRoles.contains(role)) {
        return false;
      }
      for (String configuredIndustryRole : configuredIndustryRoles) {
        if (role.startsWith(configuredIndustryRole + "_")) {
          return false;
        }
      }
    }
    return true;
  }

  private String normalizeRole(String role) {
    if (role == null) {
      return null;
    }
    String normalized = role.trim().toUpperCase(Locale.ROOT);
    return normalized.isEmpty() ? null : normalized;
  }
}

package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockHeaders;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import java.util.Optional;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Returns current optimistic versions without opening an interactive edit session. */
@RestController
@RequestMapping("/api/lexis/record-versions")
@Validated
public class OptimisticRecordVersionController {

  private final ObjectProvider<OracleOptimisticRecordVersionService> versionServiceProvider;
  private final ProvincialAuthorizationService provincialAuthorizationService;

  public OptimisticRecordVersionController(
      ObjectProvider<OracleOptimisticRecordVersionService> versionServiceProvider,
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.versionServiceProvider = versionServiceProvider;
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @GetMapping("/application")
  public ResponseEntity<Void> applicationVersion(
      @RequestParam("applicationNumber") @Positive Long applicationNumber,
      Authentication authentication) {
    if (!provincialAuthorizationService.canAccessApplication(
        authentication, applicationNumber)) {
      return ResponseEntity.notFound().build();
    }
    return currentVersion(OptimisticRecordType.APPLICATION, applicationNumber.toString());
  }

  @GetMapping("/exemption")
  public ResponseEntity<Void> exemptionVersion(
      @RequestParam("exemptionNumber") @NotBlank String exemptionNumber,
      Authentication authentication) {
    String normalizedNumber = exemptionNumber.trim();
    if (!provincialAuthorizationService.canAccessExemption(
        authentication, normalizedNumber)) {
      return ResponseEntity.notFound().build();
    }
    return currentVersion(OptimisticRecordType.EXEMPTION, normalizedNumber);
  }

  private ResponseEntity<Void> currentVersion(
      OptimisticRecordType recordType, String recordId) {
    OracleOptimisticRecordVersionService versionService =
        versionServiceProvider.getIfAvailable();
    if (versionService == null) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    Optional<OptimisticRecordVersion> version = versionService.find(recordType, recordId);
    return version
        .map(
            value ->
                ResponseEntity.noContent()
                    .cacheControl(CacheControl.noStore())
                    .header(OptimisticLockHeaders.RECORD_VERSION, value.token())
                    .<Void>build())
        .orElseGet(() -> ResponseEntity.notFound().build());
  }
}

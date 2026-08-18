package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvBatchSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvLastSavedDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/rtm")
@Validated
public class RtmEmsLogAmvController {

  private static final Logger LOGGER = LoggerFactory.getLogger(RtmEmsLogAmvController.class);
  private static final Logger AUDIT_LOGGER =
      LoggerFactory.getLogger("ca.bc.gov.mof.lexis.audit.rtm");
  private static final String UNRESOLVED_ACTOR = "UNRESOLVED";

  private final ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  private final LexisPrincipalService principalService;

  @Autowired
  public RtmEmsLogAmvController(
      ObjectProvider<RtmEmsLogAmvService> serviceProvider, LexisPrincipalService principalService) {
    this.serviceProvider = serviceProvider;
    this.principalService = principalService;
  }

  @GetMapping("/emslogamv")
  public ResponseEntity<List<RtmEmsLogAmvRowDto>> find(
      @RequestParam(name = "species", required = false) String species,
      @RequestParam(name = "growthIndicator", required = false) String growthIndicator,
      @RequestParam(name = "retrievalDate", required = false) String retrievalDate,
      @RequestParam(name = "updateDate", required = false) String updateDate,
      @RequestParam(name = "latestBeforeDate", required = false) String latestBeforeDate) {
    RtmEmsLogAmvService service = requiredService("find");

    if (latestBeforeDate != null && !latestBeforeDate.isBlank()) {
      return ResponseEntity.ok(service.findLatestBefore(latestBeforeDate));
    }

    return ResponseEntity.ok(service.find(species, growthIndicator, retrievalDate, updateDate));
  }

  @GetMapping("/emslogamv/last-saved")
  public ResponseEntity<RtmEmsLogAmvLastSavedDto> findLastSaved(
      @RequestParam(name = "effectiveDate") String effectiveDate) {
    return ResponseEntity.ok(requiredService("find_last_saved").findLastSaved(effectiveDate));
  }

  @PostMapping("/emslogamv/batch")
  public ResponseEntity<RtmEmsLogAmvMutationResultDto> saveBatch(
      @RequestBody(required = false) RtmEmsLogAmvBatchSaveRequestDto request,
      Authentication authentication) {
    List<RtmEmsLogAmvSaveRequestDto> values = request == null ? List.of() : request.values();
    int requestedLogicalCells = values.size();
    String actor = RtmEmsLogAmvAuditActor.resolve(principalService, authentication);
    if (actor == null) {
      auditBatch(
          UNRESOLVED_ACTOR,
          HttpStatus.FORBIDDEN,
          "identity_rejected",
          requestedLogicalCells,
          0);
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    try {
      RtmEmsLogAmvService service = requiredService("save_batch");
      RtmEmsLogAmvMutationResultDto result = service.saveBatch(values, actor);
      HttpStatus status = responseStatus(result.status());
      auditBatch(
          actor,
          status,
          safeAuditToken(result.status(), "unknown"),
          requestedLogicalCells,
          result.rows() == null ? 0 : result.rows().size());
      return ResponseEntity.status(status).body(result);
    } catch (RuntimeException exception) {
      auditBatch(
          actor,
          exception instanceof DataAccessException
              ? HttpStatus.SERVICE_UNAVAILABLE
              : HttpStatus.INTERNAL_SERVER_ERROR,
          exception instanceof DataAccessException ? "database_unavailable" : "unexpected_failure",
          requestedLogicalCells,
          0);
      throw exception;
    }
  }

  private HttpStatus responseStatus(String status) {
    return "accepted".equalsIgnoreCase(status) ? HttpStatus.OK : HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private void auditBatch(
      String actor,
      HttpStatus status,
      String outcome,
      int requestedLogicalCells,
      int writtenPhysicalRows) {
    var auditLog = status.isError() ? AUDIT_LOGGER.atWarn() : AUDIT_LOGGER.atInfo();
    auditLog.log(
        "event=lexis_rtm_amv_batch actor={} serverTimestamp={} status={} outcome={} requestedLogicalCells={} writtenPhysicalRows={}",
        actor,
        Instant.now(),
        status.value(),
        outcome,
        Math.max(0, requestedLogicalCells),
        Math.max(0, writtenPhysicalRows));
  }

  private String safeAuditToken(String value, String fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }

    String normalized = value.strip();
    StringBuilder safe = new StringBuilder(Math.min(normalized.length(), 128));
    for (int index = 0; index < normalized.length() && safe.length() < 128; index++) {
      char current = normalized.charAt(index);
      safe.append(
          Character.isLetterOrDigit(current)
                  || current == '.'
                  || current == '-'
                  || current == '_'
                  || current == '@'
                  || current == '\\'
                  || current == ':'
              ? current
              : '_');
    }
    return safe.isEmpty() ? fallback : safe.toString();
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

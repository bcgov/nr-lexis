package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.service.report.LexisReportRequestNormalizer.normalize;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.report.LexisGeneratedReport;
import ca.bc.gov.mof.lexis.service.report.LexisReportCapacityException;
import ca.bc.gov.mof.lexis.service.report.LexisReportGenerationException;
import ca.bc.gov.mof.lexis.service.report.LexisReportOutputLimitException;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.report.LexisReportValidationException;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/lexis/reports")
@Validated
public class LexisReportController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisReportController.class);
  private static final Logger AUDIT_LOGGER =
      LoggerFactory.getLogger("ca.bc.gov.mof.lexis.audit.report");
  private static final String UNRESOLVED_ACTOR = "UNRESOLVED";
  private static final String APPLICATION_REPORT_LIMITER_MESSAGE =
      "Choose at least one Application Report filter before generating: region, jurisdiction, "
          + "exemption reason, client number, growth type, or received date.";

  private final ObjectProvider<LexisReportService> reportServiceProvider;
  private final ProvincialAuthorizationService provincialAuthorizationService;
  private final LexisPrincipalService principalService;

  public LexisReportController(
      ObjectProvider<LexisReportService> reportServiceProvider,
      ProvincialAuthorizationService provincialAuthorizationService,
      LexisPrincipalService principalService) {
    this.reportServiceProvider = reportServiceProvider;
    this.provincialAuthorizationService = provincialAuthorizationService;
    this.principalService = principalService;
  }

  @PostMapping({"/biweeklyListing", "/biweekly-listing"})
  public ResponseEntity<StreamingResponseBody> biweeklyListing(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("biweeklyListing", "biweekly listing", request);
  }

  @PostMapping({"/offerReport", "/offer-report"})
  public ResponseEntity<StreamingResponseBody> offerReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("offerReport", "offer report", request);
  }

  @PostMapping({"/speciesGradeReport", "/species-grade-report"})
  public ResponseEntity<StreamingResponseBody> speciesGradeReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("speciesGradeReport", "species grade report", request);
  }

  @PostMapping({"/exemptionReport", "/exemption-report"})
  public ResponseEntity<StreamingResponseBody> exemptionReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("exemptionReport", "exemption report", request);
  }

  @PostMapping({"/applicationReport", "/application-report"})
  public ResponseEntity<StreamingResponseBody> applicationReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport(
        "applicationReport",
        "application report",
        request,
        null,
        normalizedRequest -> {
          if (!hasApplicationReportLimiter(normalizedRequest.parameters())) {
            throw new LexisReportValidationException(APPLICATION_REPORT_LIMITER_MESSAGE);
          }
          return normalizedRequest;
        });
  }

  @PostMapping({"/approvedExemptionReport", "/approved-exemption-report"})
  public ResponseEntity<StreamingResponseBody> approvedExemptionReport(
      @RequestBody(required = false) LexisReportRequestDto request,
      Authentication authentication) {
    return executeReport(
        "approvedExemptionReport",
        "approved exemption report",
        request,
        authentication,
        normalizedRequest -> {
          String exemptionNumber =
              trimToNull(normalizedRequest.parameters().get("exemptionNumber"));
          if (exemptionNumber == null) {
            throw new LexisReportValidationException("Exemption number is required.");
          }
          provincialAuthorizationService.requireExemption(authentication, exemptionNumber);
          return withParameter(normalizedRequest, "exemptionNumber", exemptionNumber);
        });
  }

  @PostMapping({"/permitReport", "/permit-report"})
  public ResponseEntity<StreamingResponseBody> permitReport(
      @RequestBody(required = false) LexisReportRequestDto request,
      Authentication authentication) {
    return executeReport(
        "permitReport",
        "permit report",
        request,
        authentication,
        normalizedRequest -> {
          Long permitNumber =
              parsePositiveLong(normalizedRequest.parameters().get("permitNumber"));
          if (permitNumber == null) {
            throw new LexisReportValidationException("Permit number must be a positive integer.");
          }
          provincialAuthorizationService.requirePermit(authentication, permitNumber);
          return withParameter(normalizedRequest, "permitNumber", permitNumber.toString());
        });
  }

  @PostMapping({"/permitLedgerReport", "/permit-ledger-report"})
  public ResponseEntity<StreamingResponseBody> permitLedgerReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("permitLedgerReport", "permit ledger report", request);
  }

  @PostMapping({"/feeReport", "/fee-report"})
  public ResponseEntity<StreamingResponseBody> feeReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("feeReport", "fee report", request);
  }

  @PostMapping({"/transportReport", "/transport-report"})
  public ResponseEntity<StreamingResponseBody> transportReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("transportReport", "transport report", request);
  }

  @PostMapping({"/teacReport", "/teac-report"})
  public ResponseEntity<StreamingResponseBody> teacReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("teacReport", "teac report", request);
  }

  @PostMapping({"/tenureReport", "/tenure-report"})
  public ResponseEntity<StreamingResponseBody> tenureReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("tenureReport", "tenure report", request);
  }

  private ResponseEntity<StreamingResponseBody> executeReport(
      String reportAction, String reportLabel, LexisReportRequestDto request) {
    return executeReport(reportAction, reportLabel, request, null, normalized -> normalized);
  }

  private ResponseEntity<StreamingResponseBody> executeReport(
      String reportAction,
      String reportLabel,
      LexisReportRequestDto request,
      Authentication authentication,
      ReportRequestPreparer requestPreparer) {
    ReportAuditContext audit =
        startAudit(reportAction, request, resolveAuthentication(authentication));
    if (!audit.actorResolved()) {
      return completeAudit(
          audit,
          ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).build(),
          null,
          "identity_rejected",
          0);
    }

    try {
      LexisReportRequestDto normalizedRequest = requestPreparer.prepare(normalizeRequest(request));
      return executeNormalizedReport(reportAction, reportLabel, normalizedRequest, audit);
    } catch (LexisReportValidationException exception) {
      completeAudit(
          audit,
          ResponseEntity.badRequest().build(),
          null,
          "validation_failed",
          0);
      throw exception;
    } catch (AccessDeniedException exception) {
      return completeAudit(
          audit,
          ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).build(),
          null,
          "authorization_denied",
          0);
    } catch (RuntimeException exception) {
      completeAudit(
          audit,
          ResponseEntity.internalServerError().build(),
          null,
          "unexpected_failure",
          0);
      throw exception;
    }
  }

  private ResponseEntity<StreamingResponseBody> executeNormalizedReport(
      String reportAction,
      String reportLabel,
      LexisReportRequestDto normalizedRequest,
      ReportAuditContext audit) {
    try {
      LexisReportService reportService = reportServiceProvider.getIfAvailable();
      if (reportService == null) {
        LOGGER.error("Report service unavailable for {}", reportLabel);
        return completeAudit(
            audit,
            reportError(
                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "Report generation is temporarily unavailable."),
            null,
            "service_unavailable",
            0);
      }

      Optional<LexisGeneratedReport> generatedReport =
          reportService.generateReport(reportAction, normalizedRequest);
      if (generatedReport.isEmpty()) {
        return completeAudit(
            audit,
            ResponseEntity.noContent().build(),
            null,
            "no_data",
            0);
      }

      LexisGeneratedReport report = generatedReport.orElseThrow();
      byte[] content = report.content() == null ? new byte[0] : report.content();
      return completeAudit(
          audit,
          toResponse(report),
          effectiveFormat(report, normalizedRequest.format()),
          "generated",
          content.length);
    } catch (LexisReportCapacityException ex) {
      LOGGER.info("Report generation capacity is busy for {}", reportLabel);
      return completeAudit(
          audit,
          reportError(
              org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
              "Report generation is busy. Try again shortly."),
          null,
          "capacity_rejected",
          0);
    } catch (LexisReportOutputLimitException ex) {
      LOGGER.warn("Report output exceeded the configured size limit for {}", reportLabel);
      return completeAudit(
          audit,
          reportError(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE, ex.getMessage()),
          null,
          "output_limit_exceeded",
          0);
    } catch (LexisReportGenerationException ex) {
      LOGGER.error(
          "event=lexis_report operation=generate outcome=failed report={} failureType={}",
          reportLabel,
          exceptionType(ex));
      return completeAudit(
          audit,
          reportError(
              org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
              "Unable to generate the requested report."),
          null,
          "generation_failed",
          0);
    }
  }

  private ReportAuditContext startAudit(
      String reportAction, LexisReportRequestDto request, Authentication authentication) {
    String actor;
    try {
      actor = safeAuditToken(principalService.resolvePrincipalName(authentication));
    } catch (RuntimeException exception) {
      actor = null;
    }
    boolean actorResolved = actor != null;
    if (!actorResolved) {
      actor = UNRESOLVED_ACTOR;
    }
    return new ReportAuditContext(
        actor,
        actorResolved,
        safeAuditToken(reportAction),
        requestedFormat(request),
        System.nanoTime());
  }

  private Authentication resolveAuthentication(Authentication authentication) {
    return authentication != null
        ? authentication
        : SecurityContextHolder.getContext().getAuthentication();
  }

  private String requestedFormat(LexisReportRequestDto request) {
    String format = request == null ? null : trimToNull(request.format());
    if (format == null) {
      return "PDF";
    }
    String normalized = format.toUpperCase(Locale.ROOT);
    return switch (normalized) {
      case "PDF", "CSV", "XLS", "XLSX" -> normalized;
      default -> "INVALID";
    };
  }

  private String effectiveFormat(LexisGeneratedReport report, String requestedFormat) {
    String filename = trimToNull(report.filename());
    if (filename != null) {
      String normalizedFilename = filename.toLowerCase(Locale.ROOT);
      if (normalizedFilename.endsWith(".xlsx")) {
        return "XLSX";
      }
      if (normalizedFilename.endsWith(".xls")) {
        return "XLS";
      }
      if (normalizedFilename.endsWith(".csv")) {
        return "CSV";
      }
      if (normalizedFilename.endsWith(".pdf")) {
        return "PDF";
      }
    }

    String mediaType = trimToNull(report.mediaType());
    if (MediaType.APPLICATION_PDF_VALUE.equalsIgnoreCase(mediaType)) {
      return "PDF";
    }
    if ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        .equalsIgnoreCase(mediaType)) {
      return "XLSX";
    }
    return requestedFormat;
  }

  private ResponseEntity<StreamingResponseBody> completeAudit(
      ReportAuditContext audit,
      ResponseEntity<StreamingResponseBody> response,
      String effectiveFormat,
      String outcome,
      int bytes) {
    AUDIT_LOGGER.info(
        "event=lexis_report actor={} reportAction={} requestedFormat={} effectiveFormat={} status={} outcome={} durationMs={} bytes={}",
        audit.actor(),
        audit.reportAction(),
        audit.requestedFormat(),
        effectiveFormat == null ? "UNAVAILABLE" : effectiveFormat,
        response.getStatusCode().value(),
        outcome,
        Math.max(0L, (System.nanoTime() - audit.startedNanos()) / 1_000_000L),
        Math.max(0, bytes));
    return response;
  }

  private String safeAuditToken(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }

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
    return safe.toString();
  }

  private LexisReportRequestDto normalizeRequest(LexisReportRequestDto request) {
    return normalize(request);
  }

  private LexisReportRequestDto withParameter(
      LexisReportRequestDto request, String name, String value) {
    Map<String, String> parameters = new LinkedHashMap<>(request.parameters());
    parameters.put(name, value);
    return new LexisReportRequestDto(Map.copyOf(parameters), request.format());
  }

  private boolean hasApplicationReportLimiter(Map<String, String> parameters) {
    return hasNonAllRegion(parameters)
        || hasText(parameters, "exportJurisdictionCode")
        || hasText(parameters, "jurisdiction")
        || hasText(parameters, "exemptionReason")
        || hasText(parameters, "clientNumber")
        || hasText(parameters, "growthType")
        || hasText(parameters, "fromDate")
        || hasText(parameters, "toDate");
  }

  private boolean hasNonAllRegion(Map<String, String> parameters) {
    String region = parameters.get("region");
    if (region == null || region.isBlank()) {
      return false;
    }

    for (String value : region.split(",")) {
      String trimmed = value.trim();
      if (!trimmed.isEmpty() && !"0".equals(trimmed)) {
        return true;
      }
    }
    return false;
  }

  private boolean hasText(Map<String, String> parameters, String key) {
    String value = parameters.get(key);
    return value != null && !value.isBlank();
  }

  private ResponseEntity<StreamingResponseBody> toResponse(LexisGeneratedReport report) {
    String filename =
        report.filename() == null || report.filename().isBlank()
            ? "lexis-report.bin"
            : report.filename();
    MediaType mediaType = resolveMediaType(report.mediaType());
    byte[] content = report.content() == null ? new byte[0] : report.content();
    TemporaryReportStreamingBody responseBody;
    try {
      responseBody = TemporaryReportStreamingBody.stage(content);
    } catch (IOException exception) {
      throw new LexisReportGenerationException("Unable to stage the generated report", exception);
    }

    ContentDisposition disposition =
        ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build();

    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
        .contentType(mediaType)
        .contentLength(content.length)
        .body(responseBody);
  }

  private ResponseEntity<StreamingResponseBody> reportError(
      org.springframework.http.HttpStatus status, String message) {
    byte[] content = message.getBytes(StandardCharsets.UTF_8);
    StreamingResponseBody responseBody = outputStream -> outputStream.write(content);
    return ResponseEntity.status(status)
        .contentType(MediaType.TEXT_PLAIN)
        .contentLength(content.length)
        .body(responseBody);
  }

  private MediaType resolveMediaType(String mediaType) {
    if (mediaType == null || mediaType.isBlank()) {
      return MediaType.APPLICATION_OCTET_STREAM;
    }
    try {
      return MediaType.parseMediaType(mediaType);
    } catch (InvalidMediaTypeException ex) {
      return MediaType.APPLICATION_OCTET_STREAM;
    }
  }

  @FunctionalInterface
  private interface ReportRequestPreparer {
    LexisReportRequestDto prepare(LexisReportRequestDto normalizedRequest);
  }

  private record ReportAuditContext(
      String actor,
      boolean actorResolved,
      String reportAction,
      String requestedFormat,
      long startedNanos) {}
}

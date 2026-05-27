package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.service.report.LexisGeneratedReport;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/reports")
@Validated
public class LexisReportController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisReportController.class);

  private final ObjectProvider<LexisReportService> reportServiceProvider;

  public LexisReportController(ObjectProvider<LexisReportService> reportServiceProvider) {
    this.reportServiceProvider = reportServiceProvider;
  }

  @PostMapping({"/biweeklyListing", "/biweekly-listing"})
  public ResponseEntity<byte[]> biweeklyListing(@RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("biweeklyListing", "biweekly listing", request);
  }

  @PostMapping({"/offerReport", "/offer-report"})
  public ResponseEntity<byte[]> offerReport(@RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("offerReport", "offer report", request);
  }

  @PostMapping({"/speciesGradeReport", "/species-grade-report"})
  public ResponseEntity<byte[]> speciesGradeReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("speciesGradeReport", "species grade report", request);
  }

  @PostMapping({"/exemptionReport", "/exemption-report"})
  public ResponseEntity<byte[]> exemptionReport(@RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("exemptionReport", "exemption report", request);
  }

  @PostMapping({"/applicationReport", "/application-report"})
  public ResponseEntity<byte[]> applicationReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("applicationReport", "application report", request);
  }

  @PostMapping({"/approvedExemptionReport", "/approved-exemption-report"})
  public ResponseEntity<byte[]> approvedExemptionReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("approvedExemptionReport", "approved exemption report", request);
  }

  @PostMapping({"/permitReport", "/permit-report"})
  public ResponseEntity<byte[]> permitReport(@RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("permitReport", "permit report", request);
  }

  @PostMapping({"/permitLedgerReport", "/permit-ledger-report"})
  public ResponseEntity<byte[]> permitLedgerReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("permitLedgerReport", "permit ledger report", request);
  }

  @PostMapping({"/feeReport", "/fee-report"})
  public ResponseEntity<byte[]> feeReport(@RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("feeReport", "fee report", request);
  }

  @PostMapping({"/transportReport", "/transport-report"})
  public ResponseEntity<byte[]> transportReport(
      @RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("transportReport", "transport report", request);
  }

  @PostMapping({"/teacReport", "/teac-report"})
  public ResponseEntity<byte[]> teacReport(@RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("teacReport", "teac report", request);
  }

  @PostMapping({"/tenureReport", "/tenure-report"})
  public ResponseEntity<byte[]> tenureReport(@RequestBody(required = false) LexisReportRequestDto request) {
    return executeReport("tenureReport", "tenure report", request);
  }

  private ResponseEntity<byte[]> executeReport(
      String reportAction, String reportLabel, LexisReportRequestDto request) {
    LexisReportService reportService = reportServiceProvider.getIfAvailable();
    if (reportService == null) {
      LOGGER.warn("Report service unavailable - returning no content for {}", reportLabel);
      return ResponseEntity.noContent().build();
    }

    return reportService.generateReport(reportAction, normalizeRequest(request))
        .map(this::toResponse)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  private LexisReportRequestDto normalizeRequest(LexisReportRequestDto request) {
    if (request == null) {
      return new LexisReportRequestDto(Map.of(), "PDF");
    }

    Map<String, String> normalizedParameters =
        request.parameters() == null ? Map.of() : Map.copyOf(request.parameters());
    String normalizedFormat = request.format() == null ? "PDF" : request.format().trim();
    if (normalizedFormat.isEmpty()) {
      normalizedFormat = "PDF";
    }

    return new LexisReportRequestDto(normalizedParameters, normalizedFormat);
  }

  private ResponseEntity<byte[]> toResponse(LexisGeneratedReport report) {
    String filename =
        report.filename() == null || report.filename().isBlank() ? "lexis-report.bin" : report.filename();
    MediaType mediaType = resolveMediaType(report.mediaType());
    byte[] content = report.content() == null ? new byte[0] : report.content();

    ContentDisposition disposition =
        ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build();

    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
        .contentType(mediaType)
        .body(content);
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
}


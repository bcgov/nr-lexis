package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class LegacyReportRouteController {

  private static final String ACTION_VIEW = "view";
  private static final String ACTION_GENERATE = "generate";
  private static final Set<String> LEGACY_REPORT_ACTIONS =
      Set.of(
          "biweeklyListing",
          "offerReport",
          "speciesGradeReport",
          "exemptionReport",
          "applicationReport",
          "approvedExemptionReport",
          "permitReport",
          "permitLedgerReport",
          "feeReport",
          "transportReport",
          "teacReport",
          "tenureReport");

  private final LexisReportController reportController;

  public LegacyReportRouteController(LexisReportController reportController) {
    this.reportController = reportController;
  }

  @RequestMapping(
      path = {
        "/biweeklyListing",
        "/biweeklyListing.do",
        "/offerReport",
        "/offerReport.do",
        "/speciesGradeReport",
        "/speciesGradeReport.do",
        "/exemptionReport",
        "/exemptionReport.do",
        "/applicationReport",
        "/applicationReport.do",
        "/approvedExemptionReport",
        "/approvedExemptionReport.do",
        "/permitReport",
        "/permitReport.do",
        "/permitLedgerReport",
        "/permitLedgerReport.do",
        "/feeReport",
        "/feeReport.do",
        "/transportReport",
        "/transportReport.do",
        "/teacReport",
        "/teacReport.do",
        "/tenureReport",
        "/tenureReport.do"
      },
      method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<byte[]> legacyReport(
      @RequestParam Map<String, String> requestParams,
      @RequestParam MultiValueMap<String, String> multiValueRequestParams,
      HttpServletRequest request) {
    String reportAction = resolveReportAction(request);
    if (reportAction == null) {
      return ResponseEntity.noContent().build();
    }

    String actionMapping = trimToNull(requestParams.get("actionMapping"));
    if (actionMapping == null || ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return ResponseEntity.noContent().build();
    }

    String format = resolveFormat(actionMapping, requestParams.get("outputFormat"));
    if (format == null) {
      return ResponseEntity.noContent().build();
    }

    LexisReportRequestDto requestDto =
        new LexisReportRequestDto(
            normalizeReportParameters(requestParams, multiValueRequestParams), format);
    return dispatch(reportAction, requestDto);
  }

  private ResponseEntity<byte[]> dispatch(String reportAction, LexisReportRequestDto request) {
    return switch (reportAction) {
      case "biweeklyListing" -> reportController.biweeklyListing(request);
      case "offerReport" -> reportController.offerReport(request);
      case "speciesGradeReport" -> reportController.speciesGradeReport(request);
      case "exemptionReport" -> reportController.exemptionReport(request);
      case "applicationReport" -> reportController.applicationReport(request);
      case "approvedExemptionReport" -> reportController.approvedExemptionReport(request);
      case "permitReport" -> reportController.permitReport(request);
      case "permitLedgerReport" -> reportController.permitLedgerReport(request);
      case "feeReport" -> reportController.feeReport(request);
      case "transportReport" -> reportController.transportReport(request);
      case "teacReport" -> reportController.teacReport(request);
      case "tenureReport" -> reportController.tenureReport(request);
      default -> ResponseEntity.noContent().build();
    };
  }

  private String resolveReportAction(HttpServletRequest request) {
    String uri = request == null ? null : request.getRequestURI();
    if (uri == null || uri.isBlank()) {
      return null;
    }

    int slash = uri.lastIndexOf('/');
    String leaf = slash >= 0 ? uri.substring(slash + 1) : uri;
    if (leaf.endsWith(".do")) {
      leaf = leaf.substring(0, leaf.length() - 3);
    }

    return LEGACY_REPORT_ACTIONS.contains(leaf) ? leaf : null;
  }

  private String resolveFormat(String actionMapping, String outputFormat) {
    String normalizedAction = actionMapping.toLowerCase(Locale.ROOT);
    if (normalizedAction.contains("csv")) {
      return "CSV";
    }
    if (normalizedAction.contains("pdf")) {
      return "PDF";
    }

    if (ACTION_GENERATE.equalsIgnoreCase(actionMapping)) {
      String explicitFormat = trimToNull(outputFormat);
      if (explicitFormat == null) {
        // Struts legacy behavior defaulted to CSV when outputFormat was absent.
        return "CSV";
      }
      return explicitFormat.toUpperCase(Locale.ROOT);
    }
    return null;
  }

  private Map<String, String> normalizeReportParameters(
      Map<String, String> requestParams,
      MultiValueMap<String, String> multiValueRequestParams) {
    Map<String, String> normalized = new LinkedHashMap<>();

    requestParams.forEach(
        (key, value) -> {
          if (isControlParam(key)) {
            return;
          }
          String trimmed = trimToNull(value);
          if (trimmed != null) {
            normalized.put(key, trimmed);
          }
        });

    multiValueRequestParams.forEach(
        (key, values) -> {
          if (isControlParam(key) || values == null || values.isEmpty()) {
            return;
          }
          List<String> cleaned =
              values.stream().map(this::trimToNull).filter(v -> v != null).toList();
          if (cleaned.isEmpty()) {
            return;
          }
          if (cleaned.size() == 1) {
            normalized.put(key, cleaned.get(0));
            return;
          }
          normalized.put(key, String.join(",", cleaned));
        });

    return normalized;
  }

  private boolean isControlParam(String key) {
    return "actionMapping".equals(key) || "outputFormat".equals(key);
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}

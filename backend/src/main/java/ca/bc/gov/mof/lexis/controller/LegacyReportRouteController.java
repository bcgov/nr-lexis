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

    String format = resolveFormat(reportAction, actionMapping, requestParams.get("outputFormat"));
    if (format == null) {
      return ResponseEntity.noContent().build();
    }

    Map<String, String> normalizedParameters =
        normalizeReportParameters(reportAction, requestParams, multiValueRequestParams);
    normalizedParameters.put("legacyActionMapping", actionMapping);

    LexisReportRequestDto requestDto =
        new LexisReportRequestDto(normalizedParameters, format);
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

  private String resolveFormat(String reportAction, String actionMapping, String outputFormat) {
    String normalizedAction = actionMapping.toLowerCase(Locale.ROOT);
    if (normalizedAction.contains("csv")) {
      return "CSV";
    }
    if (normalizedAction.contains("pdf")) {
      return "PDF";
    }

    if (ACTION_GENERATE.equalsIgnoreCase(actionMapping) || normalizedAction.startsWith(ACTION_GENERATE)) {
      String explicitFormat = trimToNull(outputFormat);
      if ("tenureReport".equals(reportAction)) {
        return "PDF".equalsIgnoreCase(explicitFormat) ? "PDF" : "XLS";
      }
      if (explicitFormat != null) {
        return explicitFormat.toUpperCase(Locale.ROOT);
      }

      if ("approvedExemptionReport".equals(reportAction) || "permitReport".equals(reportAction)) {
        return "PDF";
      }

      // Struts legacy behavior defaulted to CSV when outputFormat was absent.
      return "CSV";
    }
    return null;
  }

  private Map<String, String> normalizeReportParameters(
      String reportAction,
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
            normalized.put(key, normalizeReportValue(reportAction, key, trimmed));
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
            normalized.put(key, normalizeReportValue(reportAction, key, cleaned.get(0)));
            return;
          }
          normalized.put(key, String.join(",", cleaned));
        });

    return normalized;
  }

  private String normalizeReportValue(String reportAction, String key, String value) {
    if ("clientNumber".equals(key) && shouldNormalizeClientNumber(reportAction)) {
      return normalizeClientNumber(value);
    }
    if (shouldNormalizeUppercase(reportAction, key)) {
      return value.toUpperCase(Locale.ROOT);
    }
    return value;
  }

  private boolean shouldNormalizeClientNumber(String reportAction) {
    return "offerReport".equals(reportAction)
        || "permitLedgerReport".equals(reportAction)
        || "tenureReport".equals(reportAction);
  }

  private boolean shouldNormalizeUppercase(String reportAction, String key) {
    if ("speciesGradeReport".equals(reportAction)) {
      return "timberMark".equals(key) || "forestFileId".equals(key);
    }
    if ("permitLedgerReport".equals(reportAction)) {
      return "timberMark".equals(key);
    }
    if ("tenureReport".equals(reportAction)) {
      return "forestFileId".equals(key)
          || key.matches("tenureType[1-6]")
          || key.matches("timberMark[1-6]");
    }
    return false;
  }

  private String normalizeClientNumber(String value) {
    if (value == null || !value.matches("[0-9.]+")) {
      return value;
    }
    return String.format("%8s", value).replace(' ', '0');
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

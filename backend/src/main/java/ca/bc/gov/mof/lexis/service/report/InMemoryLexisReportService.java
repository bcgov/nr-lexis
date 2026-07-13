package ca.bc.gov.mof.lexis.service.report;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/** Explicitly enabled development stub; its UTF-8 diagnostic payloads are not real report files. */
@Service
@Profile("stub-reports & !oracle")
public class InMemoryLexisReportService implements LexisReportService {

  private static final String DEFAULT_FORMAT = "PDF";

  @Override
  public Optional<LexisGeneratedReport> generateReport(String reportAction, LexisReportRequestDto request) {
    String normalizedAction = normalizeReportAction(reportAction);
    LexisReportRequestDto normalizedRequest = normalizeRequest(request);
    String normalizedFormat = normalizedRequest.format().toUpperCase(Locale.ROOT);
    String extension = resolveExtension(normalizedFormat);
    String mediaType = resolveMediaType(extension);

    byte[] content =
        buildStubBody(normalizedAction, normalizedFormat, normalizedRequest.parameters())
            .getBytes(StandardCharsets.UTF_8);

    return Optional.of(new LexisGeneratedReport(normalizedAction + "." + extension, mediaType, content));
  }

  private LexisReportRequestDto normalizeRequest(LexisReportRequestDto request) {
    if (request == null) {
      return new LexisReportRequestDto(Map.of(), DEFAULT_FORMAT);
    }

    Map<String, String> parameters = request.parameters() == null ? Map.of() : Map.copyOf(request.parameters());
    String format = LexisReportFormat.fromNullable(request.format()).name();
    return new LexisReportRequestDto(parameters, format);
  }

  private String normalizeReportAction(String reportAction) {
    if (reportAction == null || reportAction.isBlank()) {
      return "report";
    }
    return reportAction.trim();
  }

  private String resolveExtension(String format) {
    return switch (format) {
      case "CSV" -> "csv";
      case "XLS", "XLSX" -> "xlsx";
      case "DOC", "DOCX" -> "docx";
      case "RTF" -> "rtf";
      default -> "pdf";
    };
  }

  private String resolveMediaType(String extension) {
    return switch (extension) {
      case "csv" -> "application/vnd.ms-excel";
      case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "rtf" -> "application/rtf";
      default -> "application/pdf";
    };
  }

  private String buildStubBody(String action, String format, Map<String, String> parameters) {
    LinkedHashMap<String, String> orderedParameters = new LinkedHashMap<>();
    TreeMap<String, String> sorted = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
    sorted.putAll(parameters);
    orderedParameters.putAll(sorted);

    StringBuilder body = new StringBuilder();
    body.append("LEXIS report stub").append('\n');
    body.append("mode=stub-reports").append('\n');
    body.append("reportAction=").append(action).append('\n');
    body.append("format=").append(format).append('\n');

    if (orderedParameters.isEmpty()) {
      body.append("parameters=<none>").append('\n');
      return body.toString();
    }

    for (Map.Entry<String, String> entry : orderedParameters.entrySet()) {
      body.append("parameter.")
          .append(entry.getKey())
          .append("=")
          .append(entry.getValue())
          .append('\n');
    }
    return body.toString();
  }
}

package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.service.report.ReportParameterUtils.firstNonBlank;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.data.JRMapCollectionDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLegacyJasperTableReportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleLegacyJasperTableReportService.class);
  private static final int MAX_COLUMNS = 12;
  private static final int DIRECT_COLUMNS_WHEN_OVERFLOWING = MAX_COLUMNS - 1;
  private static final String OVERFLOW_COLUMN_HEADER = "Additional Columns";
  private static final String TEMPLATE_CLASSPATH = "reports/lexis/LEXIS_DYNAMIC_TABLE.jrxml";

  private final OracleLegacyCsvReportService legacyCsvReportService;
  private volatile JasperReport compiledTemplate;

  public OracleLegacyJasperTableReportService(OracleLegacyCsvReportService legacyCsvReportService) {
    this.legacyCsvReportService = legacyCsvReportService;
  }

  public Optional<LexisGeneratedReport> generateLegacyPdfReport(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request,
      LexisReportFormat format) {
    if (format != LexisReportFormat.PDF || !supportsPdfMigration(definition)) {
      return Optional.empty();
    }

    Optional<LegacyTabularReportData> dataOptional =
        legacyCsvReportService.loadLegacyTabularReportData(definition, request);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    LegacyTabularReportData data = dataOptional.orElseThrow();
    Map<String, Object> parameters = buildTemplateParameters(definition, request, data);
    JRMapCollectionDataSource dataSource = new JRMapCollectionDataSource(buildRowMaps(data));

    try {
      byte[] pdfBytes = renderPdf(parameters, dataSource);
      return Optional.of(
          new LexisGeneratedReport(
              definition.resolveFilename(LexisReportFormat.PDF),
              LexisReportFormat.PDF.mediaType(),
              pdfBytes));
    } catch (JRException ex) {
      LOGGER.warn(
          "Failed to generate migrated legacy PDF table for action [{}]: {}",
          definition.action(),
          ex.getMessage());
      return Optional.empty();
    }
  }

  byte[] renderPdf(Map<String, Object> parameters, JRMapCollectionDataSource dataSource)
      throws JRException {
    JasperPrint print = JasperFillManager.fillReport(getOrCompileTemplate(), parameters, dataSource);
    return JasperExportManager.exportReportToPdf(print);
  }

  private boolean supportsPdfMigration(LexisJasperReportDefinition definition) {
    return definition == LexisJasperReportDefinition.TEAC_REPORT
        || definition == LexisJasperReportDefinition.SPECIES_GRADE_REPORT
        || definition == LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT;
  }

  private JasperReport getOrCompileTemplate() throws JRException {
    JasperReport current = compiledTemplate;
    if (current != null) {
      return current;
    }

    synchronized (this) {
      if (compiledTemplate != null) {
        return compiledTemplate;
      }

      ClassPathResource templateResource = new ClassPathResource(TEMPLATE_CLASSPATH);
      if (!templateResource.exists()) {
        throw new JRException("Missing Jasper template: " + TEMPLATE_CLASSPATH);
      }

      try (InputStream inputStream = templateResource.getInputStream()) {
        compiledTemplate = JasperCompileManager.compileReport(inputStream);
      } catch (IOException ex) {
        throw new JRException("Unable to load Jasper template: " + TEMPLATE_CLASSPATH, ex);
      }

      return compiledTemplate;
    }
  }

  Map<String, Object> buildTemplateParameters(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request,
      LegacyTabularReportData data) {
    Map<String, Object> parameters = new HashMap<>();
    parameters.put("REPORT_TITLE", titleFor(definition));
    parameters.put("REPORT_SUBTITLE", subtitleFor(definition, request));
    parameters.put("REPORT_GENERATED_DATE", LocalDate.now().toString());
    parameters.put("P_COLUMN_COUNT", Math.min(data.columnHeaders().size(), MAX_COLUMNS));

    boolean overflowColumns = data.columnHeaders().size() > MAX_COLUMNS;
    if (overflowColumns) {
      LOGGER.warn(
          "Collapsing legacy Jasper table columns from [{}] to [{}] plus overflow for action [{}]",
          data.columnHeaders().size(),
          DIRECT_COLUMNS_WHEN_OVERFLOWING,
          definition.action());
    }

    for (int index = 1; index <= MAX_COLUMNS; index++) {
      String header;
      if (overflowColumns && index == MAX_COLUMNS) {
        header = OVERFLOW_COLUMN_HEADER;
      } else {
        header = index <= data.columnHeaders().size() ? data.columnHeaders().get(index - 1) : "";
      }
      parameters.put("P_COL_HEADER_" + index, header);
    }

    return parameters;
  }

  List<Map<String, ?>> buildRowMaps(LegacyTabularReportData data) {
    List<Map<String, ?>> result = new ArrayList<>(data.rows().size());
    boolean overflowColumns = data.columnHeaders().size() > MAX_COLUMNS;
    for (List<String> row : data.rows()) {
      Map<String, Object> mappedRow = new HashMap<>();
      for (int index = 1; index <= MAX_COLUMNS; index++) {
        String value;
        if (overflowColumns && index == MAX_COLUMNS) {
          value = overflowColumns(data.columnHeaders(), row);
        } else {
          value = index <= row.size() ? row.get(index - 1) : "";
        }
        mappedRow.put("COL_" + index, sanitizeCellValue(value));
      }
      result.add(mappedRow);
    }
    return result;
  }

  private String overflowColumns(List<String> headers, List<String> row) {
    List<String> values = new ArrayList<>();
    for (int index = DIRECT_COLUMNS_WHEN_OVERFLOWING; index < headers.size(); index++) {
      String header = sanitizeCellValue(headers.get(index));
      String value = index < row.size() ? sanitizeCellValue(row.get(index)) : "";
      values.add((header.isBlank() ? "Column " + (index + 1) : header) + "=" + value);
    }
    return String.join("; ", values);
  }

  private String sanitizeCellValue(String raw) {
    if (raw == null) {
      return "";
    }
    return raw
        .replace('\r', ' ')
        .replace('\n', ' ')
        .replace('\f', ' ')
        .strip();
  }

  private String titleFor(LexisJasperReportDefinition definition) {
    return switch (definition) {
      case TEAC_REPORT -> "Create TEAC Package";
      case SPECIES_GRADE_REPORT -> "Species and Grade Report";
      case APPROVED_EXEMPTION_REPORT -> "Approved Exemption Report";
      default -> "LEXIS Report";
    };
  }

  private String subtitleFor(LexisJasperReportDefinition definition, LexisReportRequestDto request) {
    Map<String, String> parameters = request == null || request.parameters() == null ? Map.of() : request.parameters();

    if (definition == LexisJasperReportDefinition.TEAC_REPORT) {
      String jurisdiction = firstNonBlank(parameters, "exportJurisdictionCode", "jurisdiction");
      String jurisdictionLabel =
          firstNonBlank(parameters, "exportJurisdictionCodeLabel", "jurisdictionLabel");
      String listingDate = firstNonBlank(parameters, "exportScheduleLabel", "exportSchedule");
      String region = firstNonBlank(parameters, "regionLabel", "region");
      return "Jurisdiction: "
          + normalizeJurisdiction(jurisdiction, jurisdictionLabel)
          + " | Schedule: "
          + normalizeValue(listingDate)
          + " | Region: "
          + normalizeValue(region);
    }

    if (definition == LexisJasperReportDefinition.SPECIES_GRADE_REPORT) {
      String fromDate = firstNonBlank(parameters, "fromDate");
      String toDate = firstNonBlank(parameters, "toDate");
      String region = firstNonBlank(parameters, "regionLabel", "region");
      return "From: "
          + normalizeValue(fromDate)
          + " | To: "
          + normalizeValue(toDate)
          + " | Region: "
          + normalizeValue(region)
          + " | Permit Status: "
          + normalizeValue(firstNonBlank(parameters, "permitStatusLabel", "permitStatus"))
          + " | Exemption: "
          + normalizeValue(firstNonBlank(parameters, "exemptionNumber"))
          + " | Type: "
          + normalizeValue(firstNonBlank(parameters, "exemptionTypeLabel", "exemptionType"))
          + " | Reason: "
          + normalizeValue(firstNonBlank(parameters, "exemptionReasonLabel", "exemptionReason"))
          + " | Growth: "
          + normalizeValue(firstNonBlank(parameters, "growthTypeLabel", "growthType"))
          + " | Timber Mark: "
          + normalizeValue(firstNonBlank(parameters, "timberMark"))
          + " | Forest File: "
          + normalizeValue(firstNonBlank(parameters, "forestFileId"));
    }

    if (definition == LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT) {
      return "Exemption Number: " + normalizeValue(firstNonBlank(parameters, "exemptionNumber"));
    }

    return "";
  }

  private String normalizeJurisdiction(String code, String label) {
    if (label != null && !label.isBlank()) {
      return label.trim();
    }
    if ("P".equalsIgnoreCase(code)) {
      return "Provincial";
    }
    if ("F".equalsIgnoreCase(code)) {
      return "Federal";
    }
    return normalizeValue(code);
  }

  private String normalizeValue(String value) {
    if (value == null || value.isBlank()) {
      return "All";
    }
    String trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return trimmed.substring(1, trimmed.length() - 1).replace(" ", "");
    }
    return trimmed;
  }
}

package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.service.report.ReportParameterUtils.firstNonBlank;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.sf.jasperreports.engine.JRDataSource;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JRField;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
  private final LexisReportResourceManager reportResources;
  private volatile JasperReport compiledTemplate;

  public OracleLegacyJasperTableReportService(OracleLegacyCsvReportService legacyCsvReportService) {
    this(legacyCsvReportService, LexisReportResourceManager.defaults());
  }

  @Autowired
  public OracleLegacyJasperTableReportService(
      OracleLegacyCsvReportService legacyCsvReportService,
      LexisReportResourceManager reportResources) {
    this.legacyCsvReportService = legacyCsvReportService;
    this.reportResources = reportResources;
  }

  public Optional<LexisGeneratedReport> generateLegacyPdfReport(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request,
      LexisReportFormat format) {
    if (format != LexisReportFormat.PDF || !supportsPdfMigration(definition)) {
      return Optional.empty();
    }

    Map<String, Object> parameters = new HashMap<>();
    try {
      try (LexisReportResourceManager.JasperVirtualizerSession ignored =
          reportResources.openVirtualizer(parameters)) {
        Optional<JasperPrint> print =
            legacyCsvReportService.withLegacyTabularReportCursor(
                definition,
                request,
                resultSet -> {
                  LegacyResultSetDataSource dataSource =
                      new LegacyResultSetDataSource(resultSet);
                  parameters.putAll(
                      buildTemplateParameters(
                          definition, request, dataSource.columnHeaders()));
                  return JasperFillManager.getInstance(reportResources.jasperReportsContext())
                      .fill(getOrCompileTemplate(), parameters, dataSource);
                });
        if (print.isEmpty()) {
          return Optional.empty();
        }

        try (LexisReportArtifact artifact = reportResources.createArtifact()) {
          exportPdf(print.orElseThrow(), artifact.outputStream());
          return Optional.of(
              artifact.complete(
                  definition.resolveFilename(LexisReportFormat.PDF),
                  LexisReportFormat.PDF.mediaType()));
        }
      }
    } catch (JRException ex) {
      LOGGER.error(
          "event=lexis_report operation=migrated_table_render outcome=failed action={} failureType={}",
          definition.action(),
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The migrated report could not be rendered for " + definition.action(), ex);
    } catch (IOException ex) {
      LOGGER.error(
          "event=lexis_report operation=migrated_table_artifact outcome=failed action={} failureType={}",
          definition.action(),
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The migrated report could not be stored for " + definition.action(), ex);
    }
  }

  void exportPdf(JasperPrint print, OutputStream output) throws JRException {
    JasperExportManager.exportReportToPdfStream(print, output);
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
      List<String> columnHeaders) {
    Map<String, Object> parameters = new HashMap<>();
    parameters.put("REPORT_TITLE", titleFor(definition));
    parameters.put("REPORT_SUBTITLE", subtitleFor(definition, request));
    parameters.put("REPORT_GENERATED_DATE", LexisBusinessTime.today().toString());
    parameters.put("P_COLUMN_COUNT", Math.min(columnHeaders.size(), MAX_COLUMNS));

    boolean overflowColumns = columnHeaders.size() > MAX_COLUMNS;
    if (overflowColumns) {
      LOGGER.warn(
          "Collapsing legacy Jasper table columns from [{}] to [{}] plus overflow for action [{}]",
          columnHeaders.size(),
          DIRECT_COLUMNS_WHEN_OVERFLOWING,
          definition.action());
    }

    for (int index = 1; index <= MAX_COLUMNS; index++) {
      String header;
      if (overflowColumns && index == MAX_COLUMNS) {
        header = OVERFLOW_COLUMN_HEADER;
      } else {
        header = index <= columnHeaders.size() ? columnHeaders.get(index - 1) : "";
      }
      parameters.put("P_COL_HEADER_" + index, header);
    }

    return parameters;
  }

  String overflowColumns(List<String> headers, List<String> row) {
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

  private final class LegacyResultSetDataSource implements JRDataSource {

    private final ResultSet resultSet;
    private final List<String> columnHeaders;
    private final String[] currentRow;

    private LegacyResultSetDataSource(ResultSet resultSet) throws SQLException {
      this.resultSet = resultSet;
      ResultSetMetaData metadata = resultSet.getMetaData();
      int columnCount = metadata.getColumnCount();
      this.columnHeaders = new ArrayList<>(columnCount);
      this.currentRow = new String[columnCount];
      for (int index = 1; index <= columnCount; index++) {
        columnHeaders.add(metadata.getColumnName(index));
      }
    }

    private List<String> columnHeaders() {
      return columnHeaders;
    }

    @Override
    public boolean next() throws JRException {
      try {
        if (!resultSet.next()) {
          return false;
        }
        for (int index = 1; index <= currentRow.length; index++) {
          currentRow[index - 1] = sanitizeCellValue(resultSet.getString(index));
        }
        return true;
      } catch (SQLException exception) {
        throw new JRException("Unable to read the legacy report cursor", exception);
      }
    }

    @Override
    public Object getFieldValue(JRField field) {
      String fieldName = field == null ? null : field.getName();
      if (fieldName == null || !fieldName.startsWith("COL_")) {
        return "";
      }

      int outputColumn;
      try {
        outputColumn = Integer.parseInt(fieldName.substring("COL_".length()));
      } catch (NumberFormatException exception) {
        return "";
      }
      if (outputColumn < 1 || outputColumn > MAX_COLUMNS) {
        return "";
      }

      boolean overflowColumns = columnHeaders.size() > MAX_COLUMNS;
      if (overflowColumns && outputColumn == MAX_COLUMNS) {
        return overflowColumns(columnHeaders, List.of(currentRow));
      }
      return outputColumn <= currentRow.length ? currentRow[outputColumn - 1] : "";
    }
  }
}

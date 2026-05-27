package ca.bc.gov.mof.lexis.service.report;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLegacyCsvReportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleLegacyCsvReportService.class);
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER = DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private static final String SPECIES_GRADE_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.SPECIES_GRADE_REPORT_CSV(?,?,?,?,?,?,?,?,?,?,?) }";
  private static final String PROVINCIAL_TEAC_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.PROVINCIAL_TEAC_REPORT(?,?,?) }";
  private static final String FEDERAL_TEAC_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.FEDERAL_TEAC_REPORT(?,?,?) }";

  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String JURISDICTION_FEDERAL = "F";

  private final DataSource dataSource;

  public OracleLegacyCsvReportService(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  public Optional<LexisGeneratedReport> generateLegacyCsvReport(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request,
      LexisReportFormat format) {
    if (format == LexisReportFormat.PDF) {
      return Optional.empty();
    }

    return switch (definition) {
      case SPECIES_GRADE_REPORT -> generateSpeciesGradeCsv(request);
      case TEAC_REPORT -> generateTeacCsv(request);
      default -> Optional.empty();
    };
  }

  private Optional<LexisGeneratedReport> generateSpeciesGradeCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    byte[] content =
        executeCursorProcedure(
            SPECIES_GRADE_CSV_PROCEDURE,
            cs -> {
              cs.setDate(1, toSqlDate(first(parameters, "fromDate")));
              cs.setDate(2, toSqlDate(first(parameters, "toDate")));
              setNullableString(cs, 3, csvValue(parameters, "region"));
              setNullableString(cs, 4, emptyToNull(first(parameters, "permitStatus")));
              setNullableString(cs, 5, emptyToNull(first(parameters, "exemptionNumber")));
              setNullableString(cs, 6, emptyToNull(first(parameters, "exemptionType")));
              setNullableString(cs, 7, emptyToNull(first(parameters, "exemptionReason")));
              setNullableString(cs, 8, emptyToNull(first(parameters, "growthType")));
              setNullableString(cs, 9, emptyToNull(first(parameters, "timberMark")));
              setNullableString(cs, 10, emptyToNull(first(parameters, "forestFileId")));
            },
            11);

    if (content == null) {
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateTeacCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);

    String jurisdiction = normalize(first(parameters, "exportJurisdictionCode", "jurisdiction"));
    String procedureCall;
    if (JURISDICTION_PROVINCIAL.equalsIgnoreCase(jurisdiction)) {
      procedureCall = PROVINCIAL_TEAC_CSV_PROCEDURE;
    } else if (JURISDICTION_FEDERAL.equalsIgnoreCase(jurisdiction)) {
      procedureCall = FEDERAL_TEAC_CSV_PROCEDURE;
    } else {
      LOGGER.warn("TEAC CSV request missing recognized jurisdiction: [{}]", jurisdiction);
      return Optional.empty();
    }

    byte[] content =
        executeCursorProcedure(
            procedureCall,
            cs -> {
              setNullableString(cs, 1, csvValue(parameters, "region"));
              cs.setLong(2, parseLongOrZero(first(parameters, "exportSchedule")));
            },
            3);

    if (content == null) {
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.TEAC_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private byte[] executeCursorProcedure(
      String procedureCall,
      SqlStatementBinder binder,
      int cursorOutIndex) {
    try (Connection connection = dataSource.getConnection();
        CallableStatement cs = connection.prepareCall(procedureCall)) {
      binder.bind(cs);
      cs.registerOutParameter(cursorOutIndex, Types.REF_CURSOR);
      cs.execute();

      try (ResultSet rs = (ResultSet) cs.getObject(cursorOutIndex)) {
        if (rs == null) {
          return null;
        }
        return renderCsv(rs);
      }
    } catch (SQLException | IOException ex) {
      LOGGER.warn("CSV report procedure failed [{}]: {}", procedureCall, ex.getMessage());
      return null;
    }
  }

  private byte[] renderCsv(ResultSet rs) throws SQLException, IOException {
    ResultSetMetaData meta = rs.getMetaData();
    int columnCount = meta.getColumnCount();

    ByteArrayOutputStream output = new ByteArrayOutputStream(16 * 1024);
    writeCsvRow(output, columnCount, index -> meta.getColumnName(index));

    while (rs.next()) {
      writeCsvRow(
          output,
          columnCount,
          index -> {
            String value = rs.getString(index);
            return value == null ? "" : value;
          });
    }

    return output.toByteArray();
  }

  private void writeCsvRow(ByteArrayOutputStream output, int columnCount, CsvValueResolver resolver)
      throws IOException, SQLException {
    for (int index = 1; index <= columnCount; index++) {
      String value = sanitizeForCsv(resolver.resolve(index));
      output.write('"');
      output.write(value.getBytes(StandardCharsets.UTF_8));
      output.write('"');
      if (index < columnCount) {
        output.write(',');
      }
    }
    output.write('\n');
  }

  private String sanitizeForCsv(String input) {
    if (input == null) {
      return "";
    }
    return input.replace("\"", "\"\"").replace("\n", "").replace("\r", "").replace("\f", "");
  }

  private Map<String, String> requestParameters(LexisReportRequestDto request) {
    if (request == null || request.parameters() == null) {
      return Map.of();
    }
    return request.parameters();
  }

  private String first(Map<String, String> parameters, String... keys) {
    for (String key : keys) {
      if (parameters.containsKey(key)) {
        return parameters.get(key);
      }
    }
    return null;
  }

  private String csvValue(Map<String, String> parameters, String... keys) {
    for (String key : keys) {
      String value = first(parameters, key);
      if (value == null) {
        continue;
      }
      String normalized = normalizeCsv(value);
      if (!normalized.isEmpty()) {
        return normalized;
      }
    }
    return null;
  }

  private String normalizeCsv(String value) {
    String normalized = normalize(value);
    if (normalized == null) {
      return "";
    }

    if (normalized.startsWith("[") && normalized.endsWith("]")) {
      normalized = normalized.substring(1, normalized.length() - 1);
    }

    String[] parts = normalized.split(",");
    StringBuilder builder = new StringBuilder();
    for (String part : parts) {
      String trimmed = normalize(part);
      if (trimmed == null) {
        continue;
      }
      if (builder.length() > 0) {
        builder.append(',');
      }
      builder.append(trimmed);
    }

    return builder.toString();
  }

  private String normalize(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String emptyToNull(String value) {
    return normalize(value);
  }

  private java.sql.Date toSqlDate(String value) {
    LocalDate localDate = parseDate(value);
    return localDate == null ? null : java.sql.Date.valueOf(localDate);
  }

  private LocalDate parseDate(String raw) {
    String value = normalize(raw);
    if (value == null) {
      return null;
    }

    try {
      return LocalDate.parse(value);
    } catch (DateTimeParseException ignored) {
      // Fall through.
    }

    try {
      return LocalDate.parse(value, LEGACY_DATE_FORMATTER);
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  private long parseLongOrZero(String raw) {
    String value = normalize(raw);
    if (value == null) {
      return 0L;
    }
    try {
      return Long.parseLong(value);
    } catch (NumberFormatException ex) {
      return 0L;
    }
  }

  private void setNullableString(CallableStatement cs, int index, String value) throws SQLException {
    if (value == null || value.isEmpty()) {
      cs.setNull(index, Types.VARCHAR);
      return;
    }
    cs.setString(index, value);
  }

  @FunctionalInterface
  private interface SqlStatementBinder {
    void bind(CallableStatement cs) throws SQLException;
  }

  @FunctionalInterface
  private interface CsvValueResolver {
    String resolve(int index) throws SQLException;
  }
}

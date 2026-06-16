package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.service.report.ReportParameterUtils.first;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.sql.Array;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import oracle.jdbc.OracleConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLegacyCsvReportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleLegacyCsvReportService.class);
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER = DateTimeFormatter.ofPattern("MM/dd/yyyy");
  private static final String STRING_ARRAY_TYPE = "CBR_VARCHAR2_ARRAY";

  private static final String SPECIES_GRADE_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.SPECIES_GRADE_REPORT_CSV(?,?,?,?,?,?,?,?,?,?,?) }";
  private static final String PROVINCIAL_TEAC_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.PROVINCIAL_TEAC_REPORT(?,?,?) }";
  private static final String FEDERAL_TEAC_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.FEDERAL_TEAC_REPORT(?,?,?) }";
  private static final String APPLICATION_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.APP_REPORT_CSV(?,?,?,?) }";
  private static final String OFFERS_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.OFFERS_REPORT_CSV(?,?,?,?) }";
  private static final String FEE_SUMMARY_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.FEE_SUMMARY_RPT_CSV(?,?,?,?) }";
  private static final String BIWEEKLY_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.BIWEEKLY_REPORT_CSV(?,?,?,?) }";
  private static final String TRANSPORT_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.TRANSPORT_REPORT_CSV(?,?,?,?) }";
  private static final String EXEMPTIONS_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.EXEMPTION_LEDGER_RPT_CSV(?,?,?,?) }";
  private static final String PERMIT_LEDGER_CSV_PROCEDURE =
      "{ call LEXIS_REPORTING.PERMIT_LEDGER_REPORT(?,?,?,?,?,?,?,?,?,?,?,?) }";
  private static final String APPROVED_EXEMPTION_PROCEDURE =
      "{ call LEXIS_GROUP_5.FIND_EXEMPTION_BY_NUMBER(?,?) }";

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
    if (format != LexisReportFormat.CSV) {
      return Optional.empty();
    }

    return switch (definition) {
      case SPECIES_GRADE_REPORT -> generateSpeciesGradeCsv(request);
      case TEAC_REPORT -> generateTeacCsv(request);
      case APPLICATION_REPORT -> generateApplicationCsv(request);
      case OFFER_REPORT -> generateOfferCsv(request);
      case EXEMPTION_REPORT -> generateExemptionCsv(request);
      case FEE_REPORT -> generateFeeCsv(request);
      case BIWEEKLY_LISTING -> generateBiweeklyCsv(request);
      case TRANSPORT_REPORT -> generateTransportCsv(request);
      case PERMIT_LEDGER_REPORT -> generatePermitLedgerCsv(request);
      default -> Optional.empty();
    };
  }

  public Optional<LegacyTabularReportData> loadLegacyTabularReportData(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request) {
    return switch (definition) {
      case SPECIES_GRADE_REPORT -> loadSpeciesGradeData(request);
      case TEAC_REPORT -> loadTeacData(request);
      case APPROVED_EXEMPTION_REPORT -> loadApprovedExemptionData(request);
      default -> Optional.empty();
    };
  }

  private Optional<LexisGeneratedReport> generateSpeciesGradeCsv(LexisReportRequestDto request) {
    Optional<LegacyTabularReportData> dataOptional = loadSpeciesGradeData(request);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render species grade CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateTeacCsv(LexisReportRequestDto request) {
    Optional<LegacyTabularReportData> dataOptional = loadTeacData(request);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render TEAC CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.TEAC_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LegacyTabularReportData> loadSpeciesGradeData(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    return executeCursorProcedure(
        SPECIES_GRADE_CSV_PROCEDURE,
        cs -> {
          cs.setDate(1, toSqlDate(first(parameters, "fromDate")));
          cs.setDate(2, toSqlDate(first(parameters, "toDate")));
          setNullableString(cs, 3, csvValue(parameters, "region"));
          setNullableString(cs, 4, emptyToNull(first(parameters, "exemptionNumber")));
          setNullableString(cs, 5, emptyToNull(first(parameters, "exemptionType")));
          setNullableString(cs, 6, emptyToNull(first(parameters, "exemptionReason")));
          setNullableString(cs, 7, emptyToNull(first(parameters, "growthType")));
          setNullableString(cs, 8, emptyToNull(first(parameters, "timberMark")));
          setNullableString(cs, 9, emptyToNull(first(parameters, "forestFileId")));
          setNullableString(cs, 10, emptyToNull(first(parameters, "permitStatus")));
        },
        11);
  }

  private Optional<LegacyTabularReportData> loadTeacData(LexisReportRequestDto request) {
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

    return executeCursorProcedure(
        procedureCall,
        cs -> {
          setNullableString(cs, 1, csvValue(parameters, "region"));
          cs.setLong(2, parseLongOrZero(first(parameters, "exportSchedule")));
        },
        3);
  }

  private Optional<LegacyTabularReportData> loadApprovedExemptionData(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    String exemptionNumber = emptyToNull(first(parameters, "exemptionNumber"));
    if (exemptionNumber == null) {
      LOGGER.warn("Approved exemption report request missing exemptionNumber");
      return Optional.empty();
    }

    return executeCursorProcedure(
        APPROVED_EXEMPTION_PROCEDURE,
        cs -> setNullableString(cs, 1, exemptionNumber),
        2);
  }

  private Optional<LexisGeneratedReport> generateApplicationCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildApplicationWhere(parameters);
    Optional<LegacyTabularReportData> dataOptional =
        executeDynamicCursorProcedure(APPLICATION_CSV_PROCEDURE, where);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render application CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.APPLICATION_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateOfferCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildOfferWhere(parameters);
    Optional<LegacyTabularReportData> dataOptional =
        executeDynamicCursorProcedure(OFFERS_CSV_PROCEDURE, where);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render offer CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.OFFER_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateFeeCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildFeeWhere(parameters);
    Optional<LegacyTabularReportData> dataOptional =
        executeDynamicCursorProcedure(FEE_SUMMARY_CSV_PROCEDURE, where);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render fee CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.FEE_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generatePermitLedgerCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    Optional<LegacyTabularReportData> dataOptional =
        executeCursorProcedure(
            PERMIT_LEDGER_CSV_PROCEDURE,
            cs -> {
              setNullableString(cs, 1, nullIfBlank(first(parameters, "fromDate")));
              setNullableString(cs, 2, nullIfBlank(first(parameters, "toDate")));
              setNullableString(cs, 3, nullIfBlank(first(parameters, "clientNumber")));
              setNullableString(cs, 4, defaultIfBlank(csvValue(parameters, "region"), "0"));
              setNullableString(cs, 5, nullIfBlank(first(parameters, "exemptionNumber")));
              setNullableString(cs, 6, nullIfBlank(first(parameters, "permitStatus")));
              setNullableString(cs, 7, nullIfBlank(first(parameters, "exemptionType")));
              setNullableString(cs, 8, nullIfBlank(first(parameters, "exemptionReason")));
              setNullableString(cs, 9, nullIfBlank(first(parameters, "growthType")));
              setNullableString(cs, 10, nullIfBlank(first(parameters, "timberMark")));
              setNullableString(cs, 11, nullIfBlank(first(parameters, "destinationCountry")));
            },
            12);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render permit ledger CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.PERMIT_LEDGER_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateBiweeklyCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildBiweeklyWhere(parameters);
    Optional<LegacyTabularReportData> dataOptional =
        executeDynamicCursorProcedure(BIWEEKLY_CSV_PROCEDURE, where);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render biweekly CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.BIWEEKLY_LISTING.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateTransportCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildTransportWhere(parameters);
    Optional<LegacyTabularReportData> dataOptional =
        executeDynamicCursorProcedure(TRANSPORT_CSV_PROCEDURE, where);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render transport CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.TRANSPORT_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateExemptionCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildExemptionWhere(parameters);
    Optional<LegacyTabularReportData> dataOptional =
        executeDynamicCursorProcedure(EXEMPTIONS_CSV_PROCEDURE, where);
    if (dataOptional.isEmpty()) {
      return Optional.empty();
    }

    byte[] content;
    try {
      content = renderCsv(dataOptional.orElseThrow());
    } catch (IOException ex) {
      LOGGER.warn("Unable to render exemption CSV: {}", ex.getMessage());
      return Optional.empty();
    }

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.EXEMPTION_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private DynamicWhere buildApplicationWhere(Map<String, String> parameters) {
    DynamicWhereBuilder where = new DynamicWhereBuilder();
    where.addDateRange(
        "EEA.RECEIVED_DATE",
        defaultDate(first(parameters, "fromDate"), "0001-01-01"),
        defaultDate(first(parameters, "toDate"), "9999-12-31"));
    where.addNumericOrGroup("EEA.ORG_UNIT_NO", csvPartsExceptAllRegion(parameters, "region"));
    where.addLike("EEA.EXPORT_JURISDICTION_CODE", first(parameters, "exportJurisdictionCode", "jurisdiction"));
    where.addNotEquals("EEA.EXPORT_JURISDICTION_CODE", "I");
    where.addLike("EEA.OWNER_CLIENT_NUMBER", first(parameters, "clientNumber"));
    where.addLike("EEA.EXPORT_GROWTH_TYPE_CODE", first(parameters, "growthType"));
    where.addLike("EEA.EXPORT_EXEMPTION_REASON_CODE", first(parameters, "exemptionReason"));
    return where.build();
  }

  private DynamicWhere buildOfferWhere(Map<String, String> parameters) {
    DynamicWhereBuilder where = new DynamicWhereBuilder();
    where.addDateRange(
        "EEA.APPLICATION_DATE",
        defaultDate(first(parameters, "fromDate"), "0001-01-01"),
        defaultDate(first(parameters, "toDate"), "9999-12-31"));
    where.addNumericOrGroup("EEA.ORG_UNIT_NO", csvParts(parameters, "region"));
    where.addLike("EEA.OWNER_CLIENT_NUMBER", first(parameters, "clientNumber"));
    where.addLike("EEA.EXPORT_JURISDICTION_CODE", first(parameters, "exportJurisdictionCode", "jurisdiction"));
    return where.build();
  }

  private DynamicWhere buildFeeWhere(Map<String, String> parameters) {
    DynamicWhereBuilder where = new DynamicWhereBuilder();
    where.addDateRange(
        "EPD.EXPORT_PERMIT_ISSUE_DATE",
        defaultDate(first(parameters, "fromDate"), "0001-01-01"),
        defaultDate(first(parameters, "toDate"), "9999-12-31"));
    where.addNumericOrGroup("EPD.ORG_UNIT_NO", csvParts(parameters, "orgUnitNumber", "region"));
    where.addLike("EPD.EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    where.addLike("EE.EXPORT_EXEMPTION_TYPE_CODE", first(parameters, "exemptionType"));
    where.addLike("EEA.EXPORT_EXEMPTION_REASON_CODE", first(parameters, "exemptionReason"));
    where.addLike("EEA.EXPORT_GROWTH_TYPE_CODE", first(parameters, "growthType"));
    where.addEquals("EPD.EXPORT_PERMIT_STATUS_CODE", "COM");
    return where.build();
  }

  private DynamicWhere buildBiweeklyWhere(Map<String, String> parameters) {
    DynamicWhereBuilder where = new DynamicWhereBuilder();
    where.addDateRange(
        "ES.ADVERTISING_DATE",
        defaultDate(first(parameters, "fromDate"), "0001-01-01"),
        defaultDate(first(parameters, "toDate"), "9999-12-31"));
    where.addNumericOrGroup("EEA.ORG_UNIT_NO", csvParts(parameters, "region", "orgUnitNumber"));

    String jurisdiction = first(parameters, "exportJurisdictionCode", "jurisdiction");
    if (jurisdiction == null || jurisdiction.isBlank()) {
      where.addTextOrGroup("EEA.EXPORT_JURISDICTION_CODE", List.of("P", "F"));
    } else {
      where.addEquals("EEA.EXPORT_JURISDICTION_CODE", jurisdiction);
    }

    where.addEquals("EEA.EXPORT_APPLICATION_STATUS_CODE", "APP");
    where.addNotEquals("EEA.EXPORT_PRODUCT_TYPE_CODE", "T");
    return where.build();
  }

  private DynamicWhere buildTransportWhere(Map<String, String> parameters) {
    String fromDate = defaultDate(first(parameters, "fromDate"), "0001-01-01");
    String toDate = defaultDate(first(parameters, "toDate"), "9999-12-31");

    DynamicWhereBuilder where = new DynamicWhereBuilder();
    where.addDateRangeOrNull("A.EXPORT_PERMIT_ISSUE_DATE", fromDate, toDate);
    where.addDateRangeOrNull("A.RECEIVED_DATE", fromDate, toDate);
    where.addNumericOrGroup("A.ORG_UNIT_NO", csvParts(parameters, "region"));
    where.addLike("A.EXPORT_PERMIT_STATUS_CODE", first(parameters, "status", "permitStatus"));
    where.addLike("A.JURISDICTION", first(parameters, "exportJurisdictionCode", "jurisdiction"));
    where.addLike("A.EXPORT_COUNTRY_CODE", first(parameters, "destinationCountry"));
    where.addLike("A.EXPORT_PORT_OF_EXPORT_CODE", first(parameters, "portOfExport"));
    return where.build();
  }

  private DynamicWhere buildExemptionWhere(Map<String, String> parameters) {
    DynamicWhereBuilder where = new DynamicWhereBuilder();
    where.addDateRangeOrNull(
        "E.APPROVAL_DATE",
        defaultDate(first(parameters, "fromDate"), "0001-01-01"),
        defaultDate(first(parameters, "toDate"), "9999-12-31"));
    where.addNumericOrGroup("A.ORG_UNIT_NO", csvParts(parameters, "region"));
    where.addLike("A.EXPORT_EXEMPTION_REASON_CODE", first(parameters, "exemptionReason"));
    where.addLike("E.EXPORT_EXEMPTION_TYPE_CODE", first(parameters, "exemptionType"));
    where.addLike("A.OWNER_CLIENT_NUMBER", first(parameters, "clientNumber"));
    where.addLike("A.EXPORT_GROWTH_TYPE_CODE", first(parameters, "growthType"));
    where.addLike("A.EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    where.addLike("E.EXPORT_EXEMPTION_STATUS_CODE", first(parameters, "exemptionStatus"));

    String listingFromDate = defaultDate(first(parameters, "listingFromDate"), "0001-01-01");
    String listingToDate = defaultDate(first(parameters, "listingToDate"), "9999-12-31");
    if (!"0001-01-01".equals(listingFromDate) || !"9999-12-31".equals(listingToDate)) {
      where.addDateRange("ES.ADVERTISING_DATE", listingFromDate, listingToDate);
    }

    return where.build();
  }

  private Optional<LegacyTabularReportData> executeDynamicCursorProcedure(
      String procedureCall,
      DynamicWhere where) {
    try (Connection connection = dataSource.getConnection();
        CallableStatement cs = connection.prepareCall(procedureCall)) {
      cs.setString(1, " WHERE " + where.sql());
      Array bindArray = null;
      if (where.bindValues().isEmpty()) {
        cs.setNull(2, Types.ARRAY);
      } else {
        OracleConnection oracleConnection = connection.unwrap(OracleConnection.class);
        bindArray =
            oracleConnection.createOracleArray(
                STRING_ARRAY_TYPE,
                where.bindValues().toArray(new String[0]));
        cs.setArray(2, bindArray);
      }
      cs.setInt(3, where.bindValues().size());
      cs.registerOutParameter(4, Types.REF_CURSOR);
      try {
        cs.execute();

        try (ResultSet rs = (ResultSet) cs.getObject(4)) {
          if (rs == null) {
            return Optional.empty();
          }
          return Optional.of(readTabularData(rs));
        }
      } finally {
        if (bindArray != null) {
          bindArray.free();
        }
      }
    } catch (SQLException ex) {
      LOGGER.warn(
          "CSV report procedure failed [{}]: {}; root cause: {}",
          procedureCall,
          ex.getMessage(),
          rootCauseMessage(ex));
      return Optional.empty();
    }
  }

  private Optional<LegacyTabularReportData> executeCursorProcedure(
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
          return Optional.empty();
        }
        return Optional.of(readTabularData(rs));
      }
    } catch (SQLException ex) {
      LOGGER.warn(
          "CSV report procedure failed [{}]: {}; root cause: {}",
          procedureCall,
          ex.getMessage(),
          rootCauseMessage(ex));
      return Optional.empty();
    }
  }

  private LegacyTabularReportData readTabularData(ResultSet rs) throws SQLException {
    ResultSetMetaData meta = rs.getMetaData();
    int columnCount = meta.getColumnCount();
    List<String> headers = new ArrayList<>(columnCount);
    for (int index = 1; index <= columnCount; index++) {
      headers.add(meta.getColumnName(index));
    }

    List<List<String>> rows = new ArrayList<>();
    while (rs.next()) {
      List<String> row = new ArrayList<>(columnCount);
      for (int index = 1; index <= columnCount; index++) {
        String value = rs.getString(index);
        row.add(value == null ? "" : value);
      }
      rows.add(row);
    }

    return new LegacyTabularReportData(headers, rows);
  }

  private byte[] renderCsv(LegacyTabularReportData data) throws IOException {
    int columnCount = data.columnHeaders().size();

    ByteArrayOutputStream output = new ByteArrayOutputStream(16 * 1024);
    writeCsvRow(output, columnCount, index -> data.columnHeaders().get(index - 1));

    for (List<String> row : data.rows()) {
      writeCsvRow(
          output,
          columnCount,
          index -> row.get(index - 1));
    }

    return output.toByteArray();
  }

  private void writeCsvRow(ByteArrayOutputStream output, int columnCount, CsvValueResolver resolver)
      throws IOException {
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

  private List<String> csvParts(Map<String, String> parameters, String... keys) {
    String normalized = csvValue(parameters, keys);
    if (normalized == null || normalized.isBlank()) {
      return List.of();
    }
    List<String> parts = new ArrayList<>();
    for (String part : normalized.split(",")) {
      String trimmed = part == null ? "" : part.trim();
      if (!trimmed.isEmpty()) {
        parts.add(trimmed);
      }
    }
    return parts;
  }

  private List<String> csvPartsExceptAllRegion(Map<String, String> parameters, String... keys) {
    List<String> parts = csvParts(parameters, keys);
    return parts.size() == 1 && "0".equals(parts.get(0)) ? List.of() : parts;
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

  private String defaultDate(String value, String fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    return value;
  }

  private String nullIfBlank(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value;
  }

  private String defaultIfBlank(String value, String fallback) {
    if (value == null || value.isBlank()) {
      return fallback;
    }
    return value;
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

  private static String rootCauseMessage(Throwable throwable) {
    Throwable root = throwable;
    while (root.getCause() != null && root.getCause() != root) {
      root = root.getCause();
    }
    String message = root.getMessage();
    return root.getClass().getSimpleName() + (message == null ? "" : ": " + message);
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
    String resolve(int index);
  }

  private record DynamicWhere(String sql, List<String> bindValues) {}

  private static final class DynamicWhereBuilder {
    private final StringBuilder sql = new StringBuilder("1=1");
    private final List<String> bindValues = new ArrayList<>();
    private int nextBind = 1;

    DynamicWhereBuilder addDateRange(String column, String fromDate, String toDate) {
      sql.append(" AND ")
          .append(column)
          .append(" BETWEEN TO_DATE(:")
          .append(nextBind++)
          .append(", 'yyyy-mm-dd') AND TO_DATE(:")
          .append(nextBind++)
          .append(", 'yyyy-mm-dd')");
      bindValues.add(fromDate);
      bindValues.add(toDate);
      return this;
    }

    DynamicWhereBuilder addDateRangeOrNull(String column, String fromDate, String toDate) {
      sql.append(" AND (")
          .append(column)
          .append(" BETWEEN TO_DATE(:")
          .append(nextBind++)
          .append(", 'yyyy-mm-dd') AND TO_DATE(:")
          .append(nextBind++)
          .append(", 'yyyy-mm-dd')")
          .append(" OR ")
          .append(column)
          .append(" IS NULL)");
      bindValues.add(fromDate);
      bindValues.add(toDate);
      return this;
    }

    DynamicWhereBuilder addLike(String column, String value) {
      if (value == null || value.isBlank()) {
        return this;
      }
      sql.append(" AND ")
          .append(column)
          .append(" LIKE '%'||:")
          .append(nextBind++)
          .append("||'%'");
      bindValues.add(value.trim());
      return this;
    }

    DynamicWhereBuilder addEquals(String column, String value) {
      if (value == null || value.isBlank()) {
        return this;
      }
      sql.append(" AND ")
          .append(column)
          .append(" = :")
          .append(nextBind++);
      bindValues.add(value.trim());
      return this;
    }

    DynamicWhereBuilder addNotEquals(String column, String value) {
      if (value == null || value.isBlank()) {
        return this;
      }
      sql.append(" AND ")
          .append(column)
          .append(" <> :")
          .append(nextBind++);
      bindValues.add(value.trim());
      return this;
    }

    DynamicWhereBuilder addNumericOrGroup(String column, List<String> numericValues) {
      if (numericValues == null || numericValues.isEmpty()) {
        return this;
      }
      sql.append(" AND (1=0");
      for (String value : numericValues) {
        sql.append(" OR ")
            .append(column)
            .append(" = TO_NUMBER(:")
            .append(nextBind++)
            .append(")");
        bindValues.add(value);
      }
      sql.append(")");
      return this;
    }

    DynamicWhereBuilder addTextOrGroup(String column, List<String> values) {
      if (values == null || values.isEmpty()) {
        return this;
      }
      sql.append(" AND (1=0");
      for (String value : values) {
        if (value == null || value.isBlank()) {
          continue;
        }
        sql.append(" OR ")
            .append(column)
            .append(" = :")
            .append(nextBind++);
        bindValues.add(value.trim());
      }
      sql.append(")");
      return this;
    }

    DynamicWhere build() {
      return new DynamicWhere(sql.toString(), List.copyOf(bindValues));
    }
  }
}

package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.service.report.ReportParameterUtils.first;
import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import oracle.jdbc.OracleConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLegacyCsvReportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleLegacyCsvReportService.class);
  private static final String STRING_ARRAY_TYPE = "CBR_VARCHAR2_ARRAY";
  private static final long MATERIALIZED_ROW_OVERHEAD_BYTES = 32L;
  private static final long MATERIALIZED_CELL_OVERHEAD_BYTES = 64L;

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
  private static final String BIWEEKLY_REPORT_PROCEDURE =
      "{ call LEXIS_REPORTING.BIWEEKLY_RPT(?,?,?,?,?) }";
  private static final String BIWEEKLY_PACKAGE_PROCEDURE =
      "{ call LEXIS_REPORTING.BIWEEKLY_SUBREPORT_RPT(?,?,?) }";
  private static final List<String> BIWEEKLY_CSV_HEADERS =
      List.of(
          "ADVERTISING_DATE",
          "REGION_NAME",
          "CLIENT_NAME",
          "CLIENT_ADDRESS_1",
          "CLIENT_ADDRESS_2",
          "CLIENT_ADDRESS_3",
          "CLIENT_CITY",
          "CLIENT_PROVINCE",
          "CLIENT_POSTAL_CODE",
          "CLIENT_CONTACT_NAME",
          "CLIENT_CONTACT_PHONE",
          "CLIENT_CONTACT_EMAIL",
          "JURISDICTION_CODE",
          "APPLICATION_NUMBER",
          "SPECIES_ENDUSE",
          "PRODUCT_TYPE",
          "PRODUCT_LOCATION",
          "EXEMPTION_APPLICATION_VOLUME",
          "AVERAGE_LOG_VOLUME",
          "AGENT_NAME",
          "AGENT_PHONE",
          "AGENT_CONTACT_NAME",
          "AGENT_CONTACT_EMAIL",
          "PACKAGE_NUMBER",
          "PACKAGE_VOLUME",
          "AGE_CLASS",
          "AVERAGE_LENGTH",
          "AVERAGE_DIAMETER");
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
  private final LexisReportResourceManager reportResources;

  public OracleLegacyCsvReportService(DataSource dataSource) {
    this(dataSource, LexisReportResourceManager.defaults());
  }

  @Autowired
  public OracleLegacyCsvReportService(
      DataSource dataSource, LexisReportResourceManager reportResources) {
    this.dataSource = dataSource;
    this.reportResources = reportResources;
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
    Map<String, String> parameters = requestParameters(request);
    byte[] content =
        executeCursorCsv(
            SPECIES_GRADE_CSV_PROCEDURE,
            cs -> bindSpeciesGradeParameters(cs, parameters),
            11,
            "species grade");

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateTeacCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    String procedureCall = resolveTeacProcedure(parameters);
    if (procedureCall == null) {
      return Optional.empty();
    }
    byte[] content =
        executeCursorCsv(
            procedureCall, cs -> bindTeacParameters(cs, parameters), 3, "TEAC");

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
        cs -> bindSpeciesGradeParameters(cs, parameters),
        11);
  }

  private Optional<LegacyTabularReportData> loadTeacData(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    String procedureCall = resolveTeacProcedure(parameters);
    if (procedureCall == null) {
      return Optional.empty();
    }

    return executeCursorProcedure(
        procedureCall,
        cs -> bindTeacParameters(cs, parameters),
        3);
  }

  private void bindSpeciesGradeParameters(
      CallableStatement cs, Map<String, String> parameters) throws SQLException {
    cs.setDate(1, toSqlDate(first(parameters, "fromDate")));
    cs.setDate(2, toSqlDate(first(parameters, "toDate")));
    setNullableString(cs, 3, csvValue(parameters, "region"));
    setNullableString(cs, 4, trimToNull(first(parameters, "exemptionNumber")));
    setNullableString(cs, 5, trimToNull(first(parameters, "exemptionType")));
    setNullableString(cs, 6, trimToNull(first(parameters, "exemptionReason")));
    setNullableString(cs, 7, trimToNull(first(parameters, "growthType")));
    setNullableString(cs, 8, trimToNull(first(parameters, "timberMark")));
    setNullableString(cs, 9, trimToNull(first(parameters, "forestFileId")));
    setNullableString(cs, 10, trimToNull(first(parameters, "permitStatus")));
  }

  private String resolveTeacProcedure(Map<String, String> parameters) {
    String jurisdiction = trimToNull(first(parameters, "exportJurisdictionCode", "jurisdiction"));
    if (JURISDICTION_PROVINCIAL.equalsIgnoreCase(jurisdiction)) {
      return PROVINCIAL_TEAC_CSV_PROCEDURE;
    }
    if (JURISDICTION_FEDERAL.equalsIgnoreCase(jurisdiction)) {
      return FEDERAL_TEAC_CSV_PROCEDURE;
    }
    LOGGER.warn(
        "event=lexis_report operation=validate outcome=unknown_jurisdiction jurisdiction={}",
        controlSafe(jurisdiction));
    return null;
  }

  private void bindTeacParameters(CallableStatement cs, Map<String, String> parameters)
      throws SQLException {
    setNullableString(cs, 1, csvValue(parameters, "region"));
    cs.setLong(2, parseLongOrZero(first(parameters, "exportSchedule")));
  }

  private Optional<LegacyTabularReportData> loadApprovedExemptionData(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    String exemptionNumber = trimToNull(first(parameters, "exemptionNumber"));
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
    byte[] content =
        executeDynamicCursorCsv(APPLICATION_CSV_PROCEDURE, where, "application");

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.APPLICATION_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateOfferCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildOfferWhere(parameters);
    byte[] content = executeDynamicCursorCsv(OFFERS_CSV_PROCEDURE, where, "offer");

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.OFFER_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateFeeCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildFeeWhere(parameters);
    byte[] content = executeDynamicCursorCsv(FEE_SUMMARY_CSV_PROCEDURE, where, "fee");

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.FEE_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generatePermitLedgerCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    byte[] content =
        executeCursorCsv(
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
            12,
            "permit ledger");

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.PERMIT_LEDGER_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateBiweeklyCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    byte[] content = renderBiweeklyCsv(parameters);

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.BIWEEKLY_LISTING.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private byte[] renderBiweeklyCsv(Map<String, String> parameters) {
    try (Connection connection = dataSource.getConnection();
        CallableStatement cs = prepareCall(connection, BIWEEKLY_REPORT_PROCEDURE)) {
      cs.setString(1, defaultIfBlank(csvValue(parameters, "region", "orgUnitNumber"), ""));
      setNullableString(cs, 2, first(parameters, "exportJurisdictionCode", "jurisdiction"));
      cs.setString(3, defaultDate(first(parameters, "fromDate"), "0001-01-01"));
      cs.setString(4, defaultDate(first(parameters, "toDate"), "9999-12-31"));
      cs.registerOutParameter(5, Types.REF_CURSOR);
      cs.execute();

      try (ResultSet rs = requiredCursor(cs, 5)) {
        ByteArrayOutputStream output = reportResources.newOutputStream();
        writeCsvRow(
            output,
            BIWEEKLY_CSV_HEADERS.size(),
            index -> BIWEEKLY_CSV_HEADERS.get(index - 1));
        streamBiweeklyCsvRows(connection, rs, output);
        return reportResources.requireWithinOutputLimit(output.toByteArray());
      }
    } catch (IOException ex) {
      throw csvRenderFailure("biweekly", ex);
    } catch (SQLException ex) {
      LOGGER.error(
          "event=lexis_report operation=biweekly_oracle_load outcome=failed failureType={}",
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The biweekly report data could not be loaded", ex);
    }
  }

  private void streamBiweeklyCsvRows(
      Connection connection, ResultSet reportRows, ByteArrayOutputStream output)
      throws SQLException, IOException {
    while (reportRows.next()) {
      Map<String, String> reportRow = readCurrentRow(reportRows);
      boolean wrotePackageRow =
          streamBiweeklyPackageRows(
              connection,
              value(reportRow, "APPLICATION_NUMBER"),
              value(reportRow, "EXPORT_JURISDICTION_CODE"),
              reportRow,
              output);
      if (!wrotePackageRow) {
        writeCsvDataRow(output, buildBiweeklyCsvRow(reportRow, Map.of()));
      }
    }
  }

  private boolean streamBiweeklyPackageRows(
      Connection connection,
      String applicationNumber,
      String jurisdiction,
      Map<String, String> reportRow,
      ByteArrayOutputStream output)
      throws SQLException, IOException {
    if (applicationNumber == null || applicationNumber.isBlank()) {
      return false;
    }

    try (CallableStatement cs = prepareCall(connection, BIWEEKLY_PACKAGE_PROCEDURE)) {
      setNullableString(cs, 1, applicationNumber);
      setNullableString(cs, 2, jurisdiction);
      cs.registerOutParameter(3, Types.REF_CURSOR);
      cs.execute();

      try (ResultSet rs = requiredCursor(cs, 3)) {
        boolean wroteRow = false;
        while (rs.next()) {
          writeCsvDataRow(output, buildBiweeklyCsvRow(reportRow, readCurrentRow(rs)));
          wroteRow = true;
        }
        return wroteRow;
      }
    }
  }

  private void writeCsvDataRow(ByteArrayOutputStream output, List<String> row) throws IOException {
    writeCsvRow(output, row.size(), index -> row.get(index - 1));
  }

  private Map<String, String> readCurrentRow(ResultSet rs) throws SQLException {
    ResultSetMetaData meta = rs.getMetaData();
    int columnCount = meta.getColumnCount();
    Map<String, String> row = new HashMap<>();
    for (int index = 1; index <= columnCount; index++) {
      String column = meta.getColumnName(index);
      String cell = rs.getString(index);
      row.put(column.toUpperCase(Locale.ROOT), cell == null ? "" : cell);
    }
    return row;
  }

  private List<String> buildBiweeklyCsvRow(
      Map<String, String> reportRow,
      Map<String, String> packageRow) {
    return List.of(
        value(reportRow, "ADVERTISING_DATE"),
        value(reportRow, "ORG_UNIT"),
        value(reportRow, "CLIENT_NAME"),
        value(reportRow, "ADDRESS_1"),
        value(reportRow, "ADDRESS_2"),
        value(reportRow, "ADDRESS_3"),
        value(reportRow, "CITY"),
        value(reportRow, "PROVINCE"),
        value(reportRow, "POSTAL_CODE"),
        value(reportRow, "OWNER_CONTACT_NAME"),
        value(reportRow, "BUSINESS_PHONE"),
        value(reportRow, "EMAIL_ADDRESS"),
        value(reportRow, "EXPORT_JURISDICTION_CODE"),
        firstNonBlank(value(reportRow, "FED_APPLICATION_NUMBER"), value(reportRow, "APPLICATION_NUMBER")),
        value(reportRow, "SPECIES_ENDUSE"),
        value(reportRow, "PRODUCT_TYPE"),
        value(reportRow, "PRODUCT_LOCATION"),
        value(reportRow, "EXEMPTION_APPLICATION_VOLUME"),
        value(reportRow, "AVERAGE_LOG_VOLUME"),
        value(reportRow, "AGENT_CLIENT_NAME"),
        value(reportRow, "AGENT_BUS_PHONE"),
        value(reportRow, "AGENT_CONTACT_NAME"),
        value(reportRow, "AGENT_EMAIL"),
        value(packageRow, "PACKAGE_NUMBER"),
        value(packageRow, "PACKAGE_VOLUME"),
        firstNonBlank(value(packageRow, "EXPORT_GROWTH_TYPE_CODE"), value(reportRow, "EXPORT_GROWTH_TYPE_CODE")),
        value(packageRow, "AVERAGE_LENGTH"),
        value(packageRow, "AVERAGE_DIAMETER"));
  }

  private String value(Map<String, String> row, String column) {
    return row.getOrDefault(column, "");
  }

  private String firstNonBlank(String firstValue, String secondValue) {
    return firstValue == null || firstValue.isBlank() ? secondValue : firstValue;
  }

  private Optional<LexisGeneratedReport> generateTransportCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildTransportWhere(parameters);
    byte[] content = executeDynamicCursorCsv(TRANSPORT_CSV_PROCEDURE, where, "transport");

    return Optional.of(
        new LexisGeneratedReport(
            LexisJasperReportDefinition.TRANSPORT_REPORT.resolveFilename(LexisReportFormat.CSV),
            LexisReportFormat.CSV.mediaType(),
            content));
  }

  private Optional<LexisGeneratedReport> generateExemptionCsv(LexisReportRequestDto request) {
    Map<String, String> parameters = requestParameters(request);
    DynamicWhere where = buildExemptionWhere(parameters);
    byte[] content = executeDynamicCursorCsv(EXEMPTIONS_CSV_PROCEDURE, where, "exemption");

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

  private byte[] executeDynamicCursorCsv(
      String procedureCall,
      DynamicWhere where,
      String reportName) {
    try (Connection connection = dataSource.getConnection();
        CallableStatement cs = prepareCall(connection, procedureCall)) {
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

        try (ResultSet rs = requiredCursor(cs, 4)) {
          return renderCursorCsv(rs, reportName);
        }
      } finally {
        if (bindArray != null) {
          bindArray.free();
        }
      }
    } catch (SQLException ex) {
      LOGGER.error(
          "event=lexis_report operation=filtered_cursor_load outcome=failed failureType={}",
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The " + reportName + " report data could not be loaded", ex);
    }
  }

  private byte[] executeCursorCsv(
      String procedureCall,
      SqlStatementBinder binder,
      int cursorOutIndex,
      String reportName) {
    try (Connection connection = dataSource.getConnection();
        CallableStatement cs = prepareCall(connection, procedureCall)) {
      binder.bind(cs);
      cs.registerOutParameter(cursorOutIndex, Types.REF_CURSOR);
      cs.execute();

      try (ResultSet rs = requiredCursor(cs, cursorOutIndex)) {
        return renderCursorCsv(rs, reportName);
      }
    } catch (SQLException ex) {
      LOGGER.error(
          "event=lexis_report operation=cursor_load outcome=failed report={} failureType={}",
          controlSafe(reportName),
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The " + reportName + " report data could not be loaded", ex);
    }
  }

  private Optional<LegacyTabularReportData> executeCursorProcedure(
      String procedureCall,
      SqlStatementBinder binder,
      int cursorOutIndex) {
    try (Connection connection = dataSource.getConnection();
        CallableStatement cs = prepareCall(connection, procedureCall)) {
      binder.bind(cs);
      cs.registerOutParameter(cursorOutIndex, Types.REF_CURSOR);
      cs.execute();

      try (ResultSet rs = requiredCursor(cs, cursorOutIndex)) {
        return Optional.of(readTabularData(rs));
      }
    } catch (SQLException ex) {
      LOGGER.error(
          "event=lexis_report operation=tabular_cursor_load outcome=failed failureType={}",
          exceptionType(ex));
      throw new LexisReportGenerationException("The report data could not be loaded", ex);
    }
  }

  private ResultSet requiredCursor(CallableStatement statement, int cursorOutIndex)
      throws SQLException {
    Object cursor = statement.getObject(cursorOutIndex);
    if (cursor instanceof ResultSet resultSet) {
      return resultSet;
    }
    throw new SQLException("Oracle report procedure returned no REF CURSOR");
  }

  private CallableStatement prepareCall(Connection connection, String procedureCall)
      throws SQLException {
    CallableStatement statement = connection.prepareCall(procedureCall);
    try {
      reportResources.applyQueryTimeout(statement);
      return statement;
    } catch (SQLException | RuntimeException exception) {
      try {
        statement.close();
      } catch (SQLException closeException) {
        exception.addSuppressed(closeException);
      }
      throw exception;
    }
  }

  private LegacyTabularReportData readTabularData(ResultSet rs) throws SQLException {
    ResultSetMetaData meta = rs.getMetaData();
    int columnCount = meta.getColumnCount();
    List<String> headers = new ArrayList<>(columnCount);
    long estimatedBytes = MATERIALIZED_ROW_OVERHEAD_BYTES;
    reportResources.requireWithinMaterializationBudget(estimatedBytes);
    for (int index = 1; index <= columnCount; index++) {
      String header = meta.getColumnName(index);
      estimatedBytes = reserveMaterializedCell(estimatedBytes, header);
      headers.add(header);
    }

    List<List<String>> rows = new ArrayList<>();
    while (rs.next()) {
      estimatedBytes += MATERIALIZED_ROW_OVERHEAD_BYTES;
      reportResources.requireWithinMaterializationBudget(estimatedBytes);
      List<String> row = new ArrayList<>(columnCount);
      for (int index = 1; index <= columnCount; index++) {
        String value = rs.getString(index);
        String safeValue = value == null ? "" : value;
        estimatedBytes = reserveMaterializedCell(estimatedBytes, safeValue);
        row.add(safeValue);
      }
      rows.add(row);
    }

    return new LegacyTabularReportData(headers, rows);
  }

  private long reserveMaterializedCell(long currentBytes, String value) {
    long nextBytes =
        currentBytes
            + MATERIALIZED_CELL_OVERHEAD_BYTES
            + (value == null ? 0L : value.getBytes(StandardCharsets.UTF_8).length);
    reportResources.requireWithinMaterializationBudget(nextBytes);
    return nextBytes;
  }

  private byte[] renderCursorCsv(ResultSet rs, String reportName) throws SQLException {
    ResultSetMetaData meta = rs.getMetaData();
    int columnCount = meta.getColumnCount();
    String[] row = new String[columnCount];
    for (int index = 1; index <= columnCount; index++) {
      row[index - 1] = meta.getColumnName(index);
    }

    ByteArrayOutputStream output = reportResources.newOutputStream();
    try {
      writeCsvRow(output, columnCount, index -> row[index - 1]);
      while (rs.next()) {
        for (int index = 1; index <= columnCount; index++) {
          String value = rs.getString(index);
          row[index - 1] = value == null ? "" : value;
        }
        writeCsvRow(output, columnCount, index -> row[index - 1]);
      }
    } catch (IOException ex) {
      throw csvRenderFailure(reportName, ex);
    }
    return reportResources.requireWithinOutputLimit(output.toByteArray());
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

  String sanitizeForCsv(String input) {
    if (input == null) {
      return "";
    }
    String sanitized =
        input.replace("\"", "\"\"").replace("\n", "").replace("\r", "").replace("\f", "");
    String candidate = sanitized.stripLeading();
    boolean startsWithControl = !sanitized.isEmpty() && sanitized.charAt(0) == '\t';
    boolean startsWithFormula =
        !candidate.isEmpty()
            && (candidate.charAt(0) == '='
                || candidate.charAt(0) == '+'
                || candidate.charAt(0) == '-'
                || candidate.charAt(0) == '@');
    if (startsWithControl || startsWithFormula) {
      return "'" + sanitized;
    }
    return sanitized;
  }

  private LexisReportGenerationException csvRenderFailure(String reportName, IOException ex) {
    LOGGER.error(
        "event=lexis_report operation=csv_render outcome=failed report={} failureType={}",
        controlSafe(reportName),
        exceptionType(ex));
    return new LexisReportGenerationException(
        "The " + reportName + " CSV could not be rendered", ex);
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
    String normalized = trimToNull(value);
    if (normalized == null) {
      return "";
    }

    if (normalized.startsWith("[") && normalized.endsWith("]")) {
      normalized = normalized.substring(1, normalized.length() - 1);
    }

    String[] parts = normalized.split(",");
    StringBuilder builder = new StringBuilder();
    for (String part : parts) {
      String trimmed = trimToNull(part);
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

  private java.sql.Date toSqlDate(String value) {
    LocalDate localDate = parseDate(value);
    return localDate == null ? null : java.sql.Date.valueOf(localDate);
  }

  private LocalDate parseDate(String raw) {
    return parseIsoOrLegacyDate(raw);
  }

  private long parseLongOrZero(String raw) {
    String value = trimToNull(raw);
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

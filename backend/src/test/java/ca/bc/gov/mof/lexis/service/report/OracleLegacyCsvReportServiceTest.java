package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static java.util.Map.entry;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Types;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import oracle.jdbc.OracleConnection;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OracleLegacyCsvReportServiceTest {

  @Mock private DataSource dataSource;
  @Mock private Connection connection;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;
  @Mock private ResultSetMetaData metaData;
  @Mock private OracleConnection oracleConnection;
  @Mock private Array bindArray;

  @Test
  void shouldReturnEmptyForPdfRequests() {
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT,
            new LexisReportRequestDto(Map.of("fromDate", "2026-01-01"), "PDF"),
            LexisReportFormat.PDF);

    assertThat(report).isEmpty();
  }

  @Test
  void shouldReturnEmptyForSpreadsheetRequests() {
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.TENURE_REPORT,
            new LexisReportRequestDto(Map.of("fromDate", "2026-01-01"), "XLS"),
            LexisReportFormat.XLS);

    assertThat(report).isEmpty();
    verifyNoInteractions(dataSource);
  }

  @Test
  void shouldGenerateTeacCsvFromProvincialProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.PROVINCIAL_TEAC_REPORT(?,?,?) }")).thenReturn(callableStatement);
    when(callableStatement.getObject(3)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(2);
    when(metaData.getColumnName(1)).thenReturn("ORG_UNIT");
    when(metaData.getColumnName(2)).thenReturn("VALUE");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("12");
    when(resultSet.getString(2)).thenReturn("A\"B");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "region", "[12, 14]",
                "exportSchedule", "12345",
                "exportJurisdictionCode", "P"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.TEAC_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("TeacReport" + today() + ".csv");
    assertThat(report.orElseThrow().mediaType()).isEqualTo("application/vnd.ms-excel");

    String csv = new String(report.orElseThrow().content());
    assertThat(csv).contains("\"ORG_UNIT\",\"VALUE\"");
    assertThat(csv).contains("\"12\",\"A\"\"B\"");

    verify(callableStatement).setString(1, "12,14");
    verify(callableStatement).setLong(2, 12345L);
    verify(callableStatement).registerOutParameter(3, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateTeacCsvFromFederalProcedureWithLegacyNullAndZeroDefaults() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.FEDERAL_TEAC_REPORT(?,?,?) }"))
        .thenReturn(callableStatement);
    when(callableStatement.getObject(3)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("VALUE");
    when(resultSet.next()).thenReturn(false);

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "exportSchedule", "not-a-number",
                "exportJurisdictionCode", "F"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.TEAC_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("TeacReport" + today() + ".csv");

    verify(callableStatement).setNull(1, Types.VARCHAR);
    verify(callableStatement).setLong(2, 0L);
    verify(callableStatement).registerOutParameter(3, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateSpeciesGradeCsvUsingLegacyCsvParameterOrder() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.SPECIES_GRADE_REPORT_CSV(?,?,?,?,?,?,?,?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(callableStatement.getObject(11)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("SPECIES");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("CE");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.ofEntries(
                entry("fromDate", "2026-01-01"),
                entry("toDate", "2026-01-31"),
                entry("region", "1904,1905"),
                entry("permitStatus", "COM"),
                entry("exemptionNumber", "EX-123"),
                entry("exemptionType", "O"),
                entry("exemptionReason", "S"),
                entry("growthType", "OLD"),
                entry("timberMark", "TM123"),
                entry("forestFileId", "A12345")),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("speciesGradeReport" + today() + ".csv");

    verify(callableStatement).setDate(1, java.sql.Date.valueOf("2026-01-01"));
    verify(callableStatement).setDate(2, java.sql.Date.valueOf("2026-01-31"));
    verify(callableStatement).setString(3, "1904,1905");
    verify(callableStatement).setString(4, "EX-123");
    verify(callableStatement).setString(5, "O");
    verify(callableStatement).setString(6, "S");
    verify(callableStatement).setString(7, "OLD");
    verify(callableStatement).setString(8, "TM123");
    verify(callableStatement).setString(9, "A12345");
    verify(callableStatement).setString(10, "COM");
    verify(callableStatement).registerOutParameter(11, Types.REF_CURSOR);
  }

  @Test
  void shouldLoadApprovedExemptionDataFromLegacyProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_GROUP_5.FIND_EXEMPTION_BY_NUMBER(?,?) }"))
        .thenReturn(callableStatement);
    when(callableStatement.getObject(2)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(3);
    when(metaData.getColumnName(1)).thenReturn("EXEMPTION_NUMBER");
    when(metaData.getColumnName(2)).thenReturn("APPROVED_VOLUME");
    when(metaData.getColumnName(3)).thenReturn("EXPORT_EXEMPTION_STATUS_CODE");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("EX-123");
    when(resultSet.getString(2)).thenReturn("1200");
    when(resultSet.getString(3)).thenReturn("ACT");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    var data =
        service.loadLegacyTabularReportData(
            LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT,
            new LexisReportRequestDto(Map.of("exemptionNumber", "EX-123"), "PDF"));

    assertThat(data).isPresent();
    assertThat(data.orElseThrow().columnHeaders())
        .containsExactly("EXEMPTION_NUMBER", "APPROVED_VOLUME", "EXPORT_EXEMPTION_STATUS_CODE");
    assertThat(data.orElseThrow().rows()).containsExactly(List.of("EX-123", "1200", "ACT"));

    verify(callableStatement).setString(1, "EX-123");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateApplicationCsvFromLegacyDynamicProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.APP_REPORT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(oracleConnection.createOracleArray(org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("APPLICATION_NUMBER");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("123");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-01-01",
                "toDate", "2026-01-31",
                "region", "1904,1905",
                "exportJurisdictionCode", "P",
                "clientNumber", "10001"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.APPLICATION_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("applicationLedger" + today() + ".csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("EEA.RECEIVED_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("EEA.EXPORT_JURISDICTION_CODE <> :6"));
    assertBindArrayValues("2026-01-01", "2026-01-31", "1904", "1905", "P", "I", "10001");
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 7);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
    InOrder executionOrder = Mockito.inOrder(callableStatement, bindArray);
    executionOrder.verify(callableStatement).execute();
    executionOrder.verify(bindArray).free();
  }

  @Test
  void shouldTreatLegacyApplicationRegionZeroAsAllRegions() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.APP_REPORT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(
            oracleConnection.createOracleArray(
                org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"),
                org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("APPLICATION_NUMBER");
    when(resultSet.next()).thenReturn(false);

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-01-01",
                "toDate", "2026-01-31",
                "region", "0"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.APPLICATION_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(callableStatement).setString(org.mockito.ArgumentMatchers.eq(1), sqlCaptor.capture());
    assertThat(sqlCaptor.getValue()).doesNotContain("EEA.ORG_UNIT_NO");
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 3);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateOfferCsvFromLegacyDynamicProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.OFFERS_REPORT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(oracleConnection.createOracleArray(org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("EXPORT_PURCHASE_OFFER_NUMBER");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("777");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-02-01",
                "toDate", "2026-02-28",
                "region", "1904",
                "clientNumber", "20001",
                "exportJurisdictionCode", "F"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.OFFER_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("offerReport" + today() + ".csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("EEA.APPLICATION_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 5);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateFeeCsvFromLegacyDynamicProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.FEE_SUMMARY_RPT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(oracleConnection.createOracleArray(org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("PERMIT_NUMBER");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("P-123");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-03-01",
                "toDate", "2026-03-31",
                "orgUnitNumber", "1904",
                "exemptionNumber", "E-12",
                "exemptionType", "M",
                "exemptionReason", "S",
                "growthType", "PRI"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.FEE_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("feeReport" + today() + ".csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("EPD.EXPORT_PERMIT_ISSUE_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 8);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
  }

  @Test
  void shouldGeneratePermitLedgerCsvFromLegacyExplicitProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.PERMIT_LEDGER_REPORT(?,?,?,?,?,?,?,?,?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(callableStatement.getObject(12)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("PERMIT_NUMBER");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("P-900");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-04-01",
                "toDate", "2026-04-30",
                "region", "1904,1905",
                "clientNumber", "20001",
                "permitStatus", "COM"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.PERMIT_LEDGER_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("permitLedger" + today() + ".csv");

    verify(callableStatement).setString(1, "2026-04-01");
    verify(callableStatement).setString(2, "2026-04-30");
    verify(callableStatement).setString(3, "20001");
    verify(callableStatement).setString(4, "1904,1905");
    verify(callableStatement).setString(6, "COM");
    verify(callableStatement).registerOutParameter(12, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateBiweeklyCsvFromLegacyProcedureWithReportEmailColumns() throws Exception {
    CallableStatement csvStatement = Mockito.mock(CallableStatement.class);
    CallableStatement reportStatement = Mockito.mock(CallableStatement.class);
    ResultSet csvResultSet = Mockito.mock(ResultSet.class);
    ResultSet reportResultSet = Mockito.mock(ResultSet.class);
    ResultSetMetaData csvMetaData = Mockito.mock(ResultSetMetaData.class);
    ResultSetMetaData reportMetaData = Mockito.mock(ResultSetMetaData.class);

    when(dataSource.getConnection()).thenReturn(connection, connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_REPORT_CSV(?,?,?,?) }"))
        .thenReturn(csvStatement);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_RPT(?,?,?,?,?) }"))
        .thenReturn(reportStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(oracleConnection.createOracleArray(org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(csvStatement.getObject(4)).thenReturn(csvResultSet);
    when(reportStatement.getObject(1)).thenReturn(reportResultSet);

    when(csvResultSet.getMetaData()).thenReturn(csvMetaData);
    when(csvMetaData.getColumnCount()).thenReturn(4);
    when(csvMetaData.getColumnName(1)).thenReturn("APPLICATION_NUMBER");
    when(csvMetaData.getColumnName(2)).thenReturn("CLIENT_CONTACT_PHONE");
    when(csvMetaData.getColumnName(3)).thenReturn("AGENT_CONTACT_NAME");
    when(csvMetaData.getColumnName(4)).thenReturn("PACKAGE_NUMBER");
    when(csvResultSet.next()).thenReturn(true, false);
    when(csvResultSet.getString(1)).thenReturn("A-1");
    when(csvResultSet.getString(2)).thenReturn("250-555-0101");
    when(csvResultSet.getString(3)).thenReturn("Agent Contact");
    when(csvResultSet.getString(4)).thenReturn("PKG-1");

    when(reportResultSet.getMetaData()).thenReturn(reportMetaData);
    when(reportMetaData.getColumnCount()).thenReturn(4);
    when(reportMetaData.getColumnName(1)).thenReturn("APPLICATION_NUMBER");
    when(reportMetaData.getColumnName(2)).thenReturn("FED_APPLICATION_NUMBER");
    when(reportMetaData.getColumnName(3)).thenReturn("EMAIL_ADDRESS");
    when(reportMetaData.getColumnName(4)).thenReturn("AGENT_EMAIL");
    when(reportResultSet.next()).thenReturn(true, false);
    when(reportResultSet.getString(1)).thenReturn("A-1");
    when(reportResultSet.getString(2)).thenReturn(null);
    when(reportResultSet.getString(3)).thenReturn("owner@example.gov.bc.ca");
    when(reportResultSet.getString(4)).thenReturn("agent@example.gov.bc.ca");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-05-01",
                "toDate", "2026-05-31",
                "region", "1904,1905"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.BIWEEKLY_LISTING,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("biweeklyListing" + today() + ".csv");

    String csv = new String(report.orElseThrow().content());
    assertThat(csv)
        .contains(
            "\"APPLICATION_NUMBER\",\"CLIENT_CONTACT_PHONE\",\"CLIENT_CONTACT_EMAIL\",\"AGENT_CONTACT_NAME\",\"AGENT_CONTACT_EMAIL\",\"PACKAGE_NUMBER\"");
    assertThat(csv)
        .contains(
            "\"A-1\",\"250-555-0101\",\"owner@example.gov.bc.ca\",\"Agent Contact\",\"agent@example.gov.bc.ca\",\"PKG-1\"");

    verify(csvStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("ES.ADVERTISING_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(csvStatement).setArray(2, bindArray);
    verify(csvStatement).setInt(3, 8);
    verify(csvStatement).registerOutParameter(4, Types.REF_CURSOR);
    verify(reportStatement).registerOutParameter(1, Types.REF_CURSOR);
    verify(reportStatement).setString(2, "1904,1905");
    verify(reportStatement).setNull(3, Types.VARCHAR);
    verify(reportStatement).setString(4, "2026-05-01");
    verify(reportStatement).setString(5, "2026-05-31");
  }

  @Test
  void shouldGenerateTransportCsvFromLegacyDynamicProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.TRANSPORT_REPORT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(oracleConnection.createOracleArray(org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("PERMIT_NUMBER");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("P-1");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-06-01",
                "toDate", "2026-06-30",
                "region", "1904",
                "status", "COM",
                "jurisdiction", "P",
                "destinationCountry", "US",
                "portOfExport", "VAN"),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.TRANSPORT_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("transportReport" + today() + ".csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("A.EXPORT_PERMIT_ISSUE_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    assertBindArrayValues(
        "2026-06-01", "2026-06-30", "2026-06-01", "2026-06-30", "1904", "COM", "P", "US", "VAN");
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 9);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateExemptionCsvFromLegacyDynamicProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.EXEMPTION_LEDGER_RPT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(oracleConnection.createOracleArray(org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("EXEMPTION_NUMBER");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("E-123");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.ofEntries(
                entry("fromDate", "2026-07-01"),
                entry("toDate", "2026-07-31"),
                entry("region", "1904,1905"),
                entry("exemptionReason", "S"),
                entry("exemptionType", "M"),
                entry("clientNumber", "10001"),
                entry("growthType", "PRI"),
                entry("exemptionNumber", "E-123"),
                entry("exemptionStatus", "ACT"),
                entry("listingFromDate", "2026-07-01"),
                entry("listingToDate", "2026-07-15")),
            "CSV");

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.EXEMPTION_REPORT,
            request,
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("exemptionLedger" + today() + ".csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("E.APPROVAL_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("E.APPROVAL_DATE IS NULL"));
    assertBindArrayValues(
        "2026-07-01",
        "2026-07-31",
        "1904",
        "1905",
        "S",
        "M",
        "10001",
        "PRI",
        "E-123",
        "ACT",
        "2026-07-01",
        "2026-07-15");
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 12);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
  }

  private void assertBindArrayValues(String... expectedValues) throws Exception {
    ArgumentCaptor<Object> bindValuesCaptor = ArgumentCaptor.forClass(Object.class);
    verify(oracleConnection)
        .createOracleArray(
            org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), bindValuesCaptor.capture());
    assertThat((String[]) bindValuesCaptor.getValue()).containsExactly(expectedValues);
  }

  private static String today() {
    return LocalDate.now().toString();
  }
}

package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.test.ReportTestArtifacts.content;
import static java.util.Map.entry;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
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
  @Mock private CallableStatement packageCallableStatement;
  @Mock private ResultSet resultSet;
  @Mock private ResultSet packageResultSet;
  @Mock private ResultSetMetaData metaData;
  @Mock private ResultSetMetaData packageMetaData;
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
  void shouldReturnEmptyWhenCsvImplementationDoesNotHandleDefinition() {
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.TENURE_REPORT,
            new LexisReportRequestDto(Map.of(), "CSV"),
            LexisReportFormat.CSV);

    assertThat(report).isEmpty();
    verifyNoInteractions(dataSource);
  }

  @Test
  void shouldFailExplicitReportWhenProcedureReturnsNoCursor() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.PROVINCIAL_TEAC_REPORT(?,?,?) }"))
        .thenReturn(callableStatement);
    when(callableStatement.getObject(3)).thenReturn(null);
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exportJurisdictionCode", "P"), "CSV");

    assertThatThrownBy(
            () ->
                service.generateLegacyCsvReport(
                    LexisJasperReportDefinition.TEAC_REPORT,
                    request,
                    LexisReportFormat.CSV))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessage("The TEAC report data could not be loaded")
        .hasMessageNotContaining("LEXIS_REPORTING")
        .hasCauseInstanceOf(SQLException.class);
  }

  @Test
  void shouldFailDynamicReportWhenProcedureReturnsNoCursor() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.APP_REPORT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(
            oracleConnection.createOracleArray(
                org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"),
                org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(null);
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    assertThatThrownBy(
            () ->
                service.generateLegacyCsvReport(
                    LexisJasperReportDefinition.APPLICATION_REPORT,
                    new LexisReportRequestDto(Map.of(), "CSV"),
                    LexisReportFormat.CSV))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessage("The application report data could not be loaded")
        .hasMessageNotContaining("LEXIS_REPORTING")
        .hasCauseInstanceOf(SQLException.class);
    verify(bindArray).free();
  }

  @Test
  void shouldStreamCsvRowsToFileAndCloseResources() throws Exception {
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
    AtomicInteger rowsRead = new AtomicInteger();
    when(resultSet.next())
        .thenAnswer(
            ignored -> {
              rowsRead.incrementAndGet();
              return rowsRead.get() == 1;
            });
    when(resultSet.getString(1)).thenReturn("X".repeat(64));

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    var report =
        service.generateLegacyCsvReport(
            LexisJasperReportDefinition.APPLICATION_REPORT,
            new LexisReportRequestDto(Map.of(), "CSV"),
            LexisReportFormat.CSV);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().contentLength()).isGreaterThan(48);
    assertThat(content(report.orElseThrow())).isNotEmpty();
    assertThat(rowsRead).hasValue(2);
    verify(resultSet).close();
    verify(callableStatement).close();
    verify(connection).close();
    verify(bindArray).free();
  }

  @Test
  void shouldCloseResourcesAndPreserveSqlErrorWhenStreamingCursorFails() throws Exception {
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
    when(resultSet.next()).thenReturn(true).thenThrow(new SQLException("cursor read failed"));
    when(resultSet.getString(1)).thenReturn("123");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    assertThatThrownBy(
            () ->
                service.generateLegacyCsvReport(
                    LexisJasperReportDefinition.APPLICATION_REPORT,
                    new LexisReportRequestDto(Map.of(), "CSV"),
                    LexisReportFormat.CSV))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessage("The application report data could not be loaded")
        .hasMessageNotContaining("LEXIS_REPORTING")
        .hasCauseInstanceOf(SQLException.class)
        .rootCause()
        .hasMessage("cursor read failed");

    verify(resultSet).close();
    verify(callableStatement).close();
    verify(connection).close();
    verify(bindArray).free();
  }

  @Test
  void shouldExposeTheLegacyCursorOnlyWithinTheManagedResourceScope() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.PROVINCIAL_TEAC_REPORT(?,?,?) }"))
        .thenReturn(callableStatement);
    when(callableStatement.getObject(3)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("X");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    var value =
        service.withLegacyTabularReportCursor(
            LexisJasperReportDefinition.TEAC_REPORT,
            new LexisReportRequestDto(Map.of("exportJurisdictionCode", "P"), "PDF"),
            cursor -> {
              assertThat(cursor.next()).isTrue();
              return cursor.getString(1);
            });

    assertThat(value).contains("X");

    verify(resultSet).setFetchSize(100);
    verify(resultSet).close();
    verify(callableStatement).close();
    verify(connection).close();
  }

  @Test
  void shouldFailBiweeklyReportWhenMainProcedureReturnsNoCursor() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_RPT(?,?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(callableStatement.getObject(5)).thenReturn(null);
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    assertThatThrownBy(
            () ->
                service.generateLegacyCsvReport(
                    LexisJasperReportDefinition.BIWEEKLY_LISTING,
                    new LexisReportRequestDto(Map.of(), "CSV"),
                    LexisReportFormat.CSV))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessageContaining("biweekly report data")
        .hasCauseInstanceOf(SQLException.class);
  }

  @Test
  void shouldFailBiweeklyReportWhenPackageProcedureReturnsNoCursor() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_RPT(?,?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_SUBREPORT_RPT(?,?,?) }"))
        .thenReturn(packageCallableStatement);
    when(callableStatement.getObject(5)).thenReturn(resultSet);
    when(packageCallableStatement.getObject(3)).thenReturn(null);
    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(2);
    when(metaData.getColumnName(1)).thenReturn("APPLICATION_NUMBER");
    when(metaData.getColumnName(2)).thenReturn("EXPORT_JURISDICTION_CODE");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("12345");
    when(resultSet.getString(2)).thenReturn("P");
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    assertThatThrownBy(
            () ->
                service.generateLegacyCsvReport(
                    LexisJasperReportDefinition.BIWEEKLY_LISTING,
                    new LexisReportRequestDto(Map.of(), "CSV"),
                    LexisReportFormat.CSV))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessageContaining("biweekly report data")
        .hasCauseInstanceOf(SQLException.class);
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

    String csv = new String(content(report.orElseThrow()));
    assertThat(csv).contains("\"ORG_UNIT\",\"VALUE\"");
    assertThat(csv).contains("\"12\",\"A\"\"B\"");

    verify(callableStatement).setString(1, "12,14");
    verify(callableStatement).setLong(2, 12345L);
    verify(callableStatement).setQueryTimeout(120);
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
    when(metaData.getColumnName(1)).thenReturn("EXEMPTION_NUMBER");
    when(metaData.getColumnName(2)).thenReturn("APPROVED_VOLUME");
    when(metaData.getColumnName(3)).thenReturn("EXPORT_EXEMPTION_STATUS_CODE");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("EX-123");
    when(resultSet.getString(2)).thenReturn("1200");
    when(resultSet.getString(3)).thenReturn("ACT");

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    var data =
        service.withLegacyTabularReportCursor(
            LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT,
            new LexisReportRequestDto(Map.of("exemptionNumber", "EX-123"), "PDF"),
            cursor -> {
              ResultSetMetaData metadata = cursor.getMetaData();
              List<String> headers =
                  List.of(
                      metadata.getColumnName(1),
                      metadata.getColumnName(2),
                      metadata.getColumnName(3));
              assertThat(cursor.next()).isTrue();
              return Map.entry(
                  headers,
                  List.of(cursor.getString(1), cursor.getString(2), cursor.getString(3)));
            });

    assertThat(data).isPresent();
    assertThat(data.orElseThrow().getKey())
        .containsExactly("EXEMPTION_NUMBER", "APPROVED_VOLUME", "EXPORT_EXEMPTION_STATUS_CODE");
    assertThat(data.orElseThrow().getValue()).containsExactly("EX-123", "1200", "ACT");

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
  void shouldGenerateBiweeklyCsvFromAdvertisingListReportProcedures() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_RPT(?,?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_SUBREPORT_RPT(?,?,?) }"))
        .thenReturn(packageCallableStatement);
    when(callableStatement.getObject(5)).thenReturn(resultSet);
    when(packageCallableStatement.getObject(3)).thenReturn(packageResultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    List<String> reportColumns =
        List.of(
            "ADVERTISING_DATE",
            "ORG_UNIT",
            "CLIENT_NAME",
            "ADDRESS_1",
            "ADDRESS_2",
            "ADDRESS_3",
            "CITY",
            "PROVINCE",
            "POSTAL_CODE",
            "OWNER_CONTACT_NAME",
            "BUSINESS_PHONE",
            "EMAIL_ADDRESS",
            "EXPORT_JURISDICTION_CODE",
            "APPLICATION_NUMBER",
            "FED_APPLICATION_NUMBER",
            "SPECIES_ENDUSE",
            "PRODUCT_TYPE",
            "PRODUCT_LOCATION",
            "EXEMPTION_APPLICATION_VOLUME",
            "AVERAGE_LOG_VOLUME",
            "AGENT_CLIENT_NAME",
            "AGENT_BUS_PHONE",
            "AGENT_CONTACT_NAME",
            "AGENT_EMAIL");
    List<String> reportValues =
        List.of(
            "2026-05-01",
            "Kootenay-Boundary Natural Resource Region",
            "Owner Client",
            "Address 1",
            "Address 2",
            "Address 3",
            "Victoria",
            "BC",
            "V8V1X4",
            "Owner Contact",
            "250-555-0101",
            "owner@example.gov.bc.ca",
            "P",
            "12345",
            "",
            "BA/PL",
            "Harvested Timber",
            "Landing",
            "100",
            "0.45",
            "Agent Client",
            "250-555-0102",
            "Agent Contact",
            "agent@example.gov.bc.ca");
    when(metaData.getColumnCount()).thenReturn(reportColumns.size());
    for (int index = 0; index < reportColumns.size(); index++) {
      when(metaData.getColumnName(index + 1)).thenReturn(reportColumns.get(index));
      when(resultSet.getString(index + 1)).thenReturn(reportValues.get(index));
    }
    when(resultSet.next()).thenReturn(true, false);

    when(packageResultSet.getMetaData()).thenReturn(packageMetaData);
    List<String> packageColumns =
        List.of(
            "PACKAGE_NUMBER",
            "PACKAGE_VOLUME",
            "EXPORT_GROWTH_TYPE_CODE",
            "AVERAGE_LENGTH",
            "AVERAGE_DIAMETER");
    List<String> packageValues = List.of("PKG-1", "75.5", "S", "12.5", "34.1");
    when(packageMetaData.getColumnCount()).thenReturn(packageColumns.size());
    for (int index = 0; index < packageColumns.size(); index++) {
      when(packageMetaData.getColumnName(index + 1)).thenReturn(packageColumns.get(index));
      when(packageResultSet.getString(index + 1)).thenReturn(packageValues.get(index));
    }
    when(packageResultSet.next()).thenReturn(true, false);

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

    String csv = new String(content(report.orElseThrow()));
    assertThat(csv)
        .contains(
            "\"CLIENT_CONTACT_PHONE\",\"CLIENT_CONTACT_EMAIL\",\"JURISDICTION_CODE\"");
    assertThat(csv)
        .contains(
            "\"AGENT_PHONE\",\"AGENT_CONTACT_NAME\",\"AGENT_CONTACT_EMAIL\",\"PACKAGE_NUMBER\"");
    assertThat(csv).contains("\"owner@example.gov.bc.ca\"");
    assertThat(csv).contains("\"agent@example.gov.bc.ca\"");
    assertThat(csv).contains("\"PKG-1\",\"75.5\",\"S\",\"12.5\",\"34.1\"");

    verify(callableStatement).setString(1, "1904,1905");
    verify(callableStatement).setNull(2, Types.VARCHAR);
    verify(callableStatement).setString(3, "2026-05-01");
    verify(callableStatement).setString(4, "2026-05-31");
    verify(callableStatement).registerOutParameter(5, Types.REF_CURSOR);
    verify(packageCallableStatement).setString(1, "12345");
    verify(packageCallableStatement).setString(2, "P");
    verify(packageCallableStatement).registerOutParameter(3, Types.REF_CURSOR);
  }

  @Test
  void shouldFailBiweeklyReportWhenAdvertisingListProcedureFails() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_RPT(?,?,?,?,?) }"))
        .thenThrow(new SQLException("invalid identifier"));

    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "fromDate", "2026-05-01",
                "toDate", "2026-05-31"),
            "CSV");

    assertThatThrownBy(
            () ->
                service.generateLegacyCsvReport(
                    LexisJasperReportDefinition.BIWEEKLY_LISTING,
                    request,
                    LexisReportFormat.CSV))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessageContaining("biweekly report data");
  }

  @Test
  void shouldNeutralizeSpreadsheetFormulaPrefixes() {
    OracleLegacyCsvReportService service = new OracleLegacyCsvReportService(dataSource);

    assertThat(service.sanitizeForCsv("=HYPERLINK(\"https://example.invalid\")"))
        .startsWith("'=HYPERLINK")
        .contains("\"\"");
    assertThat(service.sanitizeForCsv("  +1+1")).isEqualTo("'  +1+1");
    assertThat(service.sanitizeForCsv("\t@SUM(A1:A2)")).isEqualTo("'\t@SUM(A1:A2)");
    assertThat(service.sanitizeForCsv("ordinary value")).isEqualTo("ordinary value");
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
    return LexisBusinessTime.today().toString();
  }
}

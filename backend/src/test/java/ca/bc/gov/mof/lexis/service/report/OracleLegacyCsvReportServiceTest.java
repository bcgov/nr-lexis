package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
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
import java.util.Map;
import javax.sql.DataSource;
import oracle.jdbc.OracleConnection;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
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
    assertThat(report.orElseThrow().filename()).isEqualTo("teacReport.csv");
    assertThat(report.orElseThrow().mediaType()).isEqualTo("text/csv");

    String csv = new String(report.orElseThrow().content());
    assertThat(csv).contains("\"ORG_UNIT\",\"VALUE\"");
    assertThat(csv).contains("\"12\",\"A\"\"B\"");

    verify(callableStatement).setString(1, "12,14");
    verify(callableStatement).setLong(2, 12345L);
    verify(callableStatement).registerOutParameter(3, Types.REF_CURSOR);
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
    assertThat(report.orElseThrow().filename()).isEqualTo("applicationReport.csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("EEA.RECEIVED_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 6);
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
    assertThat(report.orElseThrow().filename()).isEqualTo("offerReport.csv");

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
    assertThat(report.orElseThrow().filename()).isEqualTo("feeReport.csv");

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
    assertThat(report.orElseThrow().filename()).isEqualTo("permitLedgerReport.csv");

    verify(callableStatement).setString(1, "2026-04-01");
    verify(callableStatement).setString(2, "2026-04-30");
    verify(callableStatement).setString(3, "20001");
    verify(callableStatement).setString(4, "1904,1905");
    verify(callableStatement).setString(6, "COM");
    verify(callableStatement).registerOutParameter(12, Types.REF_CURSOR);
  }

  @Test
  void shouldGenerateBiweeklyCsvFromLegacyDynamicProcedure() throws Exception {
    when(dataSource.getConnection()).thenReturn(connection);
    when(connection.prepareCall("{ call LEXIS_REPORTING.BIWEEKLY_REPORT_CSV(?,?,?,?) }"))
        .thenReturn(callableStatement);
    when(connection.unwrap(OracleConnection.class)).thenReturn(oracleConnection);
    when(oracleConnection.createOracleArray(org.mockito.ArgumentMatchers.eq("CBR_VARCHAR2_ARRAY"), org.mockito.ArgumentMatchers.any()))
        .thenReturn(bindArray);
    when(callableStatement.getObject(4)).thenReturn(resultSet);

    when(resultSet.getMetaData()).thenReturn(metaData);
    when(metaData.getColumnCount()).thenReturn(1);
    when(metaData.getColumnName(1)).thenReturn("APPLICATION_NUMBER");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("A-1");

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
    assertThat(report.orElseThrow().filename()).isEqualTo("biweeklyListing.csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("ES.ADVERTISING_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 8);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
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
    assertThat(report.orElseThrow().filename()).isEqualTo("transportReport.csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("A.EXPORT_PERMIT_ISSUE_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
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
    assertThat(report.orElseThrow().filename()).isEqualTo("exemptionReport.csv");

    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("E.APPROVAL_DATE BETWEEN TO_DATE(:1, 'yyyy-mm-dd')"));
    verify(callableStatement)
        .setString(
            org.mockito.ArgumentMatchers.eq(1),
            org.mockito.ArgumentMatchers.contains("E.APPROVAL_DATE IS NULL"));
    verify(callableStatement).setArray(2, bindArray);
    verify(callableStatement).setInt(3, 12);
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
  }
}

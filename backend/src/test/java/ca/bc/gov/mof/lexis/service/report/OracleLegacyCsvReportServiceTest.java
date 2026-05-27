package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Types;
import java.util.Map;
import javax.sql.DataSource;
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
}

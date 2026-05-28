package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OracleLegacyJasperTableReportServiceTest {

  @Mock private OracleLegacyCsvReportService legacyCsvReportService;

  @Test
  void shouldGeneratePdfForTeacReportUsingLegacyTabularData() {
    LegacyTabularReportData tabularData =
        new LegacyTabularReportData(
            List.of("ORG_UNIT", "EXPORT_SCHEDULE"),
            List.of(
                List.of("RKB", "12345"),
                List.of("RNO", "12345")));

    when(legacyCsvReportService.loadLegacyTabularReportData(
            LexisJasperReportDefinition.TEAC_REPORT,
            new LexisReportRequestDto(
                Map.of(
                    "exportJurisdictionCode", "P",
                    "exportSchedule", "12345",
                    "region", "[1904,1905]"),
                "PDF")))
        .thenReturn(Optional.of(tabularData));

    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Optional<LexisGeneratedReport> report =
        service.generateLegacyPdfReport(
            LexisJasperReportDefinition.TEAC_REPORT,
            new LexisReportRequestDto(
                Map.of(
                    "exportJurisdictionCode", "P",
                    "exportSchedule", "12345",
                    "region", "[1904,1905]"),
                "PDF"),
            LexisReportFormat.PDF);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("teacReport.pdf");
    assertThat(report.orElseThrow().mediaType()).isEqualTo("application/pdf");
    assertThat(report.orElseThrow().content()).isNotEmpty();
  }

  @Test
  void shouldReturnEmptyForUnsupportedDefinition() {
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Optional<LexisGeneratedReport> report =
        service.generateLegacyPdfReport(
            LexisJasperReportDefinition.EXEMPTION_REPORT,
            new LexisReportRequestDto(Map.of(), "PDF"),
            LexisReportFormat.PDF);

    assertThat(report).isEmpty();
  }
}

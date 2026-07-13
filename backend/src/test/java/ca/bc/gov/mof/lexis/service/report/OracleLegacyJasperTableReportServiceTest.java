package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.data.JRMapCollectionDataSource;
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
  void shouldGeneratePdfForApprovedExemptionReportUsingLegacyTabularData() {
    LegacyTabularReportData tabularData =
        new LegacyTabularReportData(
            List.of("EXEMPTION_NUMBER", "APPROVED_VOLUME", "EXPORT_EXEMPTION_STATUS_CODE"),
            List.of(List.of("EX-123", "1200", "ACT")));
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exemptionNumber", "EX-123"), "PDF");

    when(legacyCsvReportService.loadLegacyTabularReportData(
            LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT, request))
        .thenReturn(Optional.of(tabularData));

    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Optional<LexisGeneratedReport> report =
        service.generateLegacyPdfReport(
            LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT,
            request,
            LexisReportFormat.PDF);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("approvedExemptionReport.pdf");
    assertThat(report.orElseThrow().mediaType()).isEqualTo("application/pdf");
    assertThat(report.orElseThrow().content()).isNotEmpty();
  }

  @Test
  void shouldCollapseOverflowColumnsInsteadOfDroppingLegacyFallbackData() {
    LegacyTabularReportData tabularData =
        new LegacyTabularReportData(
            List.of(
                "COL_A",
                "COL_B",
                "COL_C",
                "COL_D",
                "COL_E",
                "COL_F",
                "COL_G",
                "COL_H",
                "COL_I",
                "COL_J",
                "COL_K",
                "COL_L",
                "COL_M",
                "COL_N"),
            List.of(
                List.of(
                    "value-a",
                    "value-b",
                    "value-c",
                    "value-d",
                    "value-e",
                    "value-f",
                    "value-g",
                    "value-h",
                    "value-i",
                    "value-j",
                    "value-k",
                    "value-l",
                    "value-m",
                    "value-n")));
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Map<String, Object> parameters =
        service.buildTemplateParameters(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT,
            new LexisReportRequestDto(Map.of(), "PDF"),
            tabularData);
    List<Map<String, ?>> rows = service.buildRowMaps(tabularData);

    assertThat(parameters)
        .containsEntry("P_COLUMN_COUNT", 12)
        .containsEntry("P_COL_HEADER_11", "COL_K")
        .containsEntry("P_COL_HEADER_12", "Additional Columns");
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).get("COL_11")).isEqualTo("value-k");
    assertThat(rows.get(0).get("COL_12"))
        .isEqualTo("COL_L=value-l; COL_M=value-m; COL_N=value-n");
  }

  @Test
  void shouldUseLegacyDisplayLabelsInFallbackSubtitlesWhenProvided() {
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Map<String, Object> parameters =
        service.buildTemplateParameters(
            LexisJasperReportDefinition.TEAC_REPORT,
            new LexisReportRequestDto(
                Map.of(
                    "exportJurisdictionCode", "F",
                    "exportJurisdictionCodeLabel", "Federal",
                    "exportSchedule", "1002",
                    "exportScheduleLabel", "2026-06-29",
                    "region", "1904,1905",
                    "regionLabel",
                    "Kootenay-Boundary Natural Resource Region, Skeena Natural Resource Region"),
                "PDF"),
            new LegacyTabularReportData(List.of("ORG_UNIT"), List.of()));

    assertThat(parameters)
        .containsEntry(
            "REPORT_SUBTITLE",
            "Jurisdiction: Federal | Schedule: 2026-06-29 | Region: "
                + "Kootenay-Boundary Natural Resource Region, Skeena Natural Resource Region");
  }

  @Test
  void shouldIncludeAllLegacySpeciesGradeFiltersInFallbackSubtitle() {
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Map<String, Object> parameters =
        service.buildTemplateParameters(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT,
            new LexisReportRequestDto(
                Map.ofEntries(
                    Map.entry("fromDate", "2026-01-01"),
                    Map.entry("toDate", "2026-01-31"),
                    Map.entry("region", "1904"),
                    Map.entry("regionLabel", "Kootenay-Boundary Natural Resource Region"),
                    Map.entry("permitStatus", "COM"),
                    Map.entry("permitStatusLabel", "Complete"),
                    Map.entry("exemptionNumber", "EX-123"),
                    Map.entry("exemptionType", "OIC"),
                    Map.entry("exemptionReason", "SEC128"),
                    Map.entry("growthType", "OLD"),
                    Map.entry("timberMark", "TM123"),
                    Map.entry("forestFileId", "A12345")),
                "PDF"),
            new LegacyTabularReportData(List.of("SPECIES"), List.of()));

    assertThat(parameters)
        .containsEntry(
            "REPORT_SUBTITLE",
            "From: 2026-01-01 | To: 2026-01-31 | Region: "
                + "Kootenay-Boundary Natural Resource Region | Permit Status: Complete"
                + " | Exemption: EX-123 | Type: OIC | Reason: SEC128 | Growth: OLD"
                + " | Timber Mark: TM123 | Forest File: A12345");
  }

  @Test
  void shouldMapLegacyTeacJurisdictionCodesInFallbackSubtitles() {
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Map<String, Object> parameters =
        service.buildTemplateParameters(
            LexisJasperReportDefinition.TEAC_REPORT,
            new LexisReportRequestDto(
                Map.of(
                    "exportJurisdictionCode", "P",
                    "exportSchedule", "1001",
                    "region", "1904"),
                "PDF"),
            new LegacyTabularReportData(List.of("ORG_UNIT"), List.of()));

    assertThat(parameters)
        .containsEntry(
            "REPORT_SUBTITLE",
            "Jurisdiction: Provincial | Schedule: 1001 | Region: 1904");
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

  @Test
  void shouldPropagateWhenMigratedLegacyPdfRenderFails() {
    LegacyTabularReportData tabularData =
        new LegacyTabularReportData(List.of("ORG_UNIT"), List.of(List.of("RKB")));
    LexisReportRequestDto request = new LexisReportRequestDto(Map.of(), "PDF");
    when(legacyCsvReportService.loadLegacyTabularReportData(
            LexisJasperReportDefinition.TEAC_REPORT, request))
        .thenReturn(Optional.of(tabularData));
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService) {
          @Override
          byte[] renderPdf(Map<String, Object> parameters, JRMapCollectionDataSource dataSource)
              throws JRException {
            throw new JRException("render failed");
          }
        };

    assertThatThrownBy(
            () ->
                service.generateLegacyPdfReport(
                    LexisJasperReportDefinition.TEAC_REPORT,
                    request,
                    LexisReportFormat.PDF))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessage("The migrated report could not be rendered for teacReport")
        .hasCauseInstanceOf(JRException.class);
  }
}

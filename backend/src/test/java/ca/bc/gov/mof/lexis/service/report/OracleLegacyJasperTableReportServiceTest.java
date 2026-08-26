package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.test.ReportTestArtifacts.content;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.io.OutputStream;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JRPrintElement;
import net.sf.jasperreports.engine.JRPrintFrame;
import net.sf.jasperreports.engine.JRPrintText;
import net.sf.jasperreports.engine.JasperPrint;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OracleLegacyJasperTableReportServiceTest {

  @Mock private OracleLegacyCsvReportService legacyCsvReportService;

  @Test
  void shouldGeneratePdfForTeacReportUsingLegacyCursorData() throws Exception {
    TabularData tabularData =
        new TabularData(
            List.of("ORG_UNIT", "EXPORT_SCHEDULE"),
            List.of(
                List.of("RKB", "12345"),
                List.of("RNO", "12345")));

    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "exportJurisdictionCode", "P",
                "exportSchedule", "12345",
                "region", "[1904,1905]"),
            "PDF");
    stubCursor(LexisJasperReportDefinition.TEAC_REPORT, request, tabularData);

    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Optional<LexisGeneratedReport> report =
        service.generateLegacyPdfReport(
            LexisJasperReportDefinition.TEAC_REPORT,
            request,
            LexisReportFormat.PDF);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("teac-package-report.pdf");
    assertThat(report.orElseThrow().mediaType()).isEqualTo("application/pdf");
    assertThat(content(report.orElseThrow())).isNotEmpty();
  }

  @Test
  void shouldGeneratePdfForApprovedExemptionReportUsingLegacyCursorData() throws Exception {
    TabularData tabularData =
        new TabularData(
            List.of("EXEMPTION_NUMBER", "APPROVED_VOLUME", "EXPORT_EXEMPTION_STATUS_CODE"),
            List.of(List.of("EX-123", "1200", "ACT")));
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exemptionNumber", "EX-123"), "PDF");

    stubCursor(
        LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT, request, tabularData);

    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService);

    Optional<LexisGeneratedReport> report =
        service.generateLegacyPdfReport(
            LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT,
            request,
            LexisReportFormat.PDF);

    assertThat(report).isPresent();
    assertThat(report.orElseThrow().filename()).isEqualTo("approved-exemption.pdf");
    assertThat(report.orElseThrow().mediaType()).isEqualTo("application/pdf");
    assertThat(content(report.orElseThrow())).isNotEmpty();
  }

  @Test
  void shouldRenderApprovedExemptionFieldsWithBusinessLabels() throws Exception {
    TabularData tabularData =
        new TabularData(
            List.of(
                "EXEMPTION_NUMBER",
                "APPROVED_VOLUME",
                "APPROVAL_DATE",
                "EXPIRY_DATE",
                "OTHER_CONDITIONS",
                "ENTRY_USERID",
                "ENTRY_TIMESTAMP",
                "UPDATE_USERID",
                "UPDATE_TIMESTAMP",
                "EXPORT_EXEMPTION_TYPE_CODE",
                "EXPORT_EXEMPTION_STATUS_CODE",
                "STATUS_DESCRIPTION",
                "VOLUME_REMAINING",
                "ADVERTISING_DATE",
                "ORG_UNIT_NAME",
                "AGENT_CLIENT_NUMBER",
                "OWNER_CLIENT_NUMBER"),
            List.of(
                List.of(
                    "EX-123",
                    "1200",
                    "2026-03-01",
                    "2028-02-28",
                    "testing",
                    "IDIR\\CREATOR",
                    "2026-03-01 09:00:00",
                    "IDIR\\EDITOR",
                    "2026-03-05 16:07:10",
                    "B",
                    "ACT",
                    "Active",
                    "999",
                    "",
                    "Skeena",
                    "",
                    "00002176")));
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exemptionNumber", "EX-123"), "PDF");
    stubCursor(
        LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT, request, tabularData);

    List<String> renderedText = new java.util.ArrayList<>();
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService) {
          @Override
          void exportPdf(JasperPrint print, OutputStream output) {
            print
                .getPages()
                .forEach(page -> collectText(page.getElements(), renderedText));
          }
        };

    Optional<LexisGeneratedReport> report =
        service.generateLegacyPdfReport(
            LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT,
            request,
            LexisReportFormat.PDF);

    assertThat(report).isPresent();
    assertThat(renderedText)
        .contains("Exemption number", "EX-123", "Owner client number", "00002176")
        .noneMatch(
            text -> text.contains("Additional Columns") || text.contains("EXEMPTION_NUMBER"));
  }

  @Test
  void shouldReleaseLegacyCursorBeforeExportingPdfArtifact() throws Exception {
    LexisReportRequestDto request = new LexisReportRequestDto(Map.of(), "PDF");
    AtomicBoolean cursorReleased = new AtomicBoolean(false);
    ResultSet resultSet = resultSet(new TabularData(List.of("ORG_UNIT"), List.of(List.of("RKB"))));
    doAnswer(
            invocation -> {
              OracleLegacyCsvReportService.LegacyCursorProcessor<?, ?> processor =
                  invocation.getArgument(2);
              try {
                return Optional.of(processor.process(resultSet));
              } finally {
                cursorReleased.set(true);
              }
            })
        .when(legacyCsvReportService)
        .withLegacyTabularReportCursor(
            eq(LexisJasperReportDefinition.TEAC_REPORT), eq(request), any());
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService) {
          @Override
          void exportPdf(JasperPrint print, OutputStream output) {
            assertThat(cursorReleased).isTrue();
          }
        };

    LexisGeneratedReport report =
        service
            .generateLegacyPdfReport(
                LexisJasperReportDefinition.TEAC_REPORT, request, LexisReportFormat.PDF)
            .orElseThrow();

    assertThat(content(report)).isEmpty();
  }

  @Test
  void shouldCollapseOverflowColumnsInsteadOfDroppingLegacyFallbackData() {
    TabularData tabularData =
        new TabularData(
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
            tabularData.columnHeaders());
    String overflow =
        service.overflowColumns(tabularData.columnHeaders(), tabularData.rows().getFirst());

    assertThat(parameters)
        .containsEntry("P_COLUMN_COUNT", 12)
        .containsEntry("P_COL_HEADER_11", "COL_K")
        .containsEntry("P_COL_HEADER_12", "Additional Columns");
    assertThat(overflow).isEqualTo("COL_L=value-l; COL_M=value-m; COL_N=value-n");
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
            List.of("ORG_UNIT"));

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
            List.of("SPECIES"));

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
            List.of("ORG_UNIT"));

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
  void shouldPropagateWhenMigratedLegacyPdfRenderFails() throws Exception {
    TabularData tabularData =
        new TabularData(List.of("ORG_UNIT"), List.of(List.of("RKB")));
    LexisReportRequestDto request = new LexisReportRequestDto(Map.of(), "PDF");
    stubCursor(LexisJasperReportDefinition.TEAC_REPORT, request, tabularData);
    OracleLegacyJasperTableReportService service =
        new OracleLegacyJasperTableReportService(legacyCsvReportService) {
          @Override
          void exportPdf(JasperPrint print, OutputStream output) throws JRException {
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

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursor(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request,
      TabularData data)
      throws Exception {
    ResultSet resultSet = resultSet(data);

    doAnswer(
            invocation -> {
              OracleLegacyCsvReportService.LegacyCursorProcessor processor =
                  invocation.getArgument(2);
              return Optional.of(processor.process(resultSet));
            })
        .when(legacyCsvReportService)
        .withLegacyTabularReportCursor(eq(definition), eq(request), any());
  }

  private ResultSet resultSet(TabularData data) throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    ResultSetMetaData metadata = mock(ResultSetMetaData.class);
    when(resultSet.getMetaData()).thenReturn(metadata);
    when(metadata.getColumnCount()).thenReturn(data.columnHeaders().size());
    for (int index = 1; index <= data.columnHeaders().size(); index++) {
      when(metadata.getColumnName(index)).thenReturn(data.columnHeaders().get(index - 1));
    }

    AtomicInteger rowIndex = new AtomicInteger(-1);
    when(resultSet.next())
        .thenAnswer(invocation -> rowIndex.incrementAndGet() < data.rows().size());
    when(resultSet.getString(anyInt()))
        .thenAnswer(
            invocation ->
                data.rows().get(rowIndex.get()).get(invocation.getArgument(0, Integer.class) - 1));
    return resultSet;
  }

  private void collectText(List<JRPrintElement> elements, List<String> renderedText) {
    for (JRPrintElement element : elements) {
      if (element instanceof JRPrintText text && text.getFullText() != null) {
        renderedText.add(text.getFullText());
      }
      if (element instanceof JRPrintFrame frame) {
        collectText(frame.getElements(), renderedText);
      }
    }
  }

  private record TabularData(List<String> columnHeaders, List<List<String>> rows) {}
}

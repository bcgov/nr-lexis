package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.test.ReportTestArtifacts.report;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import net.sf.jasperreports.engine.JRRuntimeException;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.base.JRBasePrintPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class OracleLexisReportServiceFormatSupportTest {

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void shouldPreserveRequestedSpreadsheetFormat() {
    OracleLexisReportService service = createService();

    assertThat(service.normalizeRequestedFormat(LexisReportFormat.XLS))
        .isEqualTo(LexisReportFormat.XLS);
    assertThat(service.normalizeRequestedFormat(LexisReportFormat.XLSX))
        .isEqualTo(LexisReportFormat.XLSX);
    assertThat(service.normalizeRequestedFormat(LexisReportFormat.PDF))
        .isEqualTo(LexisReportFormat.PDF);
  }

  @Test
  void shouldForceApprovedExemptionReportToPdf() {
    OracleLexisReportService service = createService();

    assertThat(
            service.resolveEffectiveFormat(
                LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT, LexisReportFormat.CSV))
        .isEqualTo(LexisReportFormat.PDF);
    assertThat(
            service.resolveEffectiveFormat(
                LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT, LexisReportFormat.XLS))
        .isEqualTo(LexisReportFormat.PDF);
  }

  @Test
  void shouldForcePermitReportToPdf() {
    OracleLexisReportService service = createService();

    assertThat(
            service.resolveEffectiveFormat(
                LexisJasperReportDefinition.PERMIT_REPORT, LexisReportFormat.CSV))
        .isEqualTo(LexisReportFormat.PDF);
    assertThat(
            service.resolveEffectiveFormat(
                LexisJasperReportDefinition.PERMIT_REPORT, LexisReportFormat.XLS))
        .isEqualTo(LexisReportFormat.PDF);
  }

  @Test
  void shouldKeepNonApprovedReportsOnNormalizedFormat() {
    OracleLexisReportService service = createService();

    assertThat(
            service.resolveEffectiveFormat(
                LexisJasperReportDefinition.EXEMPTION_REPORT, LexisReportFormat.CSV))
        .isEqualTo(LexisReportFormat.CSV);
  }

  @Test
  void shouldSupportPdfCsvAndSpreadsheetTemplateExports() {
    OracleLexisReportService service = createService();

    assertThat(service.isTemplateFormatSupported(LexisReportFormat.PDF)).isTrue();
    assertThat(service.isTemplateFormatSupported(LexisReportFormat.CSV)).isTrue();
    assertThat(service.isTemplateFormatSupported(LexisReportFormat.XLS)).isTrue();
    assertThat(service.isTemplateFormatSupported(LexisReportFormat.XLSX)).isTrue();
    assertThat(service.isTemplateFormatSupported(LexisReportFormat.RTF)).isFalse();
  }

  @Test
  void shouldReturnLegacyCsvReportBeforeFillingJasperTemplate() {
    DataSource dataSource = Mockito.mock(DataSource.class);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    LexisGeneratedReport legacyReport =
        report(
            "offerReport2026-06-04.csv",
            "application/vnd.ms-excel",
            (byte) 'c',
            (byte) 's',
            (byte) 'v');
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("region", "1904"), "CSV");
    Mockito.when(
            legacyCsvReportService.generateLegacyCsvReport(
                LexisJasperReportDefinition.OFFER_REPORT, request, LexisReportFormat.CSV))
        .thenReturn(Optional.of(legacyReport));
    OracleLexisReportService service =
        createService(dataSource, legacyCsvReportService, legacyJasperTableReportService);

    Optional<LexisGeneratedReport> result = service.generateReport("offerReport", request);

    assertThat(result).containsSame(legacyReport);
    verify(legacyCsvReportService)
        .generateLegacyCsvReport(
            LexisJasperReportDefinition.OFFER_REPORT, request, LexisReportFormat.CSV);
    verifyNoInteractions(legacyJasperTableReportService, dataSource);
  }

  @Test
  void shouldReturnLegacyPdfFallbackBeforeRejectingTemplatelessReport() {
    DataSource dataSource = Mockito.mock(DataSource.class);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    LexisGeneratedReport legacyReport =
        report(
            "speciesGradeReport.pdf", "application/pdf", (byte) 1, (byte) 2, (byte) 3);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("region", "1904"), "PDF");
    LexisReportRequestDto effectiveRequest =
        new LexisReportRequestDto(Map.of("region", "1904", "permitStatus", "COM"), "PDF");
    Mockito.when(
            legacyJasperTableReportService.generateLegacyPdfReport(
                LexisJasperReportDefinition.SPECIES_GRADE_REPORT,
                effectiveRequest,
                LexisReportFormat.PDF))
        .thenReturn(Optional.of(legacyReport));
    OracleLexisReportService service =
        createService(dataSource, legacyCsvReportService, legacyJasperTableReportService);

    Optional<LexisGeneratedReport> result = service.generateReport("speciesGradeReport", request);

    assertThat(result).containsSame(legacyReport);
    verify(legacyCsvReportService)
        .generateLegacyCsvReport(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT,
            effectiveRequest,
            LexisReportFormat.PDF);
    verify(legacyJasperTableReportService)
        .generateLegacyPdfReport(
            LexisJasperReportDefinition.SPECIES_GRADE_REPORT,
            effectiveRequest,
            LexisReportFormat.PDF);
    verifyNoInteractions(dataSource);
  }

  @Test
  void shouldUseEffectivePdfFormatForApprovedExemptionFallback() {
    DataSource dataSource = Mockito.mock(DataSource.class);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    LexisGeneratedReport legacyReport =
        report("approvedExemptionReport.pdf", "application/pdf", (byte) 1);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exemptionNumber", "EX-123"), "CSV");
    Mockito.when(
            legacyJasperTableReportService.generateLegacyPdfReport(
                eq(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT),
                any(LexisReportRequestDto.class),
                eq(LexisReportFormat.PDF)))
        .thenReturn(Optional.of(legacyReport));
    OracleLexisReportService service =
        createService(dataSource, legacyCsvReportService, legacyJasperTableReportService);

    Optional<LexisGeneratedReport> result =
        service.generateReport("approvedExemptionReport", request);

    assertThat(result).containsSame(legacyReport);
    verify(legacyCsvReportService)
        .generateLegacyCsvReport(
            eq(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT),
            any(LexisReportRequestDto.class),
            eq(LexisReportFormat.PDF));
    verify(legacyJasperTableReportService)
        .generateLegacyPdfReport(
            eq(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT),
            any(LexisReportRequestDto.class),
            eq(LexisReportFormat.PDF));
    verifyNoInteractions(dataSource);
  }

  @Test
  void shouldPropagateWhenJasperReportCannotConnectToOracle() throws Exception {
    DataSource dataSource = Mockito.mock(DataSource.class);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    Mockito.when(dataSource.getConnection()).thenThrow(new SQLException("package invalid"));
    OracleLexisReportService service =
        createService(dataSource, legacyCsvReportService, legacyJasperTableReportService);

    assertThatThrownBy(
            () ->
                service.generateReport(
                    "feeReport", new LexisReportRequestDto(Map.of(), "PDF")))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessage("The report data could not be loaded for feeReport")
        .hasCauseInstanceOf(SQLException.class);
  }

  @Test
  void shouldTranslateJasperRuntimeFailuresDuringReportRender() throws Exception {
    DataSource dataSource = Mockito.mock(DataSource.class);
    Connection connection = Mockito.mock(Connection.class);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    Mockito.when(dataSource.getConnection()).thenReturn(connection);
    OracleLexisReportService service =
        new OracleLexisReportService(
            dataSource,
            new LexisJasperReportParameterProvider(),
            legacyCsvReportService,
            legacyJasperTableReportService,
            Mockito.mock(PermitRpcRepository.class),
            Mockito.mock(LexisReportScheduleRepository.class),
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER")) {
          @Override
          JasperReport compileTemplate(LexisJasperReportDefinition definition) {
            try (var input =
                new ClassPathResource("reports/lexis/LEXIS_DYNAMIC_TABLE.jrxml").getInputStream()) {
              return JasperCompileManager.compileReport(input);
            } catch (Exception ex) {
              throw new IllegalStateException("test template could not be compiled", ex);
            }
          }

          @Override
          void exportTemplateReport(
              JasperPrint print,
              LexisReportFormat format,
              LexisJasperReportDefinition definition,
              OutputStream output) {
            throw new JRRuntimeException("font unavailable");
          }
        };

    assertThatThrownBy(
            () ->
                service.generateReport(
                    "feeReport", new LexisReportRequestDto(Map.of(), "PDF")))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessage("The report could not be rendered for feeReport")
        .hasCauseInstanceOf(JRRuntimeException.class);
  }

  @Test
  void shouldCloseOracleConnectionBeforeExportingTemplateArtifact() throws Exception {
    DataSource dataSource = Mockito.mock(DataSource.class);
    Connection connection = Mockito.mock(Connection.class);
    AtomicBoolean connectionClosed = new AtomicBoolean(false);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    Mockito.when(dataSource.getConnection()).thenReturn(connection);
    Mockito.doAnswer(
            invocation -> {
              connectionClosed.set(true);
              return null;
            })
        .when(connection)
        .close();
    OracleLexisReportService service =
        new OracleLexisReportService(
            dataSource,
            new LexisJasperReportParameterProvider(),
            legacyCsvReportService,
            legacyJasperTableReportService,
            Mockito.mock(PermitRpcRepository.class),
            Mockito.mock(LexisReportScheduleRepository.class),
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER")) {
          @Override
          JasperReport compileTemplate(LexisJasperReportDefinition definition) {
            try (var input =
                new ClassPathResource("reports/lexis/LEXIS_DYNAMIC_TABLE.jrxml").getInputStream()) {
              return JasperCompileManager.compileReport(input);
            } catch (Exception ex) {
              throw new IllegalStateException("test template could not be compiled", ex);
            }
          }

          @Override
          void exportTemplateReport(
              JasperPrint print,
              LexisReportFormat format,
              LexisJasperReportDefinition definition,
              OutputStream output) {
            assertThat(connectionClosed).isTrue();
            try {
              output.write("report".getBytes(StandardCharsets.UTF_8));
            } catch (IOException ex) {
              throw new AssertionError("test report could not be written", ex);
            }
          }
        };

    LexisGeneratedReport report =
        service
            .generateReport("feeReport", new LexisReportRequestDto(Map.of(), "PDF"))
            .orElseThrow();

    assertThat(report.contentLength()).isEqualTo(6);
    Mockito.verify(connection).close();
    Files.deleteIfExists(report.artifactPath());
  }

  @Test
  void shouldPropagateWhenJasperTemplatePreparationFails() {
    DataSource dataSource = Mockito.mock(DataSource.class);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    OracleLexisReportService service =
        new OracleLexisReportService(
            dataSource,
            new LexisJasperReportParameterProvider(),
            legacyCsvReportService,
            legacyJasperTableReportService,
            Mockito.mock(PermitRpcRepository.class),
            Mockito.mock(LexisReportScheduleRepository.class),
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER")) {
          @Override
          JasperReport compileTemplate(LexisJasperReportDefinition definition) {
            throw new IllegalStateException("template invalid");
          }
        };

    assertThatThrownBy(
            () ->
                service.generateReport(
                    "feeReport", new LexisReportRequestDto(Map.of(), "PDF")))
        .isInstanceOf(LexisReportGenerationException.class)
        .hasMessage("The report template could not be prepared for feeReport")
        .hasCauseInstanceOf(IllegalStateException.class);
    verifyNoInteractions(dataSource);
  }

  @Test
  void shouldExportCsvFromJasperPrint() throws Exception {
    OracleLexisReportService service = createService();

    JasperPrint print = new JasperPrint();
    print.setName("test-print");
    print.setPageWidth(50);
    print.setPageHeight(50);
    print.addPage(new JRBasePrintPage());

    ByteArrayOutputStream output = new ByteArrayOutputStream();
    service.exportTemplateCsv(print, output);
    byte[] csvBytes = output.toByteArray();

    assertThat(csvBytes).isNotNull();
    assertThat(csvBytes.length).isGreaterThanOrEqualTo(0);
  }

  @Test
  void shouldNeutralizeFormulaCellsInTemplateCsv() throws Exception {
    StringWriter output = new StringWriter();
    try (CsvSanitizingWriter writer = new CsvSanitizingWriter(output)) {
      writer.write("\"safe\",\"=cmd\",\"  +SUM(A1)\",\"@user\",\"-2\"\n");
    }
    String safe = output.toString();

    assertThat(safe)
        .isEqualTo("\"safe\",\"'=cmd\",\"'  +SUM(A1)\",\"'@user\",\"'-2\"\n");
  }

  @Test
  void shouldExportXlsxFromJasperPrint() throws Exception {
    OracleLexisReportService service = createService();

    JasperPrint print = new JasperPrint();
    print.setName("test-print");
    print.setPageWidth(50);
    print.setPageHeight(50);
    print.addPage(new JRBasePrintPage());

    ByteArrayOutputStream output = new ByteArrayOutputStream();
    service.exportTemplateXlsx(print, output);
    byte[] xlsxBytes = output.toByteArray();

    assertThat(xlsxBytes).isNotNull();
    assertThat(xlsxBytes).startsWith(new byte[] {'P', 'K'});
  }

  @Test
  void shouldExportRealBiffXlsFromJasperPrint() throws Exception {
    OracleLexisReportService service = createService();

    JasperPrint print = new JasperPrint();
    print.setName("test-print");
    print.setPageWidth(50);
    print.setPageHeight(50);
    print.addPage(new JRBasePrintPage());

    ByteArrayOutputStream output = new ByteArrayOutputStream();
    service.exportTemplateXls(print, output);
    byte[] xlsBytes = output.toByteArray();

    assertThat(xlsBytes)
        .startsWith(
            new byte[] {
              (byte) 0xD0,
              (byte) 0xCF,
              (byte) 0x11,
              (byte) 0xE0,
              (byte) 0xA1,
              (byte) 0xB1,
              (byte) 0x1A,
              (byte) 0xE1
            });
  }

  @Test
  void shouldNotApplyRetiredBiweeklyIndustryScheduleDefaults() {
    LexisReportScheduleRepository scheduleRepository = Mockito.mock(LexisReportScheduleRepository.class);
    OracleLexisReportService service = createService(scheduleRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "legacyActionMapping", "generateIndustryCSV",
                "fromDate", "2025-01-01",
                "toDate", "2025-01-31",
                "region", "12",
                "orgUnitNumber", "14",
                "exportJurisdictionCode", "F"),
            "CSV");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.BIWEEKLY_LISTING, request);

    assertThat(result).isSameAs(request);
    assertThat(result.parameters())
        .containsEntry("legacyActionMapping", "generateIndustryCSV")
        .containsEntry("fromDate", "2025-01-01")
        .containsEntry("toDate", "2025-01-31")
        .containsEntry("region", "12")
        .containsEntry("orgUnitNumber", "14")
        .containsEntry("exportJurisdictionCode", "F")
        .doesNotContainEntry("jurisdiction", "P");
    Mockito.verifyNoInteractions(scheduleRepository);
  }

  @Test
  void shouldApplyLegacyBiweeklyScheduleDefaultsForBlankMofrGenerateRequest() {
    LexisReportScheduleRepository scheduleRepository = Mockito.mock(LexisReportScheduleRepository.class);
    Mockito.when(scheduleRepository.findCurrentSchedulesRequired())
        .thenReturn(
            List.of(
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1001L, LocalDate.of(2026, 6, 15)),
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1002L, LocalDate.of(2026, 6, 29))));
    OracleLexisReportService service = createService(scheduleRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of("legacyActionMapping", "generate", "exportJurisdictionCode", "F"),
            "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.BIWEEKLY_LISTING, request);

    assertThat(result.parameters())
        .containsEntry("legacyActionMapping", "generate")
        .containsEntry("fromDate", "2026-06-15")
        .containsEntry("toDate", "2026-06-28")
        .containsEntry("exportJurisdictionCode", "F")
        .doesNotContainEntry("jurisdiction", "P");
  }

  @Test
  void shouldKeepExplicitBiweeklyGenerateDatesUnchanged() {
    LexisReportScheduleRepository scheduleRepository = Mockito.mock(LexisReportScheduleRepository.class);
    OracleLexisReportService service = createService(scheduleRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "legacyActionMapping", "generate",
                "fromDate", "2026-05-01",
                "toDate", "2026-05-31",
                "exportJurisdictionCode", "F"),
            "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.BIWEEKLY_LISTING, request);

    assertThat(result).isSameAs(request);
    Mockito.verifyNoInteractions(scheduleRepository);
  }

  @Test
  void shouldNotGenerateUnboundedBiweeklyReportWhenScheduleDefaultsAreUnavailable() throws Exception {
    DataSource dataSource = Mockito.mock(DataSource.class);
    OracleLegacyCsvReportService legacyCsvReportService = Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    LexisReportScheduleRepository scheduleRepository = Mockito.mock(LexisReportScheduleRepository.class);
    Mockito.when(scheduleRepository.findCurrentSchedulesRequired()).thenReturn(List.of());
    OracleLexisReportService service =
        createService(
            dataSource,
            legacyCsvReportService,
            legacyJasperTableReportService,
            scheduleRepository,
            Mockito.mock(PermitRpcRepository.class));
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("legacyActionMapping", "generate"), "PDF");

    assertThatThrownBy(() -> service.generateReport("biweeklyListing", request))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessage(
            "The current advertising period is unavailable because two advertising schedule "
                + "dates are not configured.");

    Mockito.verify(scheduleRepository).findCurrentSchedulesRequired();
    verifyNoInteractions(dataSource, legacyCsvReportService, legacyJasperTableReportService);
  }

  @Test
  void shouldPropagateCurrentScheduleLookupFailureForBlankBiweeklyRequest() {
    LexisReportScheduleRepository scheduleRepository = Mockito.mock(LexisReportScheduleRepository.class);
    Mockito.when(scheduleRepository.findCurrentSchedulesRequired())
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    OracleLexisReportService service = createService(scheduleRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("legacyActionMapping", "generate"), "PDF");

    assertThatThrownBy(
            () ->
                service.applyLegacyReportDefaults(
                    LexisJasperReportDefinition.BIWEEKLY_LISTING, request))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void shouldApplyLegacySpeciesGradePermitStatusDefault() {
    OracleLexisReportService service = createService();
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("region", "1903,1904"), "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.SPECIES_GRADE_REPORT, request);

    assertThat(result.parameters())
        .containsEntry("region", "1903,1904")
        .containsEntry("permitStatus", "COM");
  }

  @Test
  void shouldKeepExplicitSpeciesGradePermitStatus() {
    OracleLexisReportService service = createService();
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitStatus", "ACT"), "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.SPECIES_GRADE_REPORT, request);

    assertThat(result.parameters()).containsEntry("permitStatus", "ACT");
  }

  @Test
  void shouldApplyLegacyTenureDateDefaults() {
    OracleLexisReportService service = createService();
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("legacyActionMapping", "generatePermitReport"), "PDF");
    LocalDate today = LexisBusinessTime.today();
    LocalDate previousMonth = today.minusMonths(1);

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(result.parameters())
        .containsEntry("legacyActionMapping", "generatePermitReport")
        .containsEntry("fromDate", LocalDate.of(today.getYear() - 1, today.getMonth(), 1).toString())
        .containsEntry(
            "toDate", previousMonth.withDayOfMonth(previousMonth.lengthOfMonth()).toString());
  }

  @Test
  void shouldKeepExplicitTenureDates() {
    OracleLexisReportService service = createService();
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of("fromDate", "2026-01-01", "toDate", "2026-01-31"),
            "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(result.parameters())
        .containsEntry("fromDate", "2026-01-01")
        .containsEntry("toDate", "2026-01-31");
  }

  @Test
  void shouldApplyLegacyPermitReportInvoiceDefaultFromGbmsHistory() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistoryRequired("", 900100L, false))
        .thenReturn(
            List.of(
                new PermitRpcRepository.GbmsInvoiceHistoryRow(
                    "INV-GBMS", null, null, 900100L, 0.0d, null, null, null)));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters())
        .containsEntry("permitNumber", "900100")
        .containsEntry("invoiceNumber", "INV-GBMS");
  }

  @Test
  void shouldUseReadOnlyGbmsHistoryPackageForReadOnlyPermitReportUsers() {
    SecurityContextHolder.getContext()
        .setAuthentication(new TestingAuthenticationToken("user", "n/a", "LEXIS_READ_ONLY"));
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistoryRequired("", 900100L, true))
        .thenReturn(
            List.of(
                new PermitRpcRepository.GbmsInvoiceHistoryRow(
                    "INV-READONLY", null, null, 900100L, 0.0d, null, null, null)));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "INV-READONLY");
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistoryRequired("", 900100L, true);
  }

  @Test
  void shouldResolvePermitReportInvoiceNumberFromGbmsEvenWhenRequestIncludesInvoice() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistoryRequired("", 900100L, false))
        .thenReturn(
            List.of(
                new PermitRpcRepository.GbmsInvoiceHistoryRow(
                    "INV-GBMS", null, null, 900100L, 0.0d, null, null, null)));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of("permitNumber", "900100", "invoiceNumber", "INV-REQUEST"),
            "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "INV-GBMS");
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistoryRequired("", 900100L, false);
  }

  @Test
  void shouldBlankPermitReportInvoiceNumberWhenGbmsHistoryHasNoInvoice() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistoryRequired("", 900100L, false))
        .thenReturn(List.of());
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of("permitNumber", "900100", "invoiceNumber", "INV-REQUEST"),
            "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "");
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistoryRequired("", 900100L, false);
  }

  @Test
  void shouldFailPermitReportDefaultsWhenGbmsHistoryCannotBeLoaded() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    DataAccessResourceFailureException outage =
        new DataAccessResourceFailureException("GBMS history unavailable");
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistoryRequired("", 900100L, false))
        .thenThrow(outage);
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    assertThatThrownBy(
            () ->
                service.applyLegacyReportDefaults(
                    LexisJasperReportDefinition.PERMIT_REPORT, request))
        .isSameAs(outage);

    Mockito.verify(permitRpcRepository)
        .findGbmsInvoiceHistoryRequired("", 900100L, false);
  }

  @Test
  void shouldRejectPermitReportWhenUserIsNotPermitOrApplicationClient() {
    DataSource dataSource = Mockito.mock(DataSource.class);
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000001", "00000002")));
    Mockito.when(permitRpcRepository.findApplicationNumbersByPermitNumberRequired(900100L))
        .thenReturn(List.of(1001L));
    Mockito.when(permitRpcRepository.findApplicationInfoByNumber(1001L))
        .thenReturn(Optional.of(applicationRow(1001L, "00000003", "00000004")));
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "n/a", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    OracleLexisReportService service =
        createService(
            dataSource,
            legacyCsvReportService,
            legacyJasperTableReportService,
            Mockito.mock(LexisReportScheduleRepository.class),
            permitRpcRepository);

    Optional<LexisGeneratedReport> result =
        service.generateReport(
            "permitReport",
            new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF"));

    assertThat(result).isEmpty();
    verifyNoInteractions(dataSource, legacyCsvReportService, legacyJasperTableReportService);
    Mockito.verify(permitRpcRepository).findPermitMutationByPermitNumber(900100L);
    Mockito.verify(permitRpcRepository).findApplicationNumbersByPermitNumberRequired(900100L);
    Mockito.verify(permitRpcRepository).findApplicationInfoByNumber(1001L);
    Mockito.verify(permitRpcRepository, Mockito.never())
        .findGbmsInvoiceHistoryRequired(Mockito.anyString(), Mockito.anyLong(), Mockito.anyBoolean());
  }

  @Test
  void shouldPreserveLegitimatelyEmptyPermitApplicationRelationshipsAsAccessDenied() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000001", "00000002")));
    Mockito.when(permitRpcRepository.findApplicationNumbersByPermitNumberRequired(900100L))
        .thenReturn(List.of());
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "n/a", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    assertThat(service.canGeneratePermitReport(LexisJasperReportDefinition.PERMIT_REPORT, request))
        .isFalse();
    Mockito.verify(permitRpcRepository)
        .findApplicationNumbersByPermitNumberRequired(900100L);
  }

  @Test
  void shouldPropagatePermitApplicationRelationshipFailureInsteadOfDenyingAccess() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000001", "00000002")));
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle relationships unavailable");
    Mockito.when(permitRpcRepository.findApplicationNumbersByPermitNumberRequired(900100L))
        .thenThrow(failure);
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "n/a", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    assertThatThrownBy(
            () ->
                service.canGeneratePermitReport(
                    LexisJasperReportDefinition.PERMIT_REPORT, request))
        .isSameAs(failure);
  }

  @Test
  void shouldAllowPermitReportForPermitClientBeforeInvoiceLookup() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000999", "00000002")));
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistoryRequired("", 900100L, false))
        .thenReturn(List.of());
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "n/a", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    assertThat(service.canGeneratePermitReport(LexisJasperReportDefinition.PERMIT_REPORT, request))
        .isTrue();

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(
            LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "");
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistoryRequired("", 900100L, false);
  }

  @Test
  void shouldAllowPermitReportForRelatedApplicationAgent() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000001", "00000002")));
    Mockito.when(permitRpcRepository.findApplicationNumbersByPermitNumberRequired(900100L))
        .thenReturn(List.of(1001L));
    Mockito.when(permitRpcRepository.findApplicationInfoByNumber(1001L))
        .thenReturn(Optional.of(applicationRow(1001L, "00000003", "00000999")));
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "n/a", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    assertThat(service.canGeneratePermitReport(LexisJasperReportDefinition.PERMIT_REPORT, request))
        .isTrue();

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(
            LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "");
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistoryRequired("", 900100L, false);
  }

  @Test
  void shouldAllowPermitReportForLegacyPrivilegedRolesWithoutClientMatch() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistoryRequired("", 900100L, true))
        .thenReturn(List.of());
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "n/a", "LEXIS_READ_ONLY", "LEXIS_APPLICATION_APPROVER"));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    assertThat(service.canGeneratePermitReport(LexisJasperReportDefinition.PERMIT_REPORT, request))
        .isTrue();

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(
            LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "");
    Mockito.verify(permitRpcRepository, Mockito.never()).findPermitMutationByPermitNumber(900100L);
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistoryRequired("", 900100L, true);
  }

  @Test
  void shouldAllowPermitReportForAdminWithoutClientMatch() {
    SecurityContextHolder.getContext()
        .setAuthentication(new TestingAuthenticationToken("admin", "n/a", "LEXIS_ADMIN"));
    OracleLexisReportService service = createService();
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    assertThat(service.canGeneratePermitReport(LexisJasperReportDefinition.PERMIT_REPORT, request))
        .isTrue();
  }

  private OracleLexisReportService createService() {
    return createService(Mockito.mock(LexisReportScheduleRepository.class));
  }

  private OracleLexisReportService createService(LexisReportScheduleRepository scheduleRepository) {
    return createService(scheduleRepository, Mockito.mock(PermitRpcRepository.class));
  }

  private OracleLexisReportService createService(
      LexisReportScheduleRepository scheduleRepository, PermitRpcRepository permitRpcRepository) {
    return createService(
        Mockito.mock(javax.sql.DataSource.class),
        Mockito.mock(OracleLegacyCsvReportService.class),
        Mockito.mock(OracleLegacyJasperTableReportService.class),
        scheduleRepository,
        permitRpcRepository);
  }

  private OracleLexisReportService createService(
      DataSource dataSource,
      OracleLegacyCsvReportService legacyCsvReportService,
      OracleLegacyJasperTableReportService legacyJasperTableReportService) {
    return createService(
        dataSource,
        legacyCsvReportService,
        legacyJasperTableReportService,
        Mockito.mock(LexisReportScheduleRepository.class),
        Mockito.mock(PermitRpcRepository.class));
  }

  private OracleLexisReportService createService(
      DataSource dataSource,
      OracleLegacyCsvReportService legacyCsvReportService,
      OracleLegacyJasperTableReportService legacyJasperTableReportService,
      LexisReportScheduleRepository scheduleRepository,
      PermitRpcRepository permitRpcRepository) {
    return new OracleLexisReportService(
        dataSource,
        new LexisJasperReportParameterProvider(),
        legacyCsvReportService,
        legacyJasperTableReportService,
        permitRpcRepository,
        scheduleRepository,
        new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"));
  }

  private PermitRpcRepository.PermitMutationRow permitRow(String clientNumber, String agentNumber) {
    return new PermitRpcRepository.PermitMutationRow(
        900100L,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        clientNumber,
        null,
        agentNumber,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private PermitRpcRepository.ApplicationInfoRow applicationRow(
      Long applicationNumber,
      String ownerClientNumber,
      String agentClientNumber) {
    return new PermitRpcRepository.ApplicationInfoRow(
        applicationNumber,
        null,
        null,
        null,
        null,
        null,
        null,
        ownerClientNumber,
        null,
        agentClientNumber,
        null);
  }
}

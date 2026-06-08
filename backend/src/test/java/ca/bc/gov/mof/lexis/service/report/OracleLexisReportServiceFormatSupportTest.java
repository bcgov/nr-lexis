package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.base.JRBasePrintPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class OracleLexisReportServiceFormatSupportTest {

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void shouldKeepRequestedSpreadsheetFormats() {
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
        new LexisGeneratedReport(
            "offerReport2026-06-04.csv", "application/vnd.ms-excel", "csv".getBytes());
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
        new LexisGeneratedReport("speciesGradeReport.pdf", "application/pdf", new byte[] {1, 2, 3});
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
        new LexisGeneratedReport("approvedExemptionReport.pdf", "application/pdf", new byte[] {1});
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
  void shouldReturnEmptyWhenJasperReportCannotConnectToOracle() throws Exception {
    DataSource dataSource = Mockito.mock(DataSource.class);
    OracleLegacyCsvReportService legacyCsvReportService =
        Mockito.mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService legacyJasperTableReportService =
        Mockito.mock(OracleLegacyJasperTableReportService.class);
    Mockito.when(dataSource.getConnection()).thenThrow(new SQLException("package invalid"));
    OracleLexisReportService service =
        createService(dataSource, legacyCsvReportService, legacyJasperTableReportService);

    Optional<LexisGeneratedReport> result =
        service.generateReport("feeReport", new LexisReportRequestDto(Map.of(), "PDF"));

    assertThat(result).isEmpty();
  }

  @Test
  void shouldReturnEmptyWhenJasperTemplatePreparationFails() {
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

    Optional<LexisGeneratedReport> result =
        service.generateReport("feeReport", new LexisReportRequestDto(Map.of(), "PDF"));

    assertThat(result).isEmpty();
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

    byte[] csvBytes = service.exportTemplateCsv(print);

    assertThat(csvBytes).isNotNull();
    assertThat(csvBytes.length).isGreaterThanOrEqualTo(0);
  }

  @Test
  void shouldExportXlsxFromJasperPrint() throws Exception {
    OracleLexisReportService service = createService();

    JasperPrint print = new JasperPrint();
    print.setName("test-print");
    print.setPageWidth(50);
    print.setPageHeight(50);
    print.addPage(new JRBasePrintPage());

    byte[] xlsxBytes = service.exportTemplateXlsx(print);

    assertThat(xlsxBytes).isNotNull();
    assertThat(xlsxBytes).startsWith(new byte[] {'P', 'K'});
  }

  @Test
  void shouldApplyLegacyBiweeklyIndustryScheduleDefaults() {
    LexisReportScheduleRepository scheduleRepository = Mockito.mock(LexisReportScheduleRepository.class);
    Mockito.when(scheduleRepository.findCurrentSchedules())
        .thenReturn(
            List.of(
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1001L, LocalDate.of(2026, 6, 15)),
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1002L, LocalDate.of(2026, 6, 29))));
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

    assertThat(result.parameters())
        .containsEntry("legacyActionMapping", "generateIndustryCSV")
        .containsEntry("fromDate", "2026-06-15")
        .containsEntry("toDate", "2026-06-28")
        .containsEntry("exportJurisdictionCode", "P")
        .containsEntry("jurisdiction", "P")
        .doesNotContainKeys("region", "orgUnitNumber");
  }

  @Test
  void shouldLeaveBiweeklyIndustryRequestUnchangedWhenSchedulesAreUnavailable() {
    LexisReportScheduleRepository scheduleRepository = Mockito.mock(LexisReportScheduleRepository.class);
    Mockito.when(scheduleRepository.findCurrentSchedules()).thenReturn(List.of());
    OracleLexisReportService service = createService(scheduleRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of("legacyActionMapping", "generateIndustryPDF", "fromDate", "2025-01-01"),
            "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.BIWEEKLY_LISTING, request);

    assertThat(result).isSameAs(request);
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
    LocalDate today = LocalDate.now();
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
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistory("", 900100L, false))
        .thenReturn(
            List.of(
                new PermitRpcRepository.GbmsInvoiceHistoryRow(
                    "INV-GBMS", null, null, 0.0d, null, null, null)));
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
        .setAuthentication(new TestingAuthenticationToken("user", "password", "LEXIS_READ_ONLY"));
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistory("", 900100L, true))
        .thenReturn(
            List.of(
                new PermitRpcRepository.GbmsInvoiceHistoryRow(
                    "INV-READONLY", null, null, 0.0d, null, null, null)));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100"), "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "INV-READONLY");
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistory("", 900100L, true);
  }

  @Test
  void shouldResolvePermitReportInvoiceNumberFromGbmsEvenWhenRequestIncludesInvoice() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistory("", 900100L, false))
        .thenReturn(
            List.of(
                new PermitRpcRepository.GbmsInvoiceHistoryRow(
                    "INV-GBMS", null, null, 0.0d, null, null, null)));
    OracleLexisReportService service =
        createService(Mockito.mock(LexisReportScheduleRepository.class), permitRpcRepository);
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of("permitNumber", "900100", "invoiceNumber", "INV-REQUEST"),
            "PDF");

    LexisReportRequestDto result =
        service.applyLegacyReportDefaults(LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(result.parameters()).containsEntry("invoiceNumber", "INV-GBMS");
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistory("", 900100L, false);
  }

  @Test
  void shouldBlankPermitReportInvoiceNumberWhenGbmsHistoryHasNoInvoice() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistory("", 900100L, false))
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
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistory("", 900100L, false);
  }

  @Test
  void shouldRejectPermitReportWhenUserIsNotPermitOrApplicationClient() {
    DataSource dataSource = Mockito.mock(DataSource.class);
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000001", "00000002")));
    Mockito.when(permitRpcRepository.findApplicationNumbersByPermitNumber(900100L))
        .thenReturn(List.of(1001L));
    Mockito.when(permitRpcRepository.findApplicationInfoByNumber(1001L))
        .thenReturn(Optional.of(applicationRow(1001L, "00000003", "00000004")));
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "password", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
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
    Mockito.verify(permitRpcRepository).findApplicationNumbersByPermitNumber(900100L);
    Mockito.verify(permitRpcRepository).findApplicationInfoByNumber(1001L);
    Mockito.verify(permitRpcRepository, Mockito.never())
        .findGbmsInvoiceHistory(Mockito.anyString(), Mockito.anyLong(), Mockito.anyBoolean());
  }

  @Test
  void shouldAllowPermitReportForPermitClientBeforeInvoiceLookup() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000999", "00000002")));
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistory("", 900100L, false))
        .thenReturn(List.of());
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "password", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
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
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistory("", 900100L, false);
  }

  @Test
  void shouldAllowPermitReportForRelatedApplicationAgent() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findPermitMutationByPermitNumber(900100L))
        .thenReturn(Optional.of(permitRow("00000001", "00000002")));
    Mockito.when(permitRpcRepository.findApplicationNumbersByPermitNumber(900100L))
        .thenReturn(List.of(1001L));
    Mockito.when(permitRpcRepository.findApplicationInfoByNumber(1001L))
        .thenReturn(Optional.of(applicationRow(1001L, "00000003", "00000999")));
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "password", "LEXIS_PROVINCIAL_SUBMITTER_00000999"));
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
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistory("", 900100L, false);
  }

  @Test
  void shouldAllowPermitReportForLegacyPrivilegedRolesWithoutClientMatch() {
    PermitRpcRepository permitRpcRepository = Mockito.mock(PermitRpcRepository.class);
    Mockito.when(permitRpcRepository.findGbmsInvoiceHistory("", 900100L, true))
        .thenReturn(List.of());
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                "user", "password", "LEXIS_READ_ONLY", "LEXIS_APPLICATION_APPROVER"));
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
    Mockito.verify(permitRpcRepository).findGbmsInvoiceHistory("", 900100L, true);
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

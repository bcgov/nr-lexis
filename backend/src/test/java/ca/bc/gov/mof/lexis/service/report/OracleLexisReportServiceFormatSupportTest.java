package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.base.JRBasePrintPage;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class OracleLexisReportServiceFormatSupportTest {

  @Test
  void shouldNormalizeXlsAndXlsxToCsv() {
    OracleLexisReportService service = createService();

    assertThat(service.normalizeRequestedFormat(LexisReportFormat.XLS))
        .isEqualTo(LexisReportFormat.CSV);
    assertThat(service.normalizeRequestedFormat(LexisReportFormat.XLSX))
        .isEqualTo(LexisReportFormat.CSV);
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
  void shouldKeepNonApprovedReportsOnNormalizedFormat() {
    OracleLexisReportService service = createService();

    assertThat(
            service.resolveEffectiveFormat(
                LexisJasperReportDefinition.EXEMPTION_REPORT, LexisReportFormat.CSV))
        .isEqualTo(LexisReportFormat.CSV);
  }

  @Test
  void shouldOnlySupportPdfAndCsvForTemplateExports() {
    OracleLexisReportService service = createService();

    assertThat(service.isTemplateFormatSupported(LexisReportFormat.PDF)).isTrue();
    assertThat(service.isTemplateFormatSupported(LexisReportFormat.CSV)).isTrue();
    assertThat(service.isTemplateFormatSupported(LexisReportFormat.XLS)).isFalse();
    assertThat(service.isTemplateFormatSupported(LexisReportFormat.RTF)).isFalse();
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

  private OracleLexisReportService createService() {
    return new OracleLexisReportService(
        Mockito.mock(javax.sql.DataSource.class),
        new LexisJasperReportParameterProvider(),
        Mockito.mock(OracleLegacyCsvReportService.class),
        Mockito.mock(OracleLegacyJasperTableReportService.class));
  }
}

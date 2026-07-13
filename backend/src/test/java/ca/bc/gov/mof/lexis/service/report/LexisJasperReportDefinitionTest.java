package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class LexisJasperReportDefinitionTest {

  @Test
  void fromActionShouldResolveKnownReport() {
    LexisJasperReportDefinition definition =
        LexisJasperReportDefinition.fromAction("offerReport").orElseThrow();

    assertThat(definition).isEqualTo(LexisJasperReportDefinition.OFFER_REPORT);
    assertThat(definition.supportsJasperTemplate()).isTrue();
  }

  @Test
  void fromActionShouldIgnoreCase() {
    LexisJasperReportDefinition definition =
        LexisJasperReportDefinition.fromAction("PERMITREPORT").orElseThrow();

    assertThat(definition).isEqualTo(LexisJasperReportDefinition.PERMIT_REPORT);
  }

  @Test
  void fromActionShouldReturnEmptyForUnknownAction() {
    assertThat(LexisJasperReportDefinition.fromAction("notARealReportAction")).isEmpty();
  }

  @Test
  void unsupportedDefinitionsShouldBeExplicit() {
    assertThat(LexisJasperReportDefinition.TEAC_REPORT.supportsJasperTemplate()).isFalse();
    assertThat(LexisJasperReportDefinition.SPECIES_GRADE_REPORT.supportsJasperTemplate()).isFalse();
    assertThat(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT.supportsJasperTemplate()).isFalse();
  }

  @Test
  void approvedExemptionShouldNotUseExemptionLedgerTemplateFallback() {
    assertThat(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT.templateName())
        .isNull();
  }

  @Test
  void resolveFilenameShouldApplyRequestedFormat() {
    String filename =
        LexisJasperReportDefinition.BIWEEKLY_LISTING.resolveFilename(LexisReportFormat.PDF);

    assertThat(filename).isEqualTo("biweeklyListing.pdf");
  }

  @Test
  void resolveFilenameShouldKeepXlsAndXlsxDistinct() {
    assertThat(LexisJasperReportDefinition.OFFER_REPORT.resolveFilename(LexisReportFormat.XLS))
        .isEqualTo("offerReport.xls");
    assertThat(LexisJasperReportDefinition.OFFER_REPORT.resolveFilename(LexisReportFormat.XLSX))
        .isEqualTo("offerReport.xlsx");
    assertThat(LexisReportFormat.XLS.mediaType()).isEqualTo("application/vnd.ms-excel");
    assertThat(LexisReportFormat.XLSX.mediaType())
        .isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  @Test
  void resolveFilenameShouldUseLegacyCsvNamesWithCurrentDate() {
    String today = LocalDate.now().toString();

    assertThat(LexisJasperReportDefinition.APPLICATION_REPORT.resolveFilename(LexisReportFormat.CSV))
        .isEqualTo("applicationLedger" + today + ".csv");
    assertThat(LexisJasperReportDefinition.EXEMPTION_REPORT.resolveFilename(LexisReportFormat.CSV))
        .isEqualTo("exemptionLedger" + today + ".csv");
    assertThat(LexisJasperReportDefinition.PERMIT_LEDGER_REPORT.resolveFilename(LexisReportFormat.CSV))
        .isEqualTo("permitLedger" + today + ".csv");
    assertThat(LexisJasperReportDefinition.TEAC_REPORT.resolveFilename(LexisReportFormat.CSV))
        .isEqualTo("TeacReport" + today + ".csv");
    assertThat(LexisJasperReportDefinition.TENURE_REPORT.resolveFilename(LexisReportFormat.CSV))
        .isEqualTo("tenureAnalysis" + today + ".csv");
  }
}

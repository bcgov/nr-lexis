package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

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
  }

  @Test
  void approvedExemptionShouldUseTemporaryTemplateFallback() {
    assertThat(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT.supportsJasperTemplate()).isTrue();
    assertThat(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT.templateName())
        .isEqualTo("LEXIS_EXEMPTION_LEDGER");
  }

  @Test
  void resolveFilenameShouldApplyRequestedFormat() {
    String filename =
        LexisJasperReportDefinition.BIWEEKLY_LISTING.resolveFilename(LexisReportFormat.PDF);

    assertThat(filename).isEqualTo("biweeklyListing.pdf");
  }
}

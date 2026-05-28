package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LexisJasperReportParameterProviderTest {

  private final LexisJasperReportParameterProvider provider = new LexisJasperReportParameterProvider();

  @Test
  void biweeklyShouldDefaultDatesAndNormalizeRegionList() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("region", "[ 12,  14 ]", "exportJurisdictionCode", "P"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.BIWEEKLY_LISTING, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT", "12,14")
        .containsEntry("P_JURISDICTION", "P")
        .containsEntry("P_FROM_DATE", "0001-01-01")
        .containsEntry("P_TO_DATE", "9999-12-31");
  }

  @Test
  void permitReportShouldConvertPermitNumberToBigDecimal() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("permitNumber", "900100", "invoiceNumber", "INV-123"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.PERMIT_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_EXPORT_PERMIT_NUMBER", new BigDecimal("900100"))
        .containsEntry("P_INVOICE_NUMBER", "INV-123");
  }

  @Test
  void tenureShouldBlankClientTypeWhenClientNumberMissing() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "region", "1,2",
                "clientType", "P",
                "fromDate", "2026-01-01",
                "toDate", "2026-02-01",
                "tenureType1", "A01"),
            "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT_NUMBER", "1,2")
        .containsEntry("P_CLIENT_NUMBER", null)
        .containsEntry("P_CLIENT_TYPE", "")
        .containsEntry("P_TENURE_TYPE_1", "A01")
        .containsEntry("P_TENURE_TYPE_2", "")
        .containsEntry("P_TIMBER_MARK_1", "");
  }

  @Test
  void tenureGenerateTenureReportShouldForceOrgUnitAndClientFieldsToLegacyDefaults() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "legacyActionMapping", "generateTenureReport",
                "region", "1,2",
                "clientNumber", "12345",
                "clientType", "P",
                "fromDate", "2026-01-01",
                "toDate", "2026-02-01",
                "tenureType1", "A01"),
            "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT_NUMBER", "-1")
        .containsEntry("P_CLIENT_NUMBER", "")
        .containsEntry("P_CLIENT_TYPE", "")
        .containsEntry("P_TENURE_TYPE_1", "A01")
        .containsEntry("P_TIMBER_MARK_1", "")
        .containsEntry("P_FOREST_FILE_ID", "");
  }

  @Test
  void tenureGenerateMarkReportShouldOnlyPopulateMarkColumns() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "legacyActionMapping", "generateMarkReport",
                "fromDate", "2026-01-01",
                "toDate", "2026-02-01",
                "timberMark1", "TM-1",
                "timberMark2", "TM-2",
                "tenureType1", "A01"),
            "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT_NUMBER", "-1")
        .containsEntry("P_TENURE_TYPE_1", "")
        .containsEntry("P_TIMBER_MARK_1", "TM-1")
        .containsEntry("P_TIMBER_MARK_2", "TM-2")
        .containsEntry("P_FOREST_FILE_ID", "");
  }

  @Test
  void tenureGenerateFileReportShouldOnlyPopulateForestFileId() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "legacyActionMapping", "generateFileReport",
                "fromDate", "2026-01-01",
                "toDate", "2026-02-01",
                "forestFileId", "123A0001"),
            "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT_NUMBER", "-1")
        .containsEntry("P_TENURE_TYPE_1", "")
        .containsEntry("P_TIMBER_MARK_1", "")
        .containsEntry("P_FOREST_FILE_ID", "123A0001");
  }

  @Test
  void approvedExemptionFallbackShouldPopulateLedgerDefaultsAndFilterByExemptionNumber() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exemptionNumber", "E-12345"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_FROM_DATE", "0001-01-01")
        .containsEntry("P_TO_DATE", "9999-12-31")
        .containsEntry("P_LISTING_FROM_DATE", "")
        .containsEntry("P_LISTING_TO_DATE", "")
        .containsEntry("P_ORG_UNIT", "")
        .containsEntry("P_EXEMPTION_NUMBER", "E-12345")
        .containsEntry("P_EXEMPTION_STATUS", "");
  }
}

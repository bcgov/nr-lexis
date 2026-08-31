package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

class LexisJasperReportParameterProviderTest {

  private final LexisJasperReportParameterProvider provider = new LexisJasperReportParameterProvider();
  private static final Set<String> JASPER_INFRASTRUCTURE_PARAMETERS =
      Set.of("ORACLE_REF_CURSOR", "LoggedInUser", "p_report_id", "SUBREPORT_DIR", "SUBREPORT_EXT");

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
  void offerReportShouldDefaultBlankPdfDatePrompts() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("region", "1904", "clientNumber", "00001234"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.OFFER_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_APPLICATION_DATE_FROM", "0001-01-01")
        .containsEntry("P_APPLICATION_DATE_TO", "9999-12-31")
        .containsEntry("P_ORG_UNIT", "1904")
        .containsEntry("P_CLIENT_NUMBER", "00001234")
        .containsEntry("P_WITHDRAWN_DATE_FROM", null)
        .containsEntry("P_WITHDRAWN_DATE_TO", null);
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
  void applicationReportShouldPassBlankPdfDatePromptsThrough() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("region", "1904", "exportJurisdictionCode", "P"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.APPLICATION_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT", "1904")
        .containsEntry("P_JURISDICTION", "P")
        .containsEntry("P_RECEIVED_FROM", null)
        .containsEntry("P_RECEIVED_TO", null);
  }

  @Test
  void exemptionReportShouldPassBlankPdfDatePromptsThrough() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("region", "1904", "exemptionNumber", "EX-123"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.EXEMPTION_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT", "1904")
        .containsEntry("P_EXEMPTION_NUMBER", "EX-123")
        .containsEntry("P_FROM_DATE", null)
        .containsEntry("P_TO_DATE", null);
  }

  @Test
  void feeReportShouldPassBlankPdfDatePromptsThrough() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("orgUnitNumber", "1904", "exemptionNumber", "EX-123"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.FEE_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT_NUMBER", "1904")
        .containsEntry("P_EXEMPTION_NUMBER", "EX-123")
        .containsEntry("P_FROM_DATE", null)
        .containsEntry("P_TO_DATE", null);
  }

  @Test
  void tenurePermitAnalysisShouldBlankClientTypeAndSpecificSearchFieldsWhenClientNumberMissing() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of(
                "region", "1,2",
                "clientType", "P",
                "fromDate", "2026-01-01",
                "toDate", "2026-02-01",
                "tenureType1", "A01",
                "timberMark1", "TM-1"),
            "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_ORG_UNIT_NUMBER", "1,2")
        .containsEntry("P_CLIENT_NUMBER", null)
        .containsEntry("P_CLIENT_TYPE", "")
        .containsEntry("P_TENURE_TYPE_1", "")
        .containsEntry("P_TENURE_TYPE_2", "")
        .containsEntry("P_TIMBER_MARK_1", "");
  }

  @Test
  void tenurePermitAnalysisShouldBindBlanketOicExemptionTypeCode() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.of("exemptionType", "B", "clientNumber", "00001074", "clientType", "P"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.TENURE_REPORT, request);

    assertThat(parameters)
        .containsEntry("P_EXEMPTION_TYPE", "B")
        .containsEntry("P_CLIENT_NUMBER", "00001074")
        .containsEntry("P_CLIENT_TYPE", "P");
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
  void approvedExemptionReportShouldOnlyProvideLegacyExemptionNumberPrompt() {
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exemptionNumber", "E-12345"), "PDF");

    Map<String, Object> parameters =
        provider.buildParameters(LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT, request);

    assertThat(parameters).containsOnly(Map.entry("P_EXEMPTION_NUMBER", "E-12345"));
  }

  @Test
  void migratedTemplateReportsShouldProvideEveryDeclaredPromptParameter() throws Exception {
    LexisReportRequestDto request =
        new LexisReportRequestDto(
            Map.ofEntries(
                Map.entry("legacyActionMapping", "generatePermitReport"),
                Map.entry("region", "1903,1904"),
                Map.entry("orgUnitNumber", "1903,1904"),
                Map.entry("exportJurisdictionCode", "P"),
                Map.entry("jurisdiction", "P"),
                Map.entry("fromDate", "2026-01-01"),
                Map.entry("toDate", "2026-01-31"),
                Map.entry("listingFromDate", "2026-01-01"),
                Map.entry("listingToDate", "2026-01-31"),
                Map.entry("clientNumber", "00001234"),
                Map.entry("exemptionNumber", "E-12345"),
                Map.entry("exemptionType", "OIC"),
                Map.entry("exemptionReason", "SEC128"),
                Map.entry("exemptionStatus", "A"),
                Map.entry("growthType", "O"),
                Map.entry("permitStatus", "COM"),
                Map.entry("timberMark", "TM123"),
                Map.entry("destinationCountry", "US"),
                Map.entry("portOfExport", "VAN"),
                Map.entry("status", "COM"),
                Map.entry("permitNumber", "900100"),
                Map.entry("invoiceNumber", "INV-123"),
                Map.entry("clientType", "P"),
                Map.entry("tenureType1", "A01"),
                Map.entry("timberMark1", "TM-1"),
                Map.entry("forestFileId", "123A0001")),
            "PDF");

    for (LexisJasperReportDefinition definition : LexisJasperReportDefinition.values()) {
      if (!definition.supportsJasperTemplate()) {
        continue;
      }

      Set<String> declaredParameters = promptParametersFor(definition);
      Map<String, Object> providedParameters = provider.buildParameters(definition, request);

      assertThat(providedParameters.keySet())
          .as("%s provider parameters cover %s", definition.name(), definition.templateName())
          .containsAll(declaredParameters);
    }
  }

  private Set<String> promptParametersFor(LexisJasperReportDefinition definition) throws Exception {
    String resourcePath = "/reports/lexis/" + definition.templateName() + ".jrxml";
    try (InputStream inputStream = getClass().getResourceAsStream(resourcePath)) {
      assertThat(inputStream).as(resourcePath).isNotNull();

      NodeList parameterNodes =
          DocumentBuilderFactory.newInstance()
              .newDocumentBuilder()
              .parse(inputStream)
              .getElementsByTagName("parameter");
      Set<String> parameters = new HashSet<>();
      for (int index = 0; index < parameterNodes.getLength(); index += 1) {
        Element parameter = (Element) parameterNodes.item(index);
        String name = parameter.getAttribute("name");
        if (!JASPER_INFRASTRUCTURE_PARAMETERS.contains(name)) {
          parameters.add(name);
        }
      }
      return parameters;
    }
  }
}

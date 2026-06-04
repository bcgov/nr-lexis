package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import net.sf.jasperreports.engine.JasperCompileManager;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class LexisJasperTemplateCompileTest {

  @Test
  void migratedJasperTemplatesShouldCompile() throws Exception {
    Path reportDirectory = new ClassPathResource("reports/lexis").getFile().toPath();

    List<Path> templates;
    try (var paths = Files.list(reportDirectory)) {
      templates =
          paths
              .filter(path -> path.getFileName().toString().endsWith(".jrxml"))
              .sorted()
              .toList();
    }

    assertThat(templates).isNotEmpty();

    for (Path template : templates) {
      String classpath = "reports/lexis/" + template.getFileName();
      assertThatCode(
              () -> {
                try (InputStream inputStream = new ClassPathResource(classpath).getInputStream()) {
                  JasperCompileManager.compileReport(inputStream);
                }
              })
          .as("%s should compile", classpath)
          .doesNotThrowAnyException();
    }
  }

  @Test
  void applicationLedgerShouldDisplayLegacyAllRegionCodeAsAll() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_application_ledger.jrxml")
                .getFile()
                .toPath());

    assertThat(template)
        .contains(
            "$P{P_ORG_UNIT} == null || $P{P_ORG_UNIT}.isEmpty() "
                + "|| $P{P_ORG_UNIT}.equalsIgnoreCase( \"0\" ) ? \"All\"");
  }

  @Test
  void exemptionLedgerShouldUseNullSafeApplicationNumberBranches() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_EXEMPTION_LEDGER.jrxml")
                .getFile()
                .toPath());

    assertThat(template)
        .contains(
            "$F{EXPORT_JURISDICTION_CODE}!=null "
                + "&& $F{EXPORT_JURISDICTION_CODE}.equalsIgnoreCase( \"P\" )")
        .doesNotContain(
            "$F{EXPORT_JURISDICTION_CODE}!=null "
                + "|| $F{EXPORT_JURISDICTION_CODE}.equalsIgnoreCase( \"P\" )")
        .contains("$F{FED_APPLICATION_NUMBER} == null ? \"\" : $F{FED_APPLICATION_NUMBER}.toString()")
        .contains("$F{APPLICATION_NUMBER} == null ? \"\" : $F{APPLICATION_NUMBER}.toString()");
  }

  @Test
  void exemptionLedgerShouldDisplayAllLegacyExemptionStatuses() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_EXEMPTION_LEDGER.jrxml")
                .getFile()
                .toPath());

    assertThat(template)
        .contains("$P{P_EXEMPTION_STATUS}.equalsIgnoreCase( \"NEW\" )")
        .contains("$P{P_EXEMPTION_STATUS}.equalsIgnoreCase( \"ACT\" )")
        .contains("$P{P_EXEMPTION_STATUS}.equalsIgnoreCase( \"CAN\" )")
        .contains("$P{P_EXEMPTION_STATUS}.equalsIgnoreCase( \"EXP\" )");
  }

  @Test
  void permitReportShouldUseNullSafeReceiptInvoiceExpression() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_PERMIT.jrxml")
                .getFile()
                .toPath());

    assertThat(template)
        .contains("\"I\".equalsIgnoreCase($F{COAST_INTERIOR_IND})")
        .contains("$F{RECEIPT_NUMBER} == null ? \"\" : $F{RECEIPT_NUMBER}")
        .contains("$P{P_INVOICE_NUMBER} == null ? \"\" : $P{P_INVOICE_NUMBER}")
        .doesNotContain("$F{COAST_INTERIOR_IND}.equalsIgnoreCase(\"I\")");
  }

  @Test
  void dynamicTableFallbackShouldPreserveReportContextWhenNoRowsReturn() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_DYNAMIC_TABLE.jrxml")
                .getFile()
                .toPath());

    assertThat(template)
        .contains("<noData>")
        .contains("$P{REPORT_TITLE} == null ? \"LEXIS Report\" : $P{REPORT_TITLE}")
        .contains("$P{REPORT_SUBTITLE} == null ? \"\" : $P{REPORT_SUBTITLE}")
        .contains("\"Generated: \" + ($P{REPORT_GENERATED_DATE} == null ? \"\" : $P{REPORT_GENERATED_DATE})")
        .contains("No rows returned for this report criteria.");
  }
}

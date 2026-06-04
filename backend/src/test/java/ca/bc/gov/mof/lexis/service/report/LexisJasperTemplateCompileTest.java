package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import javax.xml.parsers.DocumentBuilderFactory;
import net.sf.jasperreports.engine.JasperCompileManager;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

class LexisJasperTemplateCompileTest {

  private static final Map<String, String> LEGACY_TEMPLATE_STRUCTURAL_SIGNATURES =
      Map.ofEntries(
          Map.entry("EXPORT_FEE_SUMMARY.jrxml", "63c11e3302e58f05f763f1e585ca7da98cd4d72c633eaea904896c4a1a20caf9"),
          Map.entry("LEXIS_EXEMPTION_LEDGER.jrxml", "8cdb0cbd1e7506ee10b3fd212f1642e9c082314f710fbf97a96b8394ef982c96"),
          Map.entry("LEXIS_OFFERS_LEDGER.jrxml", "4630c94d1c653037b509363986e765e799c0a592711d5b1fe28eb57fc2ea0c9e"),
          Map.entry("LEXIS_PERMIT.jrxml", "b553b0e8d618b029291af0d3679f9a23ab02f829fd51566f60964158c1d8fd8c"),
          Map.entry("LEXIS_PERMIT_LEDGER.jrxml", "6208119b7b6cd08e78e92909748f443be3221e03303029f082ad7b0d54f1dbce"),
          Map.entry("LEXIS_PERMIT_SR1_LEXIS_PERMIT_SUB.jrxml", "52f540994d9b0d668d27376bfc1ec68480f311dab5245939182b3ca6f62d40cd"),
          Map.entry("LEXIS_TENURE_ANALYSIS.jrxml", "7daebd01903b6fb98a094c3675abbd6accafbf0adefe6555f573806653bb8548"),
          Map.entry("LEXIS_TRANSPORT_LEDGER.jrxml", "c5e6f5a9b954c9fff6c6a67ad48295f8b43c021f63b4e25d95574fcacd5eccae"),
          Map.entry("LEXIS_application_ledger.jrxml", "bcf3c6a615b482173808bb8fad57281e9783863798bab145677fd73d68e60a6a"),
          Map.entry("LEXIS_application_ledger_SR1_app_subreport.jrxml", "3bec6ff50367bbe950599be3086fa9ce5fa832c94a4a0e933be03ac7bf1477b4"),
          Map.entry("LEXIS_biweekly.jrxml", "bcf91f9daf118ab2bedd7be82a47243d7f7e2c3baab5c4be85726273af87708d"),
          Map.entry("LEXIS_biweekly_SR1_packages_sub_report.jrxml", "8c0e216a67e5cb55ad6349f4e7a32c2e363382ef02e53ef9226c2926888f90fa"));

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
  void migratedJasperTemplatesShouldKeepLegacyDataContracts() throws Exception {
    for (Map.Entry<String, String> expectedSignature : LEGACY_TEMPLATE_STRUCTURAL_SIGNATURES.entrySet()) {
      String classpath = "reports/lexis/" + expectedSignature.getKey();
      try (InputStream inputStream = new ClassPathResource(classpath).getInputStream()) {
        assertThat(structuralSignature(inputStream))
            .as("%s should match the legacy Jasper Server export data contract", classpath)
            .isEqualTo(expectedSignature.getValue());
      }
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

  private String structuralSignature(InputStream inputStream) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    Document document = factory.newDocumentBuilder().parse(inputStream);

    String structure =
        "parameters="
            + sortedAttributeValues(document, "parameter", "name")
            + "\nfields="
            + sortedAttributeValues(document, "field", "name")
            + "\nquery="
            + normalizedQuery(document);
    return sha256(structure);
  }

  private TreeSet<String> sortedAttributeValues(Document document, String tagName, String attributeName) {
    TreeSet<String> values = new TreeSet<>();
    NodeList nodes = document.getElementsByTagName(tagName);
    for (int index = 0; index < nodes.getLength(); index += 1) {
      Element element = (Element) nodes.item(index);
      values.add(element.getAttribute(attributeName));
    }
    return values;
  }

  private String normalizedQuery(Document document) {
    NodeList queryNodes = document.getElementsByTagName("queryString");
    if (queryNodes.getLength() == 0) {
      return "";
    }
    return queryNodes.item(0).getTextContent().replaceAll("\\s+", " ").trim();
  }

  private String sha256(String value) throws NoSuchAlgorithmException {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
  }
}

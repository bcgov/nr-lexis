package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.lowagie.text.pdf.PRTokeniser;
import com.lowagie.text.pdf.PdfContentParser;
import com.lowagie.text.pdf.PdfNumber;
import com.lowagie.text.pdf.PdfObject;
import com.lowagie.text.pdf.PdfReader;
import java.awt.Font;
import java.awt.font.FontRenderContext;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrintManager;
import net.sf.jasperreports.engine.SimpleJasperReportsContext;
import net.sf.jasperreports.engine.data.JRMapCollectionDataSource;
import net.sf.jasperreports.engine.design.JRDesignSection;
import net.sf.jasperreports.engine.xml.JRXmlLoader;
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
      assertThat(Files.readString(template))
          .as("%s should use current Jasper text adjustment attributes", classpath)
          .doesNotContain("isStretchWithOverflow=");
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
  void tenureAnalysisTemplateShouldLabelBlanketOicExemptionType() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_TENURE_ANALYSIS.jrxml")
                .getFile()
                .toPath());

    assertThat(template)
        .contains(
            "$P{P_EXEMPTION_TYPE}.equalsIgnoreCase( \"B\" )\n"
                + "                ?   \"Blanket OIC\"")
        .contains("<textFieldExpression><![CDATA[\": \" + $V{CCF6_F_EXE_TYPE}]]></textFieldExpression>");
  }

  @Test
  void permitLedgerTemplateShouldLabelBlanketOicExemptionType() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_PERMIT_LEDGER.jrxml")
                .getFile()
                .toPath());

    assertThat(template)
        .contains(
            "$P{P_EXEMPTION_TYPE}.equalsIgnoreCase( \"B\" )\n"
                + "                ?   \"Blanket OIC\"")
        .contains(
            "<textFieldExpression><![CDATA[\": \" + $V{CCF6_F_EXEMPT_TYPE}]]></textFieldExpression>");
  }

  @Test
  void permitLedgerShouldKeepCriteriaValuesOnMatchingLines() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_PERMIT_LEDGER.jrxml")
                .getFile()
                .toPath());

    Matcher criteriaField =
        Pattern.compile(
                "uuid=\"85ef0374-a07b-4853-9f61-581cecda10b8\" "
                    + "x=\"(\\d+)\" y=\"93\" width=\"(\\d+)\" height=\"61\"")
            .matcher(template);
    assertThat(criteriaField.find()).isTrue();

    int fieldX = Integer.parseInt(criteriaField.group(1));
    int fieldWidth = Integer.parseInt(criteriaField.group(2));
    double longestRegionWidth;
    try (InputStream fontStream =
        new ClassPathResource("fonts/LiberationSerif-Regular.ttf").getInputStream()) {
      Font criteriaFont = Font.createFont(Font.TRUETYPE_FONT, fontStream).deriveFont(8f);
      longestRegionWidth =
          criteriaFont
              .getStringBounds(
                  "Thompson-Okanagan Natural Resource Region",
                  new FontRenderContext(null, true, true))
              .getWidth();
    }

    assertThat(fieldWidth).isGreaterThanOrEqualTo((int) Math.ceil(longestRegionWidth) + 20);
    assertThat(fieldX + fieldWidth).isLessThanOrEqualTo(684);
    assertThat(template)
        .contains(
            "$F{REGION} == null || $F{REGION}.isEmpty() ? \"\" : $F{REGION}")
        .contains("$V{CCF9_F_GROWTH_TYPE} + System.getProperty(\"line.separator\")");
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
        .doesNotContain("fontName=\"Calibri\"")
        .doesNotContain("$F{COAST_INTERIOR_IND}.equalsIgnoreCase(\"I\")");
  }

  @Test
  void permitPdfShouldDrawBothHolderBoxesAndOnlyCheckTheOwner() throws Exception {
    var directory = new ClassPathResource("reports/lexis").getFile().toPath();
    var design = JRXmlLoader.load(directory.resolve("LEXIS_PERMIT.jrxml").toFile());
    // Render the real first-page band without invoking the unrelated Oracle subreport.
    var detail = (JRDesignSection) design.getDetailSection();
    while (detail.getBands().length > 1) {
      detail.removeBand(1);
    }
    Map<String, Object> row = new HashMap<>();
    row.put("EXPORT_PERMIT_DETAIL_NUMBER", BigDecimal.valueOf(9021049));
    row.put("NUMBER_OF_PIECES", BigDecimal.valueOf(5));
    row.put("PERMIT_VOLUME", BigDecimal.valueOf(5));
    row.put("CLIENT_NUMBER", "00162575");
    row.put("OWNER_COMPANY_NAME", "TEST owner");
    row.put("AGENT_CLIENT_NUMBER", "00001074");
    row.put("AGT_COMPANY_NAME", "TEST agent");
    row.put("EXPORT_APPLICANT_TYPE_CODE", "A");
    for (String date : List.of("ESTIMATED_SHIPPING_DATE", "EXPORT_PERMIT_ISSUE_DATE", "EXPIRY_DATE")) {
      row.put(date, Timestamp.valueOf("2026-10-17 12:00:00"));
    }
    // Exercise the missing-font fallback without requiring an extra system glyph font.
    var context = new SimpleJasperReportsContext();
    context.setProperty("net.sf.jasperreports.awt.ignore.missing.font", "true");
    var print =
        JasperFillManager.getInstance(context)
            .fill(
                JasperCompileManager.compileReport(design),
                new HashMap<>(Map.of("SUBREPORT_DIR", directory.toString() + "/")),
                new JRMapCollectionDataSource(List.of(row)));
    byte[] pdf = JasperExportManager.getInstance(context).exportToPdf(print);

    List<PdfStroke> drawings = strokedPdfDrawings(pdf);
    // PDF coordinates start at the bottom; original boxes are 13pt at (544,17)/(544,66)
    // inside the first detail band, after the report's 18pt margin and 66pt page header.
    assertBoxOutline(drawings, 562, 498);
    assertBoxOutline(drawings, 562, 449);
    assertThat(drawings.stream().filter(d -> d.isDiagonalInside(563, 500, 574, 510)))
        .hasSize(2);
    assertThat(drawings.stream().filter(d -> d.isDiagonalInside(563, 451, 574, 461)))
        .isEmpty();

    BufferedImage image =
        (BufferedImage) JasperPrintManager.getInstance(context).printToImage(print, 0, 2f);
    assertThat(darkPixels(image, 562, 101, 13, 13)).isGreaterThan(40);
    assertThat(darkPixels(image, 562, 150, 13, 13)).isGreaterThan(40);
    assertThat(darkPixels(image, 564, 103, 9, 9)).isGreaterThan(10);
    assertThat(darkPixels(image, 564, 152, 9, 9)).isZero();
  }

  private List<PdfStroke> strokedPdfDrawings(byte[] pdf) throws Exception {
    List<PdfStroke> painted = new ArrayList<>();
    try (PdfReader reader = new PdfReader(pdf);
        PRTokeniser tokens = new PRTokeniser(reader.getPageContent(1))) {
      PdfContentParser parser = new PdfContentParser(tokens);
      List<PdfObject> operands = new ArrayList<>();
      List<PdfStroke> path = new ArrayList<>();
      float x = 0;
      float y = 0;
      while (!parser.parse(operands).isEmpty()) {
        String operator = operands.getLast().toString();
        if ("re".equals(operator)) {
          float left = number(operands, 0);
          float bottom = number(operands, 1);
          float right = left + number(operands, 2);
          float top = bottom + number(operands, 3);
          path.addAll(
              List.of(
                  new PdfStroke(left, bottom, right, bottom),
                  new PdfStroke(right, bottom, right, top),
                  new PdfStroke(right, top, left, top),
                  new PdfStroke(left, top, left, bottom)));
        } else if ("m".equals(operator)) {
          x = number(operands, 0);
          y = number(operands, 1);
        } else if ("l".equals(operator)) {
          float nextX = number(operands, 0);
          float nextY = number(operands, 1);
          path.add(new PdfStroke(x, y, nextX, nextY));
          x = nextX;
          y = nextY;
        } else if ("S".equals(operator)) {
          painted.addAll(path);
          path.clear();
        } else if (List.of("n", "f", "f*", "B", "B*", "b", "b*").contains(operator)) {
          path.clear();
        }
      }
    }
    return painted;
  }

  private float number(List<PdfObject> operands, int index) {
    return ((PdfNumber) operands.get(index)).floatValue();
  }

  private void assertBoxOutline(List<PdfStroke> strokes, float x, float y) {
    assertThat(strokes)
        .contains(
            new PdfStroke(x, y, x + 13, y),
            new PdfStroke(x + 13, y, x + 13, y + 13),
            new PdfStroke(x + 13, y + 13, x, y + 13),
            new PdfStroke(x, y + 13, x, y));
  }

  private int darkPixels(BufferedImage image, int x, int y, int width, int height) {
    int count = 0;
    for (int py = y * 2; py < (y + height) * 2; py++) {
      for (int px = x * 2; px < (x + width) * 2; px++) {
        if ((image.getRGB(px, py) & 0x00ffffff) < 0x808080) {
          count++;
        }
      }
    }
    return count;
  }

  private record PdfStroke(float x, float y, float endX, float endY) {
    boolean isDiagonalInside(float minX, float minY, float maxX, float maxY) {
      return x != endX
          && y != endY
          && x >= minX
          && x <= maxX
          && endX >= minX
          && endX <= maxX
          && y >= minY
          && y <= maxY
          && endY >= minY
          && endY <= maxY;
    }
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

  @Test
  void speciesGradeTemplateShouldUseFixedBusinessColumns() throws Exception {
    String template =
        Files.readString(
            new ClassPathResource("reports/lexis/LEXIS_SPECIES_GRADE.jrxml")
                .getFile()
                .toPath());

    for (String fieldName :
        List.of(
            "EXPORT_PRODUCT_TYPE_CODE",
            "PRODUCT_TYPE",
            "REGION",
            "EXPORT_GRADE_CODE",
            "SUM_FI",
            "SUM_CE",
            "SUM_SP",
            "SUM_LO",
            "SUM_HE",
            "SUM_BA",
            "SUM_CY",
            "SUM_AL",
            "SUM_CO",
            "SUM_HD",
            "SUM_OT",
            "EXPORT_JURISDICTION_CODE",
            "SORTED_COLUMN")) {
      assertThat(template).contains("<field name=\"" + fieldName + "\"");
    }

    for (String label :
        List.of(
            "Product type code",
            "Product type",
            "Region",
            "Grade",
            "Fir",
            "Cedar",
            "Spruce",
            "Lodgepole pine",
            "Hemlock",
            "Balsam",
            "Cypress",
            "Alder",
            "Cottonwood",
            "Hardwood",
            "Other",
            "Jurisdiction")) {
      assertThat(template).contains("<text><![CDATA[" + label + "]]></text>");
    }

    assertThat(template)
        .doesNotContain("Additional Columns")
        .doesNotContain("<text><![CDATA[SUM_")
        .doesNotContain("<text><![CDATA[EXPORT_")
        .doesNotContain("<text><![CDATA[SORTED_COLUMN]]></text>");
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

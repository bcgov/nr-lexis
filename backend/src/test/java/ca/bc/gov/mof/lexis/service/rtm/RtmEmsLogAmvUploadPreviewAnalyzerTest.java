package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;

class RtmEmsLogAmvUploadPreviewAnalyzerTest {

  @Test
  void shouldParseMatrixWorkbookForUpload() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook()));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.dataRowCount()).isEqualTo(2);
    assertThat(result.growthIndicator()).isEqualTo("O");
    assertThat(result.numericCellCount()).isEqualTo(6);
    assertThat(result.errors()).isEmpty();
    assertThat(result.rows()).hasSize(result.numericCellCount());
    assertThat(result.rows()).allMatch(row -> "O".equals(row.growthIndicator()));
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::species)
        .contains("BA", "HE", "WH", "LO", "YE");
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::grade)
        .contains("A", "1");
  }

  @Test
  void shouldUseTheWorkbookMonthAsTheOnlyUploadEffectiveDate() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(
                RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbookWithMetadataRows()));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.dataRowCount()).isEqualTo(2);
    assertThat(result.growthIndicator()).isEqualTo("O");
    assertThat(result.numericCellCount()).isEqualTo(6);
    assertThat(result.rows()).hasSize(result.numericCellCount());
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldPreserveMidMonthWorkbookDateForAuthoritativeServiceValidation()
      throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(
                RtmEmsLogAmvWorkbookTestFixtures.midMonthSingleBalsamWorkbook()));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 6, 20));
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 6, 20));
    assertThat(result.numericCellCount()).isOne();
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldAnalyzeMatrixWorkbook() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.Analysis analysis =
        RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook()));

    assertThat(analysis.headerDetected()).isTrue();
    assertThat(analysis.updateDate()).isNotNull();
    assertThat(analysis.retrievalDate()).isNotNull();
    assertThat(analysis.dataRowCount()).isEqualTo(2);
    assertThat(analysis.growthIndicator()).isEqualTo("O");
    assertThat(analysis.numericCellCount()).isEqualTo(6);
    assertThat(analysis.rows()).hasSize(6);
    assertThat(analysis.errors()).isEmpty();
  }

  @Test
  void shouldNormalizeExcelFloatingPointSerializationArtifacts() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace("<v>10.25</v>", "<v>142.41999999999999</v>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)));

    assertThat(result.rows().getFirst().newValue()).isEqualByComparingTo("142.42");
    assertThat(RtmEmsLogAmvValueValidator.validate(result.rows().getFirst().newValue())).isEmpty();
  }

  @Test
  void shouldPreserveGenuineThirdDecimalFromExcelNumericCell() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace("<v>10.25</v>", "<v>142.419</v>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)));

    assertThat(result.rows().getFirst().newValue()).isEqualByComparingTo("142.419");
    assertThat(RtmEmsLogAmvValueValidator.validate(result.rows().getFirst().newValue()))
        .containsExactly("New value must have no more than 2 decimal places.");
  }

  @Test
  void shouldRejectNonNumericMappedCellInsteadOfPartiallyAcceptingWorkbook()
      throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(
                "<c r=\"B4\"><v>10.25</v></c>",
                "<c r=\"B4\" t=\"inlineStr\"><is><t>12x</t></is></c>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isEqualTo(5);
    assertThat(result.rows()).hasSize(5);
    assertThat(result.errors())
        .containsExactly("Row 4 has non-numeric value '12x' at column B.");
  }

  @Test
  void shouldRejectMalformedCommaGroupingInsteadOfCoercingTheValue() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(
                "<c r=\"B4\"><v>10.25</v></c>",
                "<c r=\"B4\" t=\"inlineStr\"><is><t>1,2,3</t></is></c>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isEqualTo(5);
    assertThat(result.rows()).hasSize(5);
    assertThat(result.errors())
        .containsExactly("Row 4 has non-numeric value '1,2,3' at column B.");
  }

  @Test
  void shouldAcceptCorrectCommaGrouping() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(
                "<c r=\"B4\"><v>10.25</v></c>",
                "<c r=\"B4\" t=\"inlineStr\"><is><t>1,234.56</t></is></c>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.errors()).isEmpty();
    assertThat(result.rows().getFirst().newValue()).isEqualByComparingTo("1234.56");
  }

  @Test
  void shouldRejectBooleanCellInsteadOfCoercingTrueToOne() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(
                "<c r=\"B4\"><v>10.25</v></c>",
                "<c r=\"B4\" t=\"b\"><v>1</v></c>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isEqualTo(5);
    assertThat(result.rows()).hasSize(5);
    assertThat(result.errors())
        .containsExactly("Row 4 has non-numeric value 'TRUE' at column B.");
  }

  @Test
  void shouldRejectFormulaCellInsteadOfTrustingItsCachedValue() throws IOException {
    for (String formulaCell :
        List.of(
            "<c r=\"B4\"><f>10+2</f><v>12</v></c>",
            "<c r=\"B4\"><f>10+2</f></c>")) {
      Map<String, byte[]> entries = validScreenWorkbookEntries();
      entries.put(
          "xl/worksheets/sheet1.xml",
          textEntry(entries, "xl/worksheets/sheet1.xml")
              .replace("<c r=\"B4\"><v>10.25</v></c>", formulaCell)
              .getBytes(StandardCharsets.UTF_8));

      RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
          RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
              new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

      assertThat(result.numericCellCount()).isEqualTo(5);
      assertThat(result.rows()).hasSize(5);
      assertThat(result.errors())
          .containsExactly(
              "Row 4 contains a formula at column B; enter a fixed numeric AMV value.");
    }
  }

  @Test
  void shouldRejectFormulaGradeInsteadOfTrustingItsCachedValue() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(
                "<c r=\"A4\" t=\"inlineStr\"><is><t>A</t></is></c>",
                "<c r=\"A4\" t=\"str\"><f>\"A\"</f><v>A</v></c>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isOne();
    assertThat(result.rows()).hasSize(1);
    assertThat(result.errors())
        .containsExactly("Row 4 contains a formula at column A; enter a fixed grade.");
  }

  @Test
  void shouldRejectFormulaSpeciesHeaderInsteadOfTrustingItsCachedValue() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(
                "<c r=\"B3\" t=\"inlineStr\"><is><t>BA</t></is></c>",
                "<c r=\"B3\" t=\"str\"><f>\"BA\"</f><v>BA</v></c>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isEqualTo(4);
    assertThat(result.rows()).hasSize(4);
    assertThat(result.errors())
        .containsExactly(
            "Header row 3 contains a formula at column B; enter fixed header text.",
            "Column B contains AMV values but has no supported species header.");
  }

  @Test
  void shouldRejectUnmappedScreenSpeciesHeaderInsteadOfPartiallyAcceptingWorkbook()
      throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(">BA</t>", ">BALSA</t>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isEqualTo(4);
    assertThat(result.rows()).hasSize(4);
    assertThat(result.errors())
        .containsExactly(
            "Header row 3 contains unmapped species header 'BALSA' at column B.",
            "Column B contains AMV values but has no supported species header.");
  }

  @Test
  void shouldRejectDuplicateScreenSpeciesHeader() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(">HE</t>", ">BA</t>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isEqualTo(5);
    assertThat(result.rows()).hasSize(5);
    assertThat(result.errors())
        .containsExactly(
            "Header row 3 contains a duplicate species column for 'BA'.",
            "Column C contains AMV values but has no supported species header.");
  }

  @Test
  void shouldRejectDuplicateScreenSpeciesAndGradeCell() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(">1</t>", ">A</t>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isEqualTo(6);
    assertThat(result.rows()).hasSize(6);
    assertThat(result.errors())
        .containsExactly(
            "Row 5 column B duplicates row 4 column B for species 'BA' and grade 'A'.");
  }

  @Test
  void shouldRejectUnsupportedScreenGradeInsteadOfPartiallyAcceptingWorkbook()
      throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(">A</t>", ">8</t>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isOne();
    assertThat(result.rows()).hasSize(1);
    assertThat(result.errors())
        .containsExactly("Row 4 grade '8' is not supported by the RTM AMV review.");
  }

  @Test
  void shouldRejectScreenValuesWithoutAGrade() throws IOException {
    Map<String, byte[]> entries = validScreenWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(
                "<c r=\"A4\" t=\"inlineStr\"><is><t>A</t></is></c>",
                "<c r=\"A4\" t=\"inlineStr\"><is><t></t></is></c>")
            .getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(workbook(entries)), LocalDate.of(2026, 7, 1));

    assertThat(result.numericCellCount()).isOne();
    assertThat(result.rows()).hasSize(1);
    assertThat(result.errors())
        .containsExactly("Row 4 contains AMV values but has no grade.");
  }

  @Test
  void publishedTemplateShouldUseTheScreenMonthAndUserEnteredValues() throws IOException {
    byte[] templateBytes = Files.readAllBytes(resolvePublishedTemplate());
    String sheetXml = workbookEntryText(templateBytes, "xl/worksheets/sheet1.xml");

    assertThat(sheetXml)
        .contains("Enter values for month.")
        .contains("GRADE")
        .contains("PINE")
        .doesNotContain("Enter values for one month.")
        .doesNotContain("Choose the effective month on the upload screen")
        .doesNotContain("Update Date")
        .doesNotContain("Growth Indicator")
        .doesNotContain(">WH<")
        .doesNotContain(">LO<")
        .doesNotContain(">YE<")
        .doesNotContain("<t>Retrieval Date</t>")
        .doesNotContain("<f>TODAY()</f>")
        .doesNotContain("<v>10.25</v>")
        .doesNotContain("<v>20.5</v>")
        .doesNotContain("<v>30.75</v>")
        .doesNotContain("<v>1.25</v>");

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(templateBytes), LocalDate.of(2026, 7, 1));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 7, 1));
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.growthIndicator()).isEqualTo("O");
    assertThat(result.dataRowCount()).isEqualTo(15);
    assertThat(result.numericCellCount()).isZero();
    assertThat(result.errors()).isEmpty();
    assertThat(result.rows()).isEmpty();
  }

  @Test
  void shouldImportOnlyRequestedGradeRows() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(
                RtmEmsLogAmvWorkbookTestFixtures.fullGradeWorkbookWithBlankRow()));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.growthIndicator()).isEqualTo("O");
    assertThat(result.dataRowCount()).isEqualTo(25);
    assertThat(result.numericCellCount()).isEqualTo(25);
    assertThat(result.rows()).hasSize(25);
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::grade)
        .containsExactlyElementsOf(expectedUploadGrades());
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::grade)
        .contains("W", "BLANK")
        .doesNotContain(" ", "N", "O", "P", "Q", "R", "S", "T", "V");
  }

  @Test
  void shouldKeepWhiteLodgepoleAndYellowPineAsDistinctPhysicalKeys() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.singleWhitePineWorkbook()));

    assertThat(result.errors()).isEmpty();
    assertThat(result.numericCellCount()).isOne();
    assertThat(result.rows()).hasSize(1);
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::species)
        .containsExactly("WH");
  }

  @Test
  void shouldAcceptOnePhysicalPineColumnWithScreenContext() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(
                RtmEmsLogAmvWorkbookTestFixtures.singleWhitePineWorkbook()),
            LocalDate.of(2026, 7, 1));

    assertThat(result.errors()).isEmpty();
    assertThat(result.rows())
        .extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::species)
        .containsExactly("WH");
  }

  @Test
  void shouldRejectTheGroupedPineHeaderWithoutScreenContext() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.ambiguousPineWorkbook()));

    assertThat(result.errors())
        .anyMatch(error -> error.contains("ambiguous") && error.contains("WH, LO and YE"));
    assertThat(result.rows()).isEmpty();
  }

  @Test
  void shouldParseTheGroupedPineHeaderWithScreenContext() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.ambiguousPineWorkbook()),
            LocalDate.of(2026, 7, 1));

    assertThat(result.errors()).isEmpty();
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::species)
        .containsExactly("PINE");
  }

  @Test
  void shouldRequireOneSupportedGrowthIndicator() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult missing =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.missingGrowthWorkbook()));
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult invalid =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.invalidGrowthWorkbook()));

    assertThat(missing.errors())
        .contains("Growth indicator is required in the uploaded template.");
    assertThat(invalid.errors())
        .contains("Growth indicator in the uploaded template must be O or S.");
  }

  @Test
  void shouldRejectWorkbookWithoutDateAndHeader() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.Analysis analysis =
        RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.invalidWorkbook()));

    assertThat(analysis.headerDetected()).isFalse();
    assertThat(analysis.numericCellCount()).isZero();
    assertThat(analysis.errors())
        .contains("The template header was not recognized as RTM EMS AMV data.");
  }

  @Test
  void shouldRejectWorksheetWithTooManyRows() throws IOException {
    StringBuilder sheet =
        new StringBuilder(
            "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
    for (int row = 1; row <= 10_001; row++) {
      sheet.append("<row r=\"").append(row).append("\"><c r=\"A")
          .append(row).append("\"><v>1</v></c></row>");
    }
    sheet.append("</sheetData></worksheet>");

    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put("xl/worksheets/sheet1.xml", sheet.toString().getBytes(StandardCharsets.UTF_8));
    byte[] workbook = workbook(entries);

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook)))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("too many rows");
  }

  @Test
  void shouldRejectWorkbookWithTooManyArchiveEntries() throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(output)) {
      for (int index = 0; index < 129; index++) {
        zip.putNextEntry(new ZipEntry("part-" + index + ".xml"));
        zip.closeEntry();
      }
    }

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(output.toByteArray())))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("too many entries");
  }

  @Test
  void shouldResolveFirstDeclaredWorksheetInsteadOfFirstWorksheetArchiveEntry()
      throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "[Content_Types].xml",
        textEntry(entries, "[Content_Types].xml")
            .replace(
                "</Types>",
                "<Override PartName=\"/xl/worksheets/sheet2.xml\" "
                    + "ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                    + "</Types>")
            .getBytes(StandardCharsets.UTF_8));
    entries.put(
        "xl/workbook.xml",
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets>
            <sheet name="Declared first" sheetId="2" r:id="rId2"/>
            <sheet name="Archive first" sheetId="1" r:id="rId1"/>
          </sheets>
        </workbook>
        """.getBytes(StandardCharsets.UTF_8));
    entries.put(
        "xl/_rels/workbook.xml.rels",
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
        </Relationships>
        """.getBytes(StandardCharsets.UTF_8));
    entries.put(
        "xl/worksheets/sheet1.xml",
        "<worksheet><sheetData><row r=\"1\"><c r=\"A1\"><v>999</v></c></row></sheetData></worksheet>"
            .getBytes(StandardCharsets.UTF_8));
    entries.put("xl/worksheets/sheet2.xml", uploadWorksheet().getBytes(StandardCharsets.UTF_8));

    RtmEmsLogAmvUploadPreviewAnalyzer.Analysis result =
        RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
            new ByteArrayInputStream(workbook(entries)));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.numericCellCount()).isEqualTo(1);
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::species)
        .containsExactly("BA");
  }

  @Test
  void shouldRejectPackageMissingWorkbookCorePart() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.remove("xl/workbook.xml");

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("missing required part xl/workbook.xml");
  }

  @Test
  void shouldRejectCaseCollidingCoreParts() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put("[content_types].xml", entries.get("[Content_Types].xml"));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("duplicate entries");
  }

  @Test
  void shouldRejectMacroEnabledWorkbookContentType() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "[Content_Types].xml",
        textEntry(entries, "[Content_Types].xml")
            .replace(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
                "application/vnd.ms-excel.sheet.macroEnabled.main+xml")
            .getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("unsafe content type");
  }

  @Test
  void shouldRejectExternalWorkbookRelationship() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "xl/_rels/workbook.xml.rels",
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="https://example.invalid/sheet.xml" TargetMode="External"/>
        </Relationships>
        """.getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("external relationship");
  }

  @Test
  void shouldRejectRelationshipTargetThatEscapesThePackage() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "xl/_rels/workbook.xml.rels",
        textEntry(entries, "xl/_rels/workbook.xml.rels")
            .replace("worksheets/sheet1.xml", "../../../outside.xml")
            .getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("unsafe relationship target");
  }

  @Test
  void shouldRejectEncodedTraversalAndBackslashRelationshipTargets() throws IOException {
    for (String unsafeTarget :
        List.of(
            "%2e%2e/%2e%2e/%2e%2e/outside.xml",
            "worksheets%5csheet1.xml")) {
      Map<String, byte[]> entries = validWorkbookEntries();
      entries.put(
          "xl/_rels/workbook.xml.rels",
          textEntry(entries, "xl/_rels/workbook.xml.rels")
              .replace("worksheets/sheet1.xml", unsafeTarget)
              .getBytes(StandardCharsets.UTF_8));
      byte[] unsafeWorkbook = workbook(entries);

      assertThatThrownBy(
              () ->
                  RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                      new ByteArrayInputStream(unsafeWorkbook)))
          .isInstanceOf(IOException.class)
          .hasMessageContaining("unsafe relationship target");
    }
  }

  @Test
  void shouldRejectTooManyContentTypeDeclarations() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "[Content_Types].xml",
        contentTypesWithDeclarationCount(513).getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("too many declarations");
  }

  @Test
  void shouldRejectTooManyRelationshipsInOnePart() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "xl/_rels/workbook.xml.rels",
        relationshipPart("workbook", 513).getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("relationships part contains too many relationships");
  }

  @Test
  void shouldRejectTooManyRelationshipsAcrossThePackage() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    for (int part = 1; part <= 4; part++) {
      entries.put(
          "xl/worksheets/_rels/extra" + part + ".xml.rels",
          relationshipPart("part" + part, 512).getBytes(StandardCharsets.UTF_8));
    }

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("package contains too many relationships");
  }

  @Test
  void shouldRejectTooManyWorkbookSheetDeclarations() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "xl/workbook.xml", workbookWithSheetCount(257).getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("workbook declares too many sheets");
  }

  @Test
  void shouldRejectOversizedCellReferenceAttribute() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    String oversizedReference = "A".repeat(33) + "1";
    entries.put(
        "xl/worksheets/sheet1.xml",
        uploadWorksheet()
            .replace("r=\"A2\"", "r=\"" + oversizedReference + "\"")
            .getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("oversized cell reference");
  }

  @Test
  void shouldRejectHighCompressionRatioWhenZipEntryUsesDataDescriptor() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put("docProps/compressed.bin", new byte[2 * 1024 * 1024]);

    assertThatThrownBy(
            () ->
                RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
                    new ByteArrayInputStream(workbook(entries))))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("compression ratio is too high");
  }

  private static List<String> expectedUploadGrades() {
    List<String> grades = new ArrayList<>();
    for (char grade = 'A'; grade <= 'M'; grade++) {
      grades.add(String.valueOf(grade));
    }
    grades.addAll(List.of("U", "X", "Y", "Z"));
    grades.add(14, "W");
    for (int grade = 1; grade <= 6; grade++) {
      grades.add(String.valueOf(grade));
    }
    grades.add("BLANK");
    return grades;
  }

  private static Path resolvePublishedTemplate() {
    Path fromBackendModule =
        Path.of("..", "frontend", "public", "templates", "rtm-ems-log-amv-template.xlsx");
    if (Files.exists(fromBackendModule)) {
      return fromBackendModule;
    }
    return Path.of("frontend", "public", "templates", "rtm-ems-log-amv-template.xlsx");
  }

  private static String workbookEntryText(byte[] workbook, String entryName) throws IOException {
    try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(workbook))) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        if (entryName.equals(entry.getName())) {
          return new String(zip.readAllBytes(), StandardCharsets.UTF_8);
        }
      }
    }
    throw new IOException("Workbook entry not found: " + entryName);
  }

  private static Map<String, byte[]> validWorkbookEntries() throws IOException {
    return workbookEntries(RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook());
  }

  private static Map<String, byte[]> validScreenWorkbookEntries() throws IOException {
    Map<String, byte[]> entries = validWorkbookEntries();
    entries.put(
        "xl/worksheets/sheet1.xml",
        textEntry(entries, "xl/worksheets/sheet1.xml")
            .replace(">WH</t>", ">CE</t>")
            .replace(">LO</t>", ">CY</t>")
            .replace(">YE</t>", ">FI</t>")
            .getBytes(StandardCharsets.UTF_8));
    return entries;
  }

  private static Map<String, byte[]> workbookEntries(byte[] workbook) throws IOException {
    Map<String, byte[]> entries = new LinkedHashMap<>();
    try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(workbook))) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        entries.put(entry.getName(), zip.readAllBytes());
      }
    }
    return entries;
  }

  private static String textEntry(Map<String, byte[]> entries, String entryName) {
    return new String(entries.get(entryName), StandardCharsets.UTF_8);
  }

  private static byte[] workbook(Map<String, byte[]> entries) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(output)) {
      for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
        zip.putNextEntry(new ZipEntry(entry.getKey()));
        zip.write(entry.getValue());
        zip.closeEntry();
      }
    }
    return output.toByteArray();
  }

  private static String contentTypesWithDeclarationCount(int declarationCount) {
    StringBuilder contentTypes =
        new StringBuilder(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            """);
    for (int index = 0; index < declarationCount; index++) {
      contentTypes
          .append("<Override PartName=\"/custom/part-")
          .append(index)
          .append(".xml\" ContentType=\"application/xml\"/>");
    }
    return contentTypes.append("</Types>").toString();
  }

  private static String relationshipPart(String idPrefix, int relationshipCount) {
    StringBuilder relationships =
        new StringBuilder(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            """);
    for (int index = 0; index < relationshipCount; index++) {
      relationships
          .append("<Relationship Id=\"")
          .append(idPrefix)
          .append(index)
          .append(
              "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"../media/image-")
          .append(index)
          .append(".png\"/>");
    }
    return relationships.append("</Relationships>").toString();
  }

  private static String workbookWithSheetCount(int sheetCount) {
    StringBuilder workbook =
        new StringBuilder(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <sheets>
            """);
    for (int index = 1; index <= sheetCount; index++) {
      workbook
          .append("<sheet name=\"Sheet ")
          .append(index)
          .append("\" sheetId=\"")
          .append(index)
          .append("\" r:id=\"rId")
          .append(index)
          .append("\"/>");
    }
    return workbook.append("</sheets></workbook>").toString();
  }

  private static String uploadWorksheet() {
    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row r="1">
              <c r="A1" t="inlineStr"><is><t>Update Date</t></is></c>
              <c r="B1" t="inlineStr"><is><t>2026-06-01</t></is></c>
            </row>
            <row r="2">
              <c r="A2" t="inlineStr"><is><t>Growth Indicator (O or S)</t></is></c>
              <c r="B2" t="inlineStr"><is><t>O</t></is></c>
            </row>
            <row r="3">
              <c r="A3" t="inlineStr"><is><t>GRADE</t></is></c>
              <c r="B3" t="inlineStr"><is><t>BA</t></is></c>
            </row>
            <row r="4">
              <c r="A4" t="inlineStr"><is><t>A</t></is></c>
              <c r="B4"><v>10.25</v></c>
            </row>
          </sheetData>
        </worksheet>
        """;
  }
}

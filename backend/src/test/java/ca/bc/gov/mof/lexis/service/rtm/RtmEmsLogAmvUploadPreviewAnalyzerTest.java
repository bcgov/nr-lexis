package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.Test;

class RtmEmsLogAmvUploadPreviewAnalyzerTest {

  @Test
  void shouldParseMatrixWorkbookForUpload() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook()),
            LocalDate.of(2026, 6, 1));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.dataRowCount()).isEqualTo(2);
    assertThat(result.numericCellCount()).isEqualTo(4);
    assertThat(result.errors()).isEmpty();
    assertThat(result.rows()).hasSize(6);
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::species)
        .contains("BA", "HE", "WH", "LO", "YE");
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::grade)
        .contains("A", "1");
  }

  @Test
  void shouldUseSubmissionDateForRetrievalAndWorkbookUpdateDate() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(
                RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbookWithMetadataRows()),
            LocalDate.of(2026, 8, 14));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 8, 14));
    assertThat(result.dataRowCount()).isEqualTo(2);
    assertThat(result.numericCellCount()).isEqualTo(4);
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
    assertThat(analysis.numericCellCount()).isEqualTo(4);
    assertThat(analysis.rows()).hasSize(6);
    assertThat(analysis.errors()).isEmpty();
  }

  @Test
  void publishedTemplateShouldRequireUpdateDateAndUserEnteredValues() throws IOException {
    byte[] templateBytes = Files.readAllBytes(resolvePublishedTemplate());
    String sheetXml = workbookEntryText(templateBytes, "xl/worksheets/sheet1.xml");

    assertThat(sheetXml)
        .contains("<t>Update Date</t>")
        .contains("<t>GRADE</t>")
        .doesNotContain("<t>Retrieval Date</t>")
        .doesNotContain("<f>TODAY()</f>")
        .doesNotContain("<v>10.25</v>")
        .doesNotContain("<v>20.5</v>")
        .doesNotContain("<v>30.75</v>")
        .doesNotContain("<v>1.25</v>");

    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(templateBytes), LocalDate.of(2026, 7, 6));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isNull();
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 7, 6));
    assertThat(result.dataRowCount()).isEqualTo(23);
    assertThat(result.numericCellCount()).isZero();
    assertThat(result.errors()).isEmpty();
    assertThat(result.rows()).isEmpty();
  }

  @Test
  void shouldImportOnlyRequestedGradeRows() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(
                RtmEmsLogAmvWorkbookTestFixtures.fullGradeWorkbookWithBlankRow()),
            LocalDate.of(2026, 6, 1));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.dataRowCount()).isEqualTo(23);
    assertThat(result.numericCellCount()).isEqualTo(23);
    assertThat(result.rows()).hasSize(23);
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::grade)
        .containsExactlyElementsOf(expectedUploadGrades());
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::grade)
        .doesNotContain(" ", "N", "O", "P", "Q", "R", "S", "T", "V", "W");
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

  private static List<String> expectedUploadGrades() {
    List<String> grades = new ArrayList<>();
    for (char grade = 'A'; grade <= 'M'; grade++) {
      grades.add(String.valueOf(grade));
    }
    grades.addAll(List.of("U", "X", "Y", "Z"));
    for (int grade = 1; grade <= 6; grade++) {
      grades.add(String.valueOf(grade));
    }
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
}

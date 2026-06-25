package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
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
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 5, 1));
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
  void shouldPreferWorkbookMetadataDatesWhenPresent() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(
                RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbookWithMetadataRows()),
            LocalDate.of(2026, 8, 1));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 5, 1));
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
}

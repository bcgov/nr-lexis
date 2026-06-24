package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class RtmEmsLogAmvUploadPreviewAnalyzerTest {

  @Test
  void shouldParseMatrixWorkbookForUpload() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
        RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook()));

    assertThat(result.headerDetected()).isTrue();
    assertThat(result.updateDate()).isEqualTo(LocalDate.of(2026, 7, 1));
    assertThat(result.retrievalDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(result.dataRowCount()).isEqualTo(2);
    assertThat(result.numericCellCount()).isEqualTo(4);
    assertThat(result.errors()).isEmpty();
    assertThat(result.rows()).hasSize(6);
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::species)
        .contains("BA", "HE", "PL", "PW", "PY");
    assertThat(result.rows()).extracting(RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow::grade)
        .contains("A", "1");
  }

  @Test
  void shouldAnalyzeMatrixWorkbook() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.Analysis analysis =
        RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook()));

    assertThat(analysis.headerDetected()).isTrue();
    assertThat(analysis.updateDate()).isEqualTo(LocalDate.of(2026, 7, 1));
    assertThat(analysis.retrievalDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(analysis.dataRowCount()).isEqualTo(2);
    assertThat(analysis.numericCellCount()).isEqualTo(4);
    assertThat(analysis.rows()).hasSize(6);
    assertThat(analysis.errors()).isEmpty();
  }

  @Test
  void shouldRejectWorkbookWithoutDateAndHeader() throws IOException {
    RtmEmsLogAmvUploadPreviewAnalyzer.Analysis analysis =
        RtmEmsLogAmvUploadPreviewAnalyzer.analyze(
            new ByteArrayInputStream(RtmEmsLogAmvWorkbookTestFixtures.invalidWorkbook()));

    assertThat(analysis.headerDetected()).isFalse();
    assertThat(analysis.numericCellCount()).isZero();
    assertThat(analysis.errors())
        .contains(
            "The first row must include the update date.",
            "The template header was not recognized as RTM EMS AMV data.");
  }
}

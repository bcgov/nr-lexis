package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import org.junit.jupiter.api.Test;

class RtmEmsLogAmvUploadPreviewAnalyzerTest {

  @Test
  void shouldAnalyzeProvidedSuccessWorkbook() throws IOException {
    try (InputStream inputStream = resource("data_upload_template-success.xlsx")) {
      RtmEmsLogAmvUploadPreviewAnalyzer.Analysis analysis =
          RtmEmsLogAmvUploadPreviewAnalyzer.analyze(inputStream);

      assertThat(analysis.headerDetected()).isTrue();
      assertThat(analysis.dataRowCount()).isEqualTo(17);
      assertThat(analysis.numericCellCount()).isEqualTo(71);
      assertThat(analysis.errors()).isEmpty();
    }
  }

  @Test
  void shouldParseProvidedSuccessWorkbookForUpload() throws IOException {
    try (InputStream inputStream = resource("data_upload_template-success.xlsx")) {
      RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult result =
          RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(inputStream);

      assertThat(result.headerDetected()).isTrue();
      assertThat(result.dataRowCount()).isEqualTo(17);
      assertThat(result.numericCellCount()).isEqualTo(63);
      assertThat(result.rows()).hasSize(63);
      assertThat(result.rows().stream().anyMatch(row -> "Average".equalsIgnoreCase(row.grade()))).isFalse();
      assertThat(result.rows().stream().anyMatch(row -> row.grade().startsWith("Grand Total"))).isFalse();
    }
  }

  @Test
  void shouldRejectProvidedFailureWorkbook() throws IOException {
    try (InputStream inputStream = resource("data_upload_template-failure-1.xlsx")) {
      RtmEmsLogAmvUploadPreviewAnalyzer.Analysis analysis =
          RtmEmsLogAmvUploadPreviewAnalyzer.analyze(inputStream);

      assertThat(analysis.headerDetected()).isFalse();
      assertThat(analysis.numericCellCount()).isZero();
      assertThat(analysis.errors()).contains("The template header was not recognized as RTM EMS AMV data.");
    }
  }

  private InputStream resource(String name) {
    InputStream inputStream =
        getClass().getResourceAsStream("/rtm-upload-samples/" + name);
    assertThat(inputStream).isNotNull();
    return inputStream;
  }
}

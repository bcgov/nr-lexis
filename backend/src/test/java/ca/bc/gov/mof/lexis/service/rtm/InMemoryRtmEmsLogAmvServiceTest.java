package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class InMemoryRtmEmsLogAmvServiceTest {

  private static final Clock FIXED_CLOCK =
      Clock.fixed(Instant.parse("2026-06-23T12:00:00Z"), ZoneOffset.UTC);

  @Test
  void shouldPreviewProvidedSuccessWorkbook() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(FIXED_CLOCK);

    RtmEmsLogAmvUploadPreviewDto result =
        service.previewUpload(workbook("data_upload_template-success.xlsx"));

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.rowCount()).isEqualTo(17);
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldUploadProvidedSuccessWorkbook() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result =
        service.upload(workbook("data_upload_template-success.xlsx"), "2026-01-01", "S");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.attemptedRowCount()).isEqualTo(63);
    assertThat(result.uploadedRowCount()).isEqualTo(63);
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldRejectProvidedFailureWorkbook() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result =
        service.upload(workbook("data_upload_template-failure-1.xlsx"), "2026-01-01", "S");

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.uploadedRowCount()).isZero();
    assertThat(result.errors()).contains("The template header is not recognized as an RTM EMS AMV sheet.");
  }

  private MultipartFile workbook(String name) throws IOException {
    try (InputStream inputStream = getClass().getResourceAsStream("/rtm-upload-samples/" + name)) {
      assertThat(inputStream).isNotNull();
      return new MockMultipartFile(
          "file",
          name,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          inputStream);
    }
  }
}

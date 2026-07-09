package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import java.io.IOException;
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
  void shouldPreviewMatrixWorkbook() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(FIXED_CLOCK);

    RtmEmsLogAmvUploadPreviewDto result = service.previewUpload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.rowCount()).isEqualTo(12);
    assertThat(result.retrievalDate()).isEqualTo("2026-06-01");
    assertThat(result.updateDate()).isEqualTo("2026-06-01");
    assertThat(result.rows()).hasSize(12);
    assertThat(result.rows()).extracting(row -> row.growthIndicator()).contains("O", "S");
    assertThat(result.rows()).extracting(row -> row.species()).contains("WH", "LO", "YE");
    assertThat(result.errors()).isEmpty();
    assertThat(result.warnings()).isEmpty();
  }

  @Test
  void shouldUploadMatrixWorkbookToOldAndSecondGrowth() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook(), null, null);

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.attemptedRowCount()).isEqualTo(12);
    assertThat(result.uploadedRowCount()).isEqualTo(12);
    assertThat(result.rows()).extracting(row -> row.growthIndicator()).contains("O", "S");
    assertThat(result.rows()).extracting(row -> row.retrievalDate()).containsOnly("2026-06-01");
    assertThat(result.rows()).extracting(row -> row.updateDate()).containsOnly("2026-06-01");
    assertThat(result.errors()).isEmpty();
    assertThat(result.warnings()).isEmpty();
  }

  @Test
  void shouldRejectInvalidWorkbook() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(invalidWorkbook(), null, null);

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.uploadedRowCount()).isZero();
    assertThat(result.errors())
        .contains("The template header is not recognized as an RTM EMS AMV sheet.");
  }

  @Test
  void shouldSaveBlankTableValue() {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(FIXED_CLOCK);

    var result =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-01", null, null, "create"));

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.rows()).singleElement().satisfies(row -> assertThat(row.newValue()).isNull());
  }

  private MultipartFile matrixWorkbook() throws IOException {
    return workbook("matrix.xlsx", RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook());
  }

  private MultipartFile invalidWorkbook() throws IOException {
    return workbook("invalid.xlsx", RtmEmsLogAmvWorkbookTestFixtures.invalidWorkbook());
  }

  private MultipartFile workbook(String name, byte[] content) {
    return new MockMultipartFile(
        "file",
        name,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content);
  }
}

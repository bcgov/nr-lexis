package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class InMemoryRtmEmsLogAmvServiceTest {

  @Test
  void shouldPreviewMatrixWorkbook() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService();
    seedMatrixTargets(service);

    RtmEmsLogAmvUploadPreviewDto result = service.previewUpload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.rowCount()).isEqualTo(6);
    assertThat(result.retrievalDate()).isEqualTo("2026-06-01");
    assertThat(result.updateDate()).isEqualTo("2026-06-01");
    assertThat(result.rows()).hasSize(6);
    assertThat(result.rows()).extracting(row -> row.growthIndicator()).containsOnly("O");
    assertThat(result.rows()).extracting(row -> row.species()).contains("WH", "LO", "YE");
    assertThat(result.errors()).isEmpty();
    assertThat(result.warnings()).isEmpty();
  }

  @Test
  void shouldRejectPreviewWhenNoExactExistingTargetsAreAvailable() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService();

    RtmEmsLogAmvUploadPreviewDto result = service.previewUpload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.rowCount()).isZero();
    assertThat(result.errors())
        .contains("No eligible existing AMV rows were found in the uploaded file.");
    assertThat(result.warnings())
        .contains(
            "6 workbook rows were skipped because the exact existing AMV key was not found for 2026-06-01.");
  }

  @Test
  void shouldUploadMatrixWorkbookOnlyToDeclaredGrowth() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService();
    seedMatrixTargets(service);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.attemptedRowCount()).isEqualTo(6);
    assertThat(result.uploadedRowCount()).isEqualTo(6);
    assertThat(result.rows()).extracting(row -> row.growthIndicator()).containsOnly("O");
    assertThat(result.rows()).extracting(row -> row.retrievalDate()).containsOnly("2026-06-01");
    assertThat(result.rows()).extracting(row -> row.updateDate()).containsOnly("2026-06-01");
    assertThat(result.errors()).isEmpty();
    assertThat(result.warnings()).isEmpty();
  }

  @Test
  void shouldApplyScreenMonthToGroupedPineAndBothGrowthTypes() throws IOException {
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(clock);
    List.of("WH", "LO", "YE")
        .forEach(
            species ->
                List.of("O", "S")
                    .forEach(
                        growth ->
                            service.save(
                                new RtmEmsLogAmvSaveRequestDto(
                                    species,
                                    "A",
                                    growth,
                                    "2026-06-01",
                                    null,
                                    BigDecimal.ZERO,
                                    "create"))));

    MultipartFile workbook =
        workbook("grouped-pine.xlsx", RtmEmsLogAmvWorkbookTestFixtures.ambiguousPineWorkbook());
    RtmEmsLogAmvUploadPreviewDto preview = service.previewUpload(workbook, "2026-07-01");
    RtmEmsLogAmvUploadResultDto upload = service.upload(workbook, "2026-07-01");
    RtmEmsLogAmvUploadResultDto reupload = service.upload(workbook, "2026-07-01");

    assertThat(preview.status()).isEqualTo("accepted");
    assertThat(preview.retrievalDate()).isEqualTo("2026-06-01");
    assertThat(preview.updateDate()).isEqualTo("2026-07-01");
    assertThat(preview.rows())
        .extracting(row -> List.of(row.species(), row.growthIndicator()))
        .contains(List.of("PINE", "O"));
    assertThat(upload.status()).isEqualTo("accepted");
    assertThat(upload.attemptedRowCount()).isEqualTo(6);
    assertThat(upload.uploadedRowCount()).isEqualTo(6);
    assertThat(reupload.status()).isEqualTo("accepted");
    assertThat(reupload.uploadedRowCount()).isEqualTo(6);
  }

  @Test
  void shouldRejectCurrentPreviousAndLaterFutureScreenMonths() throws IOException {
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(clock);
    MultipartFile workbook =
        workbook("grouped-pine.xlsx", RtmEmsLogAmvWorkbookTestFixtures.ambiguousPineWorkbook());

    var currentMonth = service.previewUpload(workbook, "2026-06-01");
    var previousMonth = service.upload(workbook, "2026-05-01");
    var laterFutureMonth = service.previewUpload(workbook, "2026-08-01");

    assertThat(currentMonth.status()).isEqualTo("validation_failed");
    assertThat(previousMonth.status()).isEqualTo("validation_failed");
    assertThat(laterFutureMonth.status()).isEqualTo("validation_failed");
    assertThat(currentMonth.errors())
        .containsExactly("Average market values can only be uploaded for the next month.");
    assertThat(previousMonth.errors()).containsExactlyElementsOf(currentMonth.errors());
    assertThat(laterFutureMonth.errors()).containsExactlyElementsOf(currentMonth.errors());
  }

  @Test
  void shouldCompareTheScreenUploadAgainstTheLatestAvailableValues() throws IOException {
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(clock);
    service.save(
        new RtmEmsLogAmvSaveRequestDto(
            "BA", "A", "O", "2026-05-01", null, new BigDecimal("75.29"), "create"));
    MultipartFile workbook =
        workbook(
            "single-balsam.xlsx",
            RtmEmsLogAmvWorkbookTestFixtures.singleBalsamWorkbook());

    var preview = service.previewUpload(workbook, "2026-07-01");

    assertThat(preview.status()).isEqualTo("accepted");
    assertThat(preview.retrievalDate()).isEqualTo("2026-05-01");
    assertThat(preview.updateDate()).isEqualTo("2026-07-01");
    assertThat(preview.rows())
        .filteredOn(row -> "BA".equals(row.species()) && "A".equals(row.grade()))
        .singleElement()
        .satisfies(
            row -> {
              assertThat(row.currentValue()).isEqualByComparingTo("75.29");
              assertThat(row.newValue()).isEqualByComparingTo("10.25");
            });
  }

  @Test
  void shouldRejectInvalidWorkbook() throws IOException {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService();

    RtmEmsLogAmvUploadResultDto result = service.upload(invalidWorkbook());

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.uploadedRowCount()).isZero();
    assertThat(result.errors())
        .contains("The template header is not recognized as an RTM EMS AMV sheet.");
  }

  @Test
  void shouldRejectValuesOutsideTheAmvColumnContract() {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService();

    var blankResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-01", null, null, "create"));
    var precisionResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-01", null, new BigDecimal("10.123"), "create"));
    var rangeResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-01", null, new BigDecimal("10000.00"), "create"));
    var dayLevelDateResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-10", null, new BigDecimal("10.25"), "create"));

    assertThat(blankResult.status()).isEqualTo("validation_failed");
    assertThat(blankResult.errors()).contains("New value is required.");
    assertThat(precisionResult.status()).isEqualTo("validation_failed");
    assertThat(precisionResult.errors()).contains("New value must have no more than 2 decimal places.");
    assertThat(rangeResult.status()).isEqualTo("validation_failed");
    assertThat(rangeResult.errors()).contains("New value must not exceed 9999.99.");
    assertThat(dayLevelDateResult.status()).isEqualTo("accepted");
    assertThat(dayLevelDateResult.rows())
        .extracting(row -> row.retrievalDate())
        .containsExactly("2026-07-01");
  }

  @Test
  void shouldApplyPineToAllPhysicalSpeciesAndBothGrowthTypesInOneBatch() {
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(clock);

    var result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "PINE",
                    "A",
                    "O",
                    "2026-07-01",
                    "2026-07-01",
                    new BigDecimal("10.25"),
                    "update")));

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.rows()).hasSize(6);
    assertThat(service.find("", "", "2026-07-01", "2026-07-01"))
        .extracting(row -> List.of(row.species(), row.growthIndicator(), row.newValue()))
        .containsExactlyInAnyOrder(
            List.of("WH", "O", new BigDecimal("10.25")),
            List.of("WH", "S", new BigDecimal("10.25")),
            List.of("LO", "O", new BigDecimal("10.25")),
            List.of("LO", "S", new BigDecimal("10.25")),
            List.of("YE", "O", new BigDecimal("10.25")),
            List.of("YE", "S", new BigDecimal("10.25")));
  }

  @Test
  void shouldRejectAnyBatchOutsideTheImmediatelyUpcomingMonth() {
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(clock);

    var historic =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "Z",
                    "O",
                    "2000-02-01",
                    "2000-02-01",
                    new BigDecimal("10.25"),
                    "update")));
    var current =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "Z",
                    "O",
                    "2026-06-01",
                    "2026-06-01",
                    new BigDecimal("10.25"),
                    "update")));
    var laterFuture =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "Z",
                    "O",
                    "2026-08-01",
                    "2026-08-01",
                    new BigDecimal("10.25"),
                    "update")));

    assertThat(historic.status()).isEqualTo("validation_failed");
    assertThat(current.status()).isEqualTo("validation_failed");
    assertThat(laterFuture.status()).isEqualTo("validation_failed");
    assertThat(historic.errors())
        .containsExactly(
            "Table value 1: Average market values can only be saved for the next month.");
    assertThat(current.errors()).containsExactlyElementsOf(historic.errors());
    assertThat(laterFuture.errors()).containsExactlyElementsOf(historic.errors());
    assertThat(historic.rows()).isEmpty();
    assertThat(current.rows()).isEmpty();
    assertThat(laterFuture.rows()).isEmpty();
  }

  @Test
  void shouldSaveTheFixedBlankGradeForTheUpcomingMonth() {
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService(clock);

    var result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "BLANK",
                    "O",
                    "2026-06-01",
                    "2026-07-01",
                    BigDecimal.ONE,
                    "update")));

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.rows())
        .extracting(row -> List.of(row.grade(), row.growthIndicator(), row.newValue()))
        .containsExactlyInAnyOrder(
            List.of("BLANK", "O", BigDecimal.ONE),
            List.of("BLANK", "S", BigDecimal.ONE));
  }

  @Test
  void shouldFindTableRowsForEffectiveDateAfterCreateAndUpdate() {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService();

    var createResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-01", "2026-07-01", new BigDecimal("10.25"), "create"));
    var updateResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "B", "S", "2026-01-01", "2026-07-01", new BigDecimal("11.50"), "update"));

    assertThat(createResult.status()).isEqualTo("accepted");
    assertThat(updateResult.status()).isEqualTo("accepted");
    assertThat(service.find("", "", "2026-07-01", "2026-07-01"))
        .extracting(row -> List.of(row.species(), row.grade(), row.growthIndicator(), row.newValue()))
        .contains(
            List.of("BA", "A", "O", new BigDecimal("10.25")),
            List.of("BA", "B", "S", new BigDecimal("11.50")));
  }

  @Test
  void shouldFindLatestEffectiveDateRowsBeforeTargetDate() {
    InMemoryRtmEmsLogAmvService service = new InMemoryRtmEmsLogAmvService();
    service.save(
        new RtmEmsLogAmvSaveRequestDto(
            "BA", "A", "O", "2026-07-01", null, new BigDecimal("10.25"), "create"));
    service.save(
        new RtmEmsLogAmvSaveRequestDto(
            "BA", "A", "O", "2026-08-01", null, new BigDecimal("20.50"), "create"));

    assertThat(service.findLatestBefore("2026-08-01"))
        .extracting(row -> List.of(row.species(), row.retrievalDate(), row.newValue()))
        .contains(List.of("BA", "2026-07-01", new BigDecimal("10.25")));
    assertThat(service.findLatestBefore("2026-09-01"))
        .extracting(row -> List.of(row.species(), row.retrievalDate(), row.newValue()))
        .contains(List.of("BA", "2026-08-01", new BigDecimal("20.50")));

    assertThat(service.findLatestBefore("2026-08-10"))
        .extracting(row -> List.of(row.species(), row.retrievalDate(), row.newValue()))
        .contains(List.of("BA", "2026-07-01", new BigDecimal("10.25")));
  }

  private MultipartFile matrixWorkbook() throws IOException {
    return workbook("matrix.xlsx", RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook());
  }

  private void seedMatrixTargets(InMemoryRtmEmsLogAmvService service) {
    List.of(
            List.of("BA", "A"),
            List.of("HE", "A"),
            List.of("WH", "A"),
            List.of("LO", "A"),
            List.of("YE", "A"),
            List.of("BA", "1"))
        .forEach(
            key ->
                assertThat(
                        service
                            .save(
                                new RtmEmsLogAmvSaveRequestDto(
                                    key.get(0),
                                    key.get(1),
                                    "O",
                                    "2026-06-01",
                                    null,
                                    BigDecimal.ZERO,
                                    "create"))
                            .status())
                    .isEqualTo("accepted"));
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

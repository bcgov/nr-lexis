package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.repository.rtm.OracleRtmEmsLogAmvRepository;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class OracleRtmEmsLogAmvServiceTest {

  private static final Clock FIXED_CLOCK =
      Clock.fixed(Instant.parse("2026-06-23T12:00:00Z"), ZoneOffset.UTC);

  @Test
  void shouldInstantiateWithRepositoryConstructorInOracleProfile() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles("oracle");
      context.registerBean(
          OracleRtmEmsLogAmvRepository.class,
          () -> mock(OracleRtmEmsLogAmvRepository.class));
      context.registerBean(VirusScanService.class, () -> VirusScanService.NO_OP);
      context.register(OracleRtmEmsLogAmvService.class);

      context.refresh();

      assertThat(context.getBean(RtmEmsLogAmvService.class))
          .isInstanceOf(OracleRtmEmsLogAmvService.class);
    }
  }

  @Test
  void shouldDefaultFindUpdateDateToRetrievalDate() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.find(anyString(), anyString(), any(LocalDate.class), any(LocalDate.class)))
        .thenReturn(List.of());
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    service.find("HE", "O", "2026-06-01", "");

    verify(repository)
        .find("HE", "O", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 1));
  }

  @Test
  void shouldUploadMatrixWorkbookWithLegacyUpdateProcedure() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenReturn("0");
    stubAppliedFixtureValues(repository);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook(), null, null);

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.warnings()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(12);
    assertThat(result.uploadedRowCount()).isEqualTo(12);
    verify(repository, times(12))
        .update(
            anyString(),
            anyString(),
            anyString(),
            eq(LocalDate.of(2026, 6, 1)),
            eq(LocalDate.of(2026, 6, 1)),
            any(BigDecimal.class));
    verify(repository, never())
        .insert(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(BigDecimal.class));
  }

  @Test
  void shouldUploadPineCellsToFunctionalPineCodes() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenReturn("0");
    stubAppliedFixtureValues(repository);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook(), null, null);

    ArgumentCaptor<String> speciesCaptor = ArgumentCaptor.forClass(String.class);
    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.warnings()).isEmpty();
    verify(repository, times(12))
        .update(
            speciesCaptor.capture(),
            anyString(),
            anyString(),
            eq(LocalDate.of(2026, 6, 1)),
            eq(LocalDate.of(2026, 6, 1)),
            any(BigDecimal.class));
    assertThat(speciesCaptor.getAllValues())
        .contains("WH", "LO", "YE")
        .doesNotContain("PL", "PW", "PY");
  }

  @Test
  void shouldAcceptPreviewWhenTargetGrowthRowsExist() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(updateDate))).thenReturn(true);
    when(repository.existsExact(eq("BA"), eq("A"), eq("S"), eq(updateDate))).thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    var result = service.previewUpload(singleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.rowCount()).isEqualTo(2);
  }

  @Test
  void shouldSkipPreviewRowsWhenOptionalSpeciesGradeTargetIsMissing() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("CE"), eq("C"), eq("O"), eq(updateDate))).thenReturn(false);
    when(repository.existsExact(eq("CE"), eq("C"), eq("S"), eq(updateDate))).thenReturn(false);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    var result = service.previewUpload(optionalCedarGradeWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.rowCount()).isZero();
    assertThat(result.rows()).isEmpty();
  }

  @Test
  void shouldRejectPreviewWhenTargetGrowthRowIsMissing() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(updateDate))).thenReturn(true);
    when(repository.existsExact(eq("BA"), eq("A"), eq("S"), eq(updateDate))).thenReturn(false);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    var result = service.previewUpload(singleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.errors())
        .contains(
            "No existing AMV row found for species 'BA', grade 'A', growth 'S', effective date '2026-06-01'.");
  }

  @Test
  void shouldRejectUploadBeforeMutationWhenTargetGrowthRowIsMissing() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(updateDate))).thenReturn(true);
    when(repository.existsExact(eq("BA"), eq("A"), eq("S"), eq(updateDate))).thenReturn(false);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(singleBalsamWorkbook(), null, null);

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.uploadedRowCount()).isZero();
    assertThat(result.errors())
        .contains(
            "No existing AMV row found for species 'BA', grade 'A', growth 'S', effective date '2026-06-01'.");
    verify(repository, never())
        .update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class));
    verify(repository, never())
        .insert(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(BigDecimal.class));
  }

  @Test
  void shouldSkipUploadRowsWhenOptionalSpeciesGradeTargetIsMissing() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("CE"), eq("C"), eq("O"), eq(updateDate))).thenReturn(false);
    when(repository.existsExact(eq("CE"), eq("C"), eq("S"), eq(updateDate))).thenReturn(false);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(optionalCedarGradeWorkbook(), null, null);

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.attemptedRowCount()).isZero();
    assertThat(result.uploadedRowCount()).isZero();
    assertThat(result.errors()).isEmpty();
    verify(repository, never())
        .update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class));
  }

  @Test
  void shouldRejectNullLegacyReturnCode() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenReturn(null);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    var result = service.save(
        new RtmEmsLogAmvSaveRequestDto(
            "BA",
            "A",
            "O",
            "2026-01-01",
            "2026-01-01",
            new BigDecimal("10.01"),
            "update"));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Save returned code null");
  }

  @Test
  void shouldAcceptLegacyInsertSuccessCodeWhenSavedValueIsConfirmed() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.insert(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(LocalDate.of(2026, 1, 1)),
            eq(new BigDecimal("10.01"))))
        .thenReturn("-100");
    when(repository.find(
            eq("BA"),
            eq("O"),
            eq(LocalDate.of(2026, 1, 1)),
            eq(LocalDate.of(2026, 1, 1))))
        .thenReturn(List.of(row("BA", "A", "O", LocalDate.of(2026, 1, 1), "10.01")));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    var result =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA",
                "A",
                "O",
                "2026-01-01",
                null,
                new BigDecimal("10.01"),
                "create"));

    assertThat(result.status()).isEqualTo("accepted");
  }

  @Test
  void shouldRejectLegacySuccessWhenSavedValueCannotBeConfirmed() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.update(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(LocalDate.of(2026, 1, 1)),
            eq(LocalDate.of(2026, 1, 1)),
            eq(new BigDecimal("10.01"))))
        .thenReturn("0");
    when(repository.find(
            eq("BA"),
            eq("O"),
            eq(LocalDate.of(2026, 1, 1)),
            eq(LocalDate.of(2026, 1, 1))))
        .thenReturn(List.of(row("BA", "A", "O", LocalDate.of(2026, 1, 1), "0")));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    var result =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA",
                "A",
                "O",
                "2026-01-01",
                "2026-01-01",
                new BigDecimal("10.01"),
                "update"));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains(
            "Saved value could not be confirmed for species 'BA', grade 'A', growth 'O', effective date '2026-01-01'.");
  }

  @Test
  void shouldRejectUpdateDateBeforeRetrievalDate() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    var result =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA",
                "A",
                "O",
                "2026-07-01",
                "2026-06-01",
                new BigDecimal("10.01"),
                "update"));

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.errors()).contains("Update date must be on or after the retrieval date.");
  }

  private MultipartFile matrixWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "matrix.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook());
  }

  private MultipartFile singleBalsamWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "single-balsam.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.singleBalsamWorkbook());
  }

  private MultipartFile optionalCedarGradeWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "optional-cedar-grade.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.optionalCedarGradeWorkbook());
  }

  private static void stubAppliedFixtureValues(OracleRtmEmsLogAmvRepository repository) {
    when(repository.find(
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class)))
        .thenAnswer(
            invocation -> {
              String species = invocation.getArgument(0);
              String growthIndicator = invocation.getArgument(1);
              LocalDate effectiveDate = invocation.getArgument(2);
              return fixtureRows(species, growthIndicator, effectiveDate);
            });
    when(repository.existsExact(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class)))
        .thenAnswer(
            invocation -> {
              String species = invocation.getArgument(0);
              String grade = invocation.getArgument(1);
              String growthIndicator = invocation.getArgument(2);
              LocalDate effectiveDate = invocation.getArgument(3);
              return fixtureRows(species, growthIndicator, effectiveDate).stream()
                  .anyMatch(row -> grade.equalsIgnoreCase(row.grade()));
            });
  }

  private static List<RtmEmsLogAmvRowDto> fixtureRows(
      String species, String growthIndicator, LocalDate effectiveDate) {
    return switch (species) {
      case "BA" ->
          List.of(
              row(species, "A", growthIndicator, effectiveDate, "10.25"),
              row(species, "1", growthIndicator, effectiveDate, "1.25"));
      case "HE" -> List.of(row(species, "A", growthIndicator, effectiveDate, "20.50"));
      case "WH", "LO", "YE" -> List.of(row(species, "A", growthIndicator, effectiveDate, "30.75"));
      default -> List.of();
    };
  }

  private static RtmEmsLogAmvRowDto row(
      String species,
      String grade,
      String growthIndicator,
      LocalDate effectiveDate,
      String value) {
    return new RtmEmsLogAmvRowDto(
        species,
        grade,
        growthIndicator,
        effectiveDate.toString(),
        effectiveDate.toString(),
        null,
        new BigDecimal(value),
        "0");
  }
}

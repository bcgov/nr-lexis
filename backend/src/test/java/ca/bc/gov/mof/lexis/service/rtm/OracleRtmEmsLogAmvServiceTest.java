package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvLastSavedDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.repository.rtm.OracleRtmEmsLogAmvRepository;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(OutputCaptureExtension.class)
class OracleRtmEmsLogAmvServiceTest {

  private static final Clock JUNE_2026_CLOCK =
      Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);

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
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    service.find("HE", "O", "2026-06-01", "");

    verify(repository)
        .find("HE", "O", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 1));
  }

  @Test
  void shouldLoadEffectiveDateRowsWhenTableLookupOmitsLegacyProcedureFilters() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 6, 1);
    List<RtmEmsLogAmvRowDto> expectedRows =
        List.of(row("BA", "A", "O", effectiveDate, "10.25"));
    when(repository.findEffectiveDateRows(isNull(), isNull(), eq(effectiveDate)))
        .thenReturn(expectedRows);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    List<RtmEmsLogAmvRowDto> result = service.find("", "", "2026-06-01", "2026-06-01");

    assertThat(result).isEqualTo(expectedRows);
    verify(repository).findEffectiveDateRows(null, null, effectiveDate);
    verify(repository, never())
        .find(anyString(), anyString(), any(LocalDate.class), any(LocalDate.class));
  }

  @Test
  void shouldLoadLatestEffectiveDateRowsBeforeTargetDate() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate targetDate = LocalDate.of(2026, 8, 1);
    List<RtmEmsLogAmvRowDto> expectedRows =
        List.of(row("BA", "A", "O", LocalDate.of(2026, 7, 1), "10.25"));
    when(repository.findLatestEffectiveDateRowsBefore(targetDate)).thenReturn(expectedRows);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    List<RtmEmsLogAmvRowDto> result = service.findLatestBefore("2026-08-01");

    assertThat(result).isEqualTo(expectedRows);
    verify(repository).findLatestEffectiveDateRowsBefore(targetDate);
  }

  @Test
  void shouldReturnEmptyWithoutOracleLookupForInvalidLatestEffectiveDate() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    assertThat(service.findLatestBefore("not-a-date")).isEmpty();

    verifyNoInteractions(repository);
  }

  @Test
  void shouldLoadLastSavedAuditForTheNormalizedEffectiveMonth() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 9, 1);
    RtmEmsLogAmvLastSavedDto expected =
        new RtmEmsLogAmvLastSavedDto(
            "IDIR\\MGURJAOD", LocalDateTime.of(2026, 8, 11, 18, 21));
    when(repository.findLastSaved(effectiveDate)).thenReturn(expected);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    assertThat(service.findLastSaved("2026-09-19")).isEqualTo(expected);

    verify(repository).findLastSaved(effectiveDate);
  }

  @Test
  void shouldReturnEmptyAuditWithoutOracleLookupForInvalidEffectiveDate() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    assertThat(service.findLastSaved("not-a-date"))
        .isEqualTo(new RtmEmsLogAmvLastSavedDto(null, null));

    verifyNoInteractions(repository);
  }

  @Test
  void shouldPersistTheAuthenticatedActorAndReturnTheCommittedAudit() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 7, 1);
    RtmEmsLogAmvLastSavedDto expectedAudit =
        new RtmEmsLogAmvLastSavedDto(
            "IDIR\\MGURJAOD", LocalDateTime.of(2026, 6, 15, 12, 0));
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1, 1});
    when(repository.findLastSaved(effectiveDate)).thenReturn(expectedAudit);
    OracleRtmEmsLogAmvService service =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);

    RtmEmsLogAmvMutationResultDto result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "B",
                    "O",
                    "2026-07-01",
                    "2026-07-01",
                    new BigDecimal("10.25"),
                    "update")),
            "IDIR\\MGURJAOD");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.lastSaved()).isEqualTo(expectedAudit);
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 2
                        && targets.stream()
                            .allMatch(target -> "IDIR\\MGURJAOD".equals(target.actor()))));
    verify(repository).findLastSaved(effectiveDate);
  }

  @Test
  void shouldAtomicallyFanOutPineToBothGrowthTypes() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.upsertAtomically(any()))
        .thenReturn(new int[] {1, 1, 1, 1, 1, 1});
    OracleRtmEmsLogAmvService service =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);

    RtmEmsLogAmvMutationResultDto result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "PINE",
                    "B",
                    "O",
                    "2026-07-01",
                    "2026-07-01",
                    new BigDecimal("12.50"),
                    "update")));

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.rows()).hasSize(6);
    assertThat(result.rows())
        .extracting(RtmEmsLogAmvRowDto::species)
        .containsExactlyInAnyOrder("WH", "WH", "LO", "LO", "YE", "YE");
    assertThat(result.rows())
        .extracting(RtmEmsLogAmvRowDto::growthIndicator)
        .containsExactlyInAnyOrder("O", "S", "O", "S", "O", "S");
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 6
                        && targets.stream()
                            .allMatch(
                                target ->
                                    target.effectiveDate().equals(LocalDate.of(2026, 7, 1))
                                        && target.newValue().compareTo(new BigDecimal("12.50")) == 0)));
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
  void shouldAtomicallyFanOutSpruceToBothGrowthTypesWithoutPineExpansion() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1, 1});
    OracleRtmEmsLogAmvService service =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);

    RtmEmsLogAmvMutationResultDto result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "SP",
                    "B",
                    "O",
                    "2026-07-01",
                    "2026-07-01",
                    new BigDecimal("12.50"),
                    "update")));

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.message()).isEqualTo("Saved 1 table value.");
    assertThat(result.rows()).hasSize(2);
    assertThat(result.rows()).extracting(RtmEmsLogAmvRowDto::species).containsOnly("SP");
    assertThat(result.rows())
        .extracting(RtmEmsLogAmvRowDto::growthIndicator)
        .containsExactlyInAnyOrder("O", "S");
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 2
                        && targets.stream()
                            .allMatch(
                                target ->
                                    target.species().equals("SP")
                                        && target.grade().equals("B")
                                        && target
                                            .effectiveDate()
                                            .equals(LocalDate.of(2026, 7, 1))
                                        && target.newValue().compareTo(new BigDecimal("12.50"))
                                            == 0)));
  }

  @Test
  void shouldRejectHistoricMonthsInBatch() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);

    RtmEmsLogAmvMutationResultDto result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "Z",
                    "O",
                    "2000-02-01",
                    "2000-02-01",
                    new BigDecimal("12.50"),
                    "update")));

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.errors())
        .containsExactly(
            "Table value 1: Average market values can only be saved for the next month.");
    verifyNoInteractions(repository);
  }

  @Test
  void shouldRollBackTheFullBatchWhenAnyAtomicWriteIsNotApplied() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1, 0});
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    RtmEmsLogAmvService service = transactionalService(repository, transactionManager);

    RtmEmsLogAmvMutationResultDto result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "B",
                    "O",
                    "2026-07-01",
                    "2026-07-01",
                    new BigDecimal("12.50"),
                    "update")));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    assertThat(transactionManager.commits).isZero();
  }

  @Test
  void shouldRollBackTheFullBatchWhenOracleWriteFails() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.upsertAtomically(any()))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    RtmEmsLogAmvService service = transactionalService(repository, transactionManager);

    assertThatThrownBy(
            () ->
                service.saveBatch(
                    List.of(
                        new RtmEmsLogAmvSaveRequestDto(
                            "BA",
                            "B",
                            "O",
                            "2026-07-01",
                            "2026-07-01",
                            new BigDecimal("12.50"),
                            "update"))))
        .isInstanceOf(DataAccessResourceFailureException.class);

    assertThat(transactionManager.rollbacks).isEqualTo(1);
    assertThat(transactionManager.commits).isZero();
  }

  @Test
  void shouldNormalizeDayLevelLatestEffectiveDateBeforeOracleLookup() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);
    LocalDate normalizedDate = LocalDate.of(2026, 7, 1);
    when(repository.findLatestEffectiveDateRowsBefore(normalizedDate)).thenReturn(List.of());

    assertThat(service.findLatestBefore("2026-07-10")).isEmpty();

    verify(repository).findLatestEffectiveDateRowsBefore(normalizedDate);
  }

  @Test
  void shouldPropagateAuthoritativeEffectiveDateReadFailure() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 6, 1);
    when(repository.findEffectiveDateRows(isNull(), isNull(), eq(effectiveDate)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    assertThatThrownBy(() -> service.find("", "", "2026-06-01", "2026-06-01"))
        .isInstanceOf(DataAccessResourceFailureException.class);

    verify(repository, never())
        .find(anyString(), anyString(), any(LocalDate.class), any(LocalDate.class));
  }

  @Test
  void shouldUploadMatrixWorkbookAtomically() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    stubAppliedFixtureValues(repository);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.warnings()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(6);
    assertThat(result.uploadedRowCount()).isEqualTo(6);
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 6
                        && targets.stream()
                            .allMatch(
                                target ->
                                    target.effectiveDate().equals(LocalDate.of(2026, 6, 1)))));
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
  void shouldUploadPhysicalPineColumnsWithoutSpeciesOrGrowthFanout() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    stubAppliedFixtureValues(repository);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.warnings()).isEmpty();
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.stream().anyMatch(target -> target.species().equals("WH"))
                        && targets.stream().anyMatch(target -> target.species().equals("LO"))
                        && targets.stream().anyMatch(target -> target.species().equals("YE"))
                        && targets.stream()
                            .noneMatch(
                                target ->
                                    List.of("PL", "PW", "PY").contains(target.species()))
                        && targets.stream()
                            .allMatch(target -> target.growthIndicator().equals("O"))));
  }

  @Test
  void shouldApplyTheScreenMonthAndExpandTheGroupedPineColumn() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    LocalDate retrievalMonth = LocalDate.of(2026, 6, 1);
    LocalDate effectiveMonth = LocalDate.of(2026, 7, 1);
    stubAppliedFixtureValues(repository);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, clock);

    var preview = service.previewUpload(groupedPineWorkbook(), "2026-07-01");
    RtmEmsLogAmvUploadResultDto upload =
        service.upload(groupedPineWorkbook(), "2026-07-01");
    RtmEmsLogAmvUploadResultDto reupload =
        service.upload(groupedPineWorkbook(), "2026-07-01");

    assertThat(preview.status()).isEqualTo("accepted");
    assertThat(preview.retrievalDate()).isEqualTo("2026-06-01");
    assertThat(preview.updateDate()).isEqualTo("2026-07-01");
    assertThat(preview.rows())
        .extracting(row -> List.of(row.species(), row.growthIndicator()))
        .containsExactly(List.of("PINE", "O"));
    assertThat(upload.status()).isEqualTo("accepted");
    assertThat(upload.attemptedRowCount()).isEqualTo(6);
    assertThat(upload.uploadedRowCount()).isEqualTo(6);
    assertThat(reupload.status()).isEqualTo("accepted");
    assertThat(reupload.uploadedRowCount()).isEqualTo(6);
    verify(repository, times(2))
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 6
                        && targets.stream()
                            .map(
                                target ->
                                    List.of(target.species(), target.growthIndicator()))
                            .toList()
                            .equals(
                                List.of(
                                    List.of("WH", "O"),
                                    List.of("WH", "S"),
                                    List.of("LO", "O"),
                                    List.of("LO", "S"),
                                    List.of("YE", "O"),
                                    List.of("YE", "S")))
                        && targets.stream()
                            .allMatch(
                                target ->
                                    target.effectiveDate().equals(effectiveMonth))));
    verify(repository, times(12))
        .existsExact(anyString(), eq("B"), anyString(), eq(retrievalMonth));
  }

  @Test
  void shouldIgnoreRetiredGradeAInTheScreenWorkbook() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.findEffectiveDateRows(null, null, LocalDate.of(2026, 6, 1)))
        .thenReturn(List.of());
    when(repository.existsExact(anyString(), anyString(), anyString(), any(LocalDate.class)))
        .thenReturn(true);
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1, 1});
    OracleRtmEmsLogAmvService service =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);
    MultipartFile workbook = screenGradeAAndBWorkbook();

    var preview = service.previewUpload(workbook, "2026-07-01");
    var upload = service.upload(workbook, "2026-07-01");

    assertThat(preview.status()).isEqualTo("accepted");
    assertThat(preview.rows()).extracting(RtmEmsLogAmvRowDto::grade).containsOnly("B");
    assertThat(upload.status()).isEqualTo("accepted");
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 2
                        && targets.stream().allMatch(target -> target.grade().equals("B"))));
  }

  @Test
  void shouldRejectRetiredGradeAFromTheModernBatch() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);

    var result =
        service.saveBatch(
            List.of(
                new RtmEmsLogAmvSaveRequestDto(
                    "BA",
                    "A",
                    "O",
                    "2026-07-01",
                    "2026-07-01",
                    new BigDecimal("10.25"),
                    "update")));

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.errors())
        .contains("Table value 1: Grade is not supported by the modern RTM AMV grid.");
    verifyNoInteractions(repository);
  }

  @Test
  void shouldCompareTheScreenUploadAgainstTheExactPreviousMonth() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    LocalDate effectiveMonth = LocalDate.of(2026, 7, 1);
    LocalDate comparisonMonth = LocalDate.of(2026, 6, 1);
    when(repository.findEffectiveDateRows(null, null, comparisonMonth))
        .thenReturn(
            List.of(
                new RtmEmsLogAmvRowDto(
                    "HE",
                    "H",
                    "O",
                    "2026-06-01",
                    "2026-06-01",
                    new BigDecimal("81.40"),
                    new BigDecimal("81.40"),
                    "0")));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, clock);

    var preview = service.previewUpload(screenSingleBalsamWorkbook(), "2026-07-01");

    assertThat(preview.status()).isEqualTo("accepted");
    assertThat(preview.retrievalDate()).isEqualTo("2026-06-01");
    assertThat(preview.updateDate()).isEqualTo("2026-07-01");
    assertThat(preview.rows()).hasSize(2);
    assertThat(preview.rows().get(0).species()).isEqualTo("BA");
    assertThat(preview.rows().get(0).grade()).isEqualTo("B");
    assertThat(preview.rows().get(0).growthIndicator()).isEqualTo("O");
    assertThat(preview.rows().get(0).currentValue()).isNull();
    assertThat(preview.rows().get(0).newValue()).isEqualByComparingTo("10.25");
    assertThat(preview.rows().get(1).species()).isEqualTo("HE");
    assertThat(preview.rows().get(1).grade()).isEqualTo("H");
    assertThat(preview.rows().get(1).growthIndicator()).isEqualTo("O");
    assertThat(preview.rows().get(1).currentValue()).isEqualByComparingTo("81.40");
    assertThat(preview.rows().get(1).newValue()).isNull();
    verify(repository).findEffectiveDateRows(null, null, comparisonMonth);
    verify(repository, never()).findLatestEffectiveDateRowsBefore(any());
  }

  @Test
  void shouldRejectEveryScreenMonthExceptTheImmediatelyUpcomingMonth() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, clock);

    var currentMonth = service.previewUpload(groupedPineWorkbook(), "2026-06-01");
    var previousMonth = service.upload(groupedPineWorkbook(), "2026-05-01");
    var laterFutureMonth = service.previewUpload(groupedPineWorkbook(), "2026-08-01");
    var midMonth = service.upload(groupedPineWorkbook(), "2026-07-15");
    var missingMonth = service.previewUpload(groupedPineWorkbook(), null);

    assertThat(currentMonth.status()).isEqualTo("validation_failed");
    assertThat(previousMonth.status()).isEqualTo("validation_failed");
    assertThat(laterFutureMonth.status()).isEqualTo("validation_failed");
    assertThat(currentMonth.errors())
        .containsExactly("Average market values can only be uploaded for the next month.");
    assertThat(previousMonth.errors()).containsExactlyElementsOf(currentMonth.errors());
    assertThat(laterFutureMonth.errors()).containsExactlyElementsOf(currentMonth.errors());
    assertThat(midMonth.errors()).containsExactly("Select a valid effective month.");
    assertThat(missingMonth.errors()).containsExactly("Select a valid effective month.");
    verifyNoInteractions(repository);
  }

  @Test
  void shouldAcceptPreviewWhenTargetGrowthRowsExist() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(updateDate))).thenReturn(true);
    when(repository.existsExact(eq("BA"), eq("A"), eq("S"), eq(updateDate))).thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var result = service.previewUpload(singleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.rowCount()).isEqualTo(1);
  }

  @Test
  void shouldDescribeWorkbookValueErrorsBySpeciesAndGradeOnce() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);

    var result = service.previewUpload(precisionErrorsWorkbook(), "2026-07-01");

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.message()).isEqualTo("This file couldn't be used.");
    assertThat(result.errors())
        .containsExactly(
            "Hemlock grade J: more than two decimal places",
            "Cedar grade J: more than two decimal places");
  }

  @Test
  void shouldPropagatePreviewTargetVerificationFailure() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.existsExact(anyString(), anyString(), anyString(), any(LocalDate.class)))
        .thenThrow(new DataAccessResourceFailureException("target verification unavailable"));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    MultipartFile workbook = singleBalsamWorkbook();
    assertThatThrownBy(() -> service.previewUpload(workbook))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void shouldRejectPreviewWhenNoWorkbookRowsHaveExistingTargets() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("CE"), eq("C"), eq("O"), eq(updateDate))).thenReturn(false);
    when(repository.existsExact(eq("CE"), eq("C"), eq("S"), eq(updateDate))).thenReturn(false);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var result = service.previewUpload(optionalCedarGradeWorkbook());

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.errors())
        .contains("No eligible existing AMV rows were found in the uploaded file.");
    assertThat(result.rowCount()).isZero();
    assertThat(result.rows()).isEmpty();
    assertThat(result.warnings()).anyMatch(warning -> warning.contains("exact existing AMV key"));
  }

  @Test
  void shouldPreviewOnlyExistingTargetGrowthRows() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(updateDate))).thenReturn(true);
    when(repository.existsExact(eq("BA"), eq("A"), eq("S"), eq(updateDate))).thenReturn(false);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var result = service.previewUpload(singleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.rowCount()).isEqualTo(1);
    assertThat(result.rows()).extracting(RtmEmsLogAmvRowDto::growthIndicator).containsExactly("O");
  }

  @Test
  void shouldPreviewWorkbookAgainstItsDeclaredEffectiveMonth() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(effectiveDate))).thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var result = service.previewUpload(futureSingleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.retrievalDate()).isEqualTo("2026-08-01");
    assertThat(result.updateDate()).isEqualTo("2026-08-01");
    assertThat(result.rowCount()).isEqualTo(1);
    assertThat(result.rows()).extracting(RtmEmsLogAmvRowDto::growthIndicator).containsExactly("O");
    verify(repository).existsExact("BA", "A", "O", effectiveDate);
  }

  @Test
  void shouldUploadOnlyExistingTargetGrowthRows() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(updateDate))).thenReturn(true);
    when(repository.existsExact(eq("BA"), eq("A"), eq("S"), eq(updateDate))).thenReturn(false);
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1});
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(singleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(1);
    assertThat(result.uploadedRowCount()).isEqualTo(1);
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 1
                        && targets.getFirst().species().equals("BA")
                        && targets.getFirst().grade().equals("A")
                        && targets.getFirst().growthIndicator().equals("O")
                        && targets.getFirst().effectiveDate().equals(updateDate)
                        && targets.getFirst().newValue().compareTo(new BigDecimal("10.25")) == 0));
    verify(repository, never())
        .insert(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(BigDecimal.class));
  }

  @Test
  void shouldPropagateUploadTargetVerificationFailure() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.existsExact(anyString(), anyString(), anyString(), any(LocalDate.class)))
        .thenThrow(new DataAccessResourceFailureException("target verification unavailable"));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    MultipartFile workbook = singleBalsamWorkbook();
    assertThatThrownBy(() -> service.upload(workbook))
        .isInstanceOf(DataAccessResourceFailureException.class);
    verify(repository, never()).upsertAtomically(any());
  }

  @Test
  void shouldUploadWorkbookAtItsDeclaredEffectiveMonth() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    BigDecimal newValue = new BigDecimal("10.25");
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(effectiveDate))).thenReturn(true);
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1});
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(futureSingleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(1);
    assertThat(result.uploadedRowCount()).isEqualTo(1);
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 1
                        && targets.getFirst().effectiveDate().equals(effectiveDate)
                        && targets.getFirst().newValue().compareTo(newValue) == 0));
  }

  @Test
  void shouldUploadWorkbookOnlyForItsDeclaredGrowth() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    BigDecimal newValue = new BigDecimal("10.25");
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(effectiveDate))).thenReturn(true);
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1});
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(futureSingleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(1);
    assertThat(result.uploadedRowCount()).isEqualTo(1);
    verify(repository)
        .upsertAtomically(
            argThat(
                targets ->
                    targets.size() == 1
                        && targets.getFirst().species().equals("BA")
                        && targets.getFirst().growthIndicator().equals("O")
                        && targets.getFirst().effectiveDate().equals(effectiveDate)
                        && targets.getFirst().newValue().compareTo(newValue) == 0));
  }

  @Test
  void shouldRejectUploadWhenNoWorkbookRowsHaveExistingTargets() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate updateDate = LocalDate.of(2026, 6, 1);
    when(repository.existsExact(eq("CE"), eq("C"), eq("O"), eq(updateDate))).thenReturn(false);
    when(repository.existsExact(eq("CE"), eq("C"), eq("S"), eq(updateDate))).thenReturn(false);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(optionalCedarGradeWorkbook());

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.attemptedRowCount()).isZero();
    assertThat(result.uploadedRowCount()).isZero();
    assertThat(result.errors())
        .contains("No eligible existing AMV rows were found in the uploaded file.");
    assertThat(result.warnings()).anyMatch(warning -> warning.contains("exact existing AMV key"));
    verify(repository, never()).upsertAtomically(any());
  }

  @Test
  void shouldRejectMidMonthWorkbookBeforeAnyOracleLookupOrMutation() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var preview = service.previewUpload(midMonthSingleBalsamWorkbook());
    RtmEmsLogAmvUploadResultDto upload = service.upload(midMonthSingleBalsamWorkbook());

    assertThat(preview.status()).isEqualTo("validation_failed");
    assertThat(preview.retrievalDate()).isEqualTo("2026-06-20");
    assertThat(preview.updateDate()).isEqualTo("2026-06-20");
    assertThat(preview.errors())
        .contains(
            "Retrieval date must be the first day of a month.",
            "Update date must be the first day of a month.");
    assertThat(upload.status()).isEqualTo("validation_failed");
    assertThat(upload.uploadedRowCount()).isZero();
    assertThat(upload.errors())
        .contains(
            "Retrieval date must be the first day of a month.",
            "Update date must be the first day of a month.");
    verifyNoInteractions(repository);
  }

  @Test
  void shouldRollBackTheFullUploadWhenAnyAtomicWriteIsNotApplied() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    stubAppliedFixtureValues(repository);
    when(repository.upsertAtomically(any())).thenReturn(new int[] {1, 1, 1, 1, 1, 0});
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    RtmEmsLogAmvService service = transactionalService(repository, transactionManager);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message()).isEqualTo("Upload did not complete; no values were saved.");
    assertThat(result.attemptedRowCount()).isEqualTo(6);
    assertThat(result.uploadedRowCount()).isZero();
    assertThat(result.rows()).isEmpty();
    assertThat(result.errors()).containsExactly("The full AMV workbook submission was not applied.");
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    assertThat(transactionManager.commits).isZero();
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
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

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
    assertThat(result.errors()).containsExactly("Oracle did not accept the save.");
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
    when(repository.hasExactValue(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(LocalDate.of(2026, 1, 1)),
            eq(new BigDecimal("10.01"))))
        .thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

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
  void shouldNormalizeMonthOnlySaveDatesToFirstOfMonth() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 7, 1);
    BigDecimal newValue = new BigDecimal("10.25");
    when(repository.insert("BA", "A", "O", effectiveDate, newValue)).thenReturn("-100");
    when(repository.hasExactValue("BA", "A", "O", effectiveDate, newValue)).thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var result =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "202607", null, newValue, "create"));

    assertThat(result.status()).isEqualTo("accepted");
    verify(repository).insert("BA", "A", "O", effectiveDate, newValue);
  }

  @Test
  void shouldRejectValuesOutsideTheAmvColumnContract() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var blankResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-01", "2026-07-01", null, "update"));
    var precisionResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA",
                "A",
                "O",
                "2026-07-01",
                "2026-07-01",
                new BigDecimal("10.123"),
                "update"));
    var rangeResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA",
                "A",
                "O",
                "2026-07-01",
                "2026-07-01",
                new BigDecimal("10000.00"),
                "update"));

    assertThat(blankResult.status()).isEqualTo("validation_failed");
    assertThat(blankResult.errors()).contains("New value is required.");
    assertThat(precisionResult.status()).isEqualTo("validation_failed");
    assertThat(precisionResult.errors()).contains("New value must have no more than 2 decimal places.");
    assertThat(rangeResult.status()).isEqualTo("validation_failed");
    assertThat(rangeResult.errors()).contains("New value must not exceed 9999.99.");
    verifyNoInteractions(repository);
  }

  @Test
  void shouldRejectInvalidPhysicalDimensionsWithoutCallingOracle() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var invalidSpecies =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BAX", "A", "O", "2026-07-01", null, new BigDecimal("10.25"), "create"));
    var invalidGrade =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "N", "O", "2026-07-01", null, new BigDecimal("10.25"), "create"));
    var invalidGrowth =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "X", "2026-07-01", null, new BigDecimal("10.25"), "create"));

    assertThat(invalidSpecies.status()).isEqualTo("validation_failed");
    assertThat(invalidSpecies.errors())
        .contains("Species must be exactly two alphanumeric characters.");
    assertThat(invalidGrade.status()).isEqualTo("validation_failed");
    assertThat(invalidGrade.errors()).contains("Grade is not supported by the RTM AMV contract.");
    assertThat(invalidGrowth.status()).isEqualTo("validation_failed");
    assertThat(invalidGrowth.errors()).contains("Growth indicator must be O or S.");
    verifyNoInteractions(repository);
  }

  @Test
  void shouldEnforceExpandedGradeStartAtApril2006Boundary() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate boundaryDate = LocalDate.of(2006, 4, 1);
    BigDecimal value = new BigDecimal("10.25");
    when(repository.insert("BA", "W", "O", boundaryDate, value)).thenReturn("-100");
    when(repository.hasExactValue("BA", "W", "O", boundaryDate, value)).thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var beforeBoundary =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "W", "O", "2006-03-01", null, value, "create"));
    var atBoundary =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "W", "O", "2006-04-01", null, value, "create"));

    assertThat(beforeBoundary.status()).isEqualTo("validation_failed");
    assertThat(beforeBoundary.errors()).contains("Grade W is not available before April 2006.");
    assertThat(atBoundary.status()).isEqualTo("accepted");
    verify(repository).insert("BA", "W", "O", boundaryDate, value);
    verify(repository).hasExactValue("BA", "W", "O", boundaryDate, value);
  }

  @Test
  void shouldNormalizeDayLevelSaveDatesBeforeCallingOracle() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);
    BigDecimal value = new BigDecimal("10.25");
    LocalDate retrievalDate = LocalDate.of(2026, 7, 1);
    LocalDate updateDate = LocalDate.of(2026, 8, 1);
    when(repository.insert("BA", "A", "O", retrievalDate, value)).thenReturn("0");
    when(repository.update("BA", "A", "O", retrievalDate, updateDate, value)).thenReturn("0");
    when(repository.hasExactValue("BA", "A", "O", retrievalDate, value)).thenReturn(true);
    when(repository.hasExactValue("BA", "A", "O", updateDate, value)).thenReturn(true);

    var retrievalResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-10", null, value, "create"));
    var updateResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA",
                "A",
                "O",
                "2026-07-01",
                "2026-08-10",
                value,
                "update"));

    assertThat(retrievalResult.status()).isEqualTo("accepted");
    assertThat(updateResult.status()).isEqualTo("accepted");
    verify(repository).insert("BA", "A", "O", retrievalDate, value);
    verify(repository).update("BA", "A", "O", retrievalDate, updateDate, value);
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
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

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
  void shouldRollBackWhenOracleRejectsTheSave() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.update(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(LocalDate.of(2026, 1, 1)),
            eq(LocalDate.of(2026, 1, 1)),
            eq(new BigDecimal("10.01"))))
        .thenReturn("ERROR");
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    RtmEmsLogAmvService service = transactionalService(repository, transactionManager);

    RtmEmsLogAmvMutationResultDto result =
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
    assertThat(result.errors()).containsExactly("Oracle did not accept the save.");
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    assertThat(transactionManager.commits).isZero();
  }

  @Test
  void shouldRollBackWhenTheSavedValueCannotBeConfirmed() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 1, 1);
    BigDecimal newValue = new BigDecimal("10.01");
    when(repository.update(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(effectiveDate),
            eq(effectiveDate),
            eq(newValue)))
        .thenReturn("0");
    when(repository.hasExactValue(eq("BA"), eq("A"), eq("O"), eq(effectiveDate), eq(newValue)))
        .thenReturn(false);
    when(repository.find(eq("BA"), eq("O"), eq(effectiveDate), eq(effectiveDate)))
        .thenReturn(List.of(row("BA", "A", "O", effectiveDate, "0")));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    RtmEmsLogAmvService service = transactionalService(repository, transactionManager);

    RtmEmsLogAmvMutationResultDto result =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-01-01", "2026-01-01", newValue, "update"));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    assertThat(transactionManager.commits).isZero();
  }

  @Test
  void shouldPropagateLegacySuccessVerificationFailureWithSafeLogging(CapturedOutput output) {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 1, 1);
    BigDecimal newValue = new BigDecimal("10.01");
    when(repository.update(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(effectiveDate),
            eq(effectiveDate),
            eq(newValue)))
        .thenReturn("0");
    when(repository.hasExactValue(eq("BA"), eq("A"), eq("O"), eq(effectiveDate), eq(newValue)))
        .thenThrow(
            new DataAccessResourceFailureException(
                "private-recipient@example.com\r\nforged=true\u2028unicode=true"));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvSaveRequestDto request =
        new RtmEmsLogAmvSaveRequestDto(
            "BA", "A", "O", "2026-01-01", "2026-01-01", newValue, "update");
    assertThatThrownBy(() -> service.save(request))
        .isInstanceOf(DataAccessResourceFailureException.class);
    verify(repository, never())
        .find(anyString(), anyString(), any(LocalDate.class), any(LocalDate.class));
    assertThat(output)
        .contains(
            "event=lexis_rtm_amv operation=save outcome=database_unavailable "
                + "failureType=DataAccessResourceFailureException")
        .doesNotContain("private-recipient@example.com")
        .doesNotContain("forged=true", "unicode=true", "\u2028");
  }

  @Test
  void shouldConfirmSaveWithExactTableValueWhenLegacySelectOmitsRow() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 7, 1);
    BigDecimal newValue = new BigDecimal("0.12");
    when(repository.update(
            eq("HE"),
            eq("B"),
            eq("O"),
            eq(effectiveDate),
            eq(effectiveDate),
            eq(newValue)))
        .thenReturn("0");
    when(repository.hasExactValue(eq("HE"), eq("B"), eq("O"), eq(effectiveDate), eq(newValue)))
        .thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var result =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "HE", "B", "O", "2026-07-01", "2026-07-01", newValue, "update"));

    assertThat(result.status()).isEqualTo("accepted");
    verify(repository, never())
        .find(anyString(), anyString(), any(LocalDate.class), any(LocalDate.class));
  }

  @Test
  void shouldRejectUpdateDateBeforeRetrievalDate() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

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

  private MultipartFile groupedPineWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "grouped-pine.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.screenPineWorkbook());
  }

  private MultipartFile screenSingleBalsamWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "screen-single-balsam.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.screenSingleBalsamWorkbook());
  }

  private MultipartFile screenGradeAAndBWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "screen-grade-a-and-b.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.screenGradeAAndBWorkbook());
  }

  private MultipartFile singleBalsamWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "single-balsam.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.singleBalsamWorkbook());
  }

  private MultipartFile futureSingleBalsamWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "future-single-balsam.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.futureSingleBalsamWorkbook());
  }

  private MultipartFile midMonthSingleBalsamWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "mid-month-single-balsam.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.midMonthSingleBalsamWorkbook());
  }

  private MultipartFile optionalCedarGradeWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "optional-cedar-grade.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.optionalCedarGradeWorkbook());
  }

  private MultipartFile precisionErrorsWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "precision-errors.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.precisionErrorsWorkbook());
  }

  private static void stubAppliedFixtureValues(OracleRtmEmsLogAmvRepository repository) {
    when(repository.upsertAtomically(any()))
        .thenAnswer(
            invocation -> {
              List<?> targets = invocation.getArgument(0);
              if (targets == null) {
                return new int[0];
              }
              int[] updateCounts = new int[targets.size()];
              for (int index = 0; index < updateCounts.length; index++) {
                updateCounts[index] = 1;
              }
              return updateCounts;
            });
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
    when(repository.hasExactValue(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenAnswer(
            invocation -> {
              String species = invocation.getArgument(0);
              String grade = invocation.getArgument(1);
              String growthIndicator = invocation.getArgument(2);
              LocalDate effectiveDate = invocation.getArgument(3);
              BigDecimal expectedValue = invocation.getArgument(4);
              return fixtureRows(species, growthIndicator, effectiveDate).stream()
                  .anyMatch(
                      row ->
                          grade.equalsIgnoreCase(row.grade())
                              && row.newValue() != null
                              && row.newValue().compareTo(expectedValue) == 0);
            });
  }

  private static List<RtmEmsLogAmvRowDto> fixtureRows(
      String species, String growthIndicator, LocalDate effectiveDate) {
    return switch (species) {
      case "BA" ->
          List.of(
              row(species, "A", growthIndicator, effectiveDate, "10.25"),
              row(species, "B", growthIndicator, effectiveDate, "10.25"),
              row(species, "1", growthIndicator, effectiveDate, "1.25"));
      case "HE" ->
          List.of(
              row(species, "A", growthIndicator, effectiveDate, "20.50"),
              row(species, "B", growthIndicator, effectiveDate, "20.50"));
      case "WH" ->
          List.of(
              row(species, "A", growthIndicator, effectiveDate, "30.75"),
              row(species, "B", growthIndicator, effectiveDate, "30.75"));
      case "LO" ->
          List.of(
              row(species, "A", growthIndicator, effectiveDate, "31.75"),
              row(species, "B", growthIndicator, effectiveDate, "31.75"));
      case "YE" ->
          List.of(
              row(species, "A", growthIndicator, effectiveDate, "32.75"),
              row(species, "B", growthIndicator, effectiveDate, "32.75"));
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

  private RtmEmsLogAmvService transactionalService(
      OracleRtmEmsLogAmvRepository repository,
      RecordingTransactionManager transactionManager) {
    OracleRtmEmsLogAmvService target =
        new OracleRtmEmsLogAmvService(repository, JUNE_2026_CLOCK);
    TransactionInterceptor interceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(target);
    proxyFactory.addAdvice(interceptor);
    return (RtmEmsLogAmvService) proxyFactory.getProxy();
  }

  private static final class RecordingTransactionManager
      extends AbstractPlatformTransactionManager {
    private int commits;
    private int rollbacks;

    @Override
    protected Object doGetTransaction() {
      return new Object();
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
      // No resource is needed for this transaction-boundary test.
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
      commits++;
    }

    @Override
    protected void doRollback(DefaultTransactionStatus status) {
      rollbacks++;
    }
  }
}

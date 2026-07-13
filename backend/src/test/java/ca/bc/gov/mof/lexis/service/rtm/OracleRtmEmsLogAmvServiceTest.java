package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.configuration.OracleLegacyDynamicFetchExecutorConfiguration;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.repository.rtm.OracleRtmEmsLogAmvRepository;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.mockito.ArgumentCaptor;
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

  @Test
  void shouldInstantiateWithRepositoryConstructorInOracleProfile() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles("oracle");
      context.registerBean(
          OracleRtmEmsLogAmvRepository.class,
          () -> mock(OracleRtmEmsLogAmvRepository.class));
      context.registerBean(VirusScanService.class, () -> VirusScanService.NO_OP);
      context.register(
          OracleLegacyDynamicFetchExecutorConfiguration.class,
          OracleRtmEmsLogAmvService.class);

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
  void shouldRejectDayLevelLatestEffectiveDateWithoutOracleLookup() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    assertThat(service.findLatestBefore("2026-07-10")).isEmpty();

    verifyNoInteractions(repository);
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
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.warnings()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(6);
    assertThat(result.uploadedRowCount()).isEqualTo(6);
    verify(repository, times(6))
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
  void shouldUploadPhysicalPineColumnsWithoutSpeciesOrGrowthFanout() throws IOException {
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
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook());

    ArgumentCaptor<String> speciesCaptor = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<String> growthCaptor = ArgumentCaptor.forClass(String.class);
    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.warnings()).isEmpty();
    verify(repository, times(6))
        .update(
            speciesCaptor.capture(),
            anyString(),
            growthCaptor.capture(),
            eq(LocalDate.of(2026, 6, 1)),
            eq(LocalDate.of(2026, 6, 1)),
            any(BigDecimal.class));
    assertThat(speciesCaptor.getAllValues())
        .contains("WH", "LO", "YE")
        .doesNotContain("PL", "PW", "PY");
    assertThat(growthCaptor.getAllValues()).containsOnly("O");
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
    when(repository.update(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(updateDate),
            eq(updateDate),
            eq(new BigDecimal("10.25"))))
        .thenReturn("0");
    when(repository.hasExactValue(
            eq("BA"), eq("A"), eq("O"), eq(updateDate), eq(new BigDecimal("10.25"))))
        .thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(singleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(1);
    assertThat(result.uploadedRowCount()).isEqualTo(1);
    verify(repository)
        .update(
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(updateDate),
            eq(updateDate),
            eq(new BigDecimal("10.25")));
    verify(repository, never())
        .update(
            eq("BA"),
            eq("A"),
            eq("S"),
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
  void shouldPropagateUploadTargetVerificationFailure() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.existsExact(anyString(), anyString(), anyString(), any(LocalDate.class)))
        .thenThrow(new DataAccessResourceFailureException("target verification unavailable"));
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    MultipartFile workbook = singleBalsamWorkbook();
    assertThatThrownBy(() -> service.upload(workbook))
        .isInstanceOf(DataAccessResourceFailureException.class);
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
  void shouldUploadWorkbookAtItsDeclaredEffectiveMonth() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    BigDecimal newValue = new BigDecimal("10.25");
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(effectiveDate))).thenReturn(true);
    when(repository.update(eq("BA"), eq("A"), eq("O"), eq(effectiveDate), eq(effectiveDate), eq(newValue)))
        .thenReturn("0");
    when(repository.hasExactValue(eq("BA"), eq("A"), eq("O"), eq(effectiveDate), eq(newValue)))
        .thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(futureSingleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(1);
    assertThat(result.uploadedRowCount()).isEqualTo(1);
    verify(repository)
        .update(eq("BA"), eq("A"), eq("O"), eq(effectiveDate), eq(effectiveDate), eq(newValue));
    verify(repository, never())
        .update(
            eq("BA"),
            eq("A"),
            eq("S"),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class));
  }

  @Test
  void shouldUploadWorkbookOnlyForItsDeclaredGrowth() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    BigDecimal newValue = new BigDecimal("10.25");
    when(repository.existsExact(eq("BA"), eq("A"), eq("O"), eq(effectiveDate))).thenReturn(true);
    when(repository.update(anyString(), anyString(), anyString(), eq(effectiveDate), eq(effectiveDate), eq(newValue)))
        .thenReturn("0");
    when(repository.hasExactValue(anyString(), anyString(), anyString(), eq(effectiveDate), eq(newValue)))
        .thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(futureSingleBalsamWorkbook());

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.errors()).isEmpty();
    assertThat(result.attemptedRowCount()).isEqualTo(1);
    assertThat(result.uploadedRowCount()).isEqualTo(1);
    verify(repository)
        .update(eq("BA"), eq("A"), eq("O"), eq(effectiveDate), eq(effectiveDate), eq(newValue));
    verify(repository, never())
        .update(eq("BA"), eq("A"), eq("S"), eq(effectiveDate), eq(effectiveDate), eq(newValue));
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
  void shouldReportPartialUploadWithoutDiscardingConfirmedRows() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.existsExact(anyString(), anyString(), anyString(), any(LocalDate.class)))
        .thenReturn(true);
    when(repository.update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenReturn("0")
        .thenThrow(new DataAccessResourceFailureException("outcome unavailable"));
    when(repository.hasExactValue(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenReturn(true);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook());

    assertThat(result.status()).isEqualTo("validation_failed");
    assertThat(result.message())
        .isEqualTo("Upload partially completed; review the saved and failed rows.");
    assertThat(result.attemptedRowCount()).isEqualTo(6);
    assertThat(result.uploadedRowCount()).isOne();
    assertThat(result.rows()).hasSize(1);
    assertThat(result.rows().getFirst())
        .extracting(
            RtmEmsLogAmvRowDto::species,
            RtmEmsLogAmvRowDto::grade,
            RtmEmsLogAmvRowDto::newValue)
        .containsExactly("BA", "A", new BigDecimal("10.25"));
    assertThat(result.errors())
        .anyMatch(error -> error.contains("outcome could not be confirmed"));
    assertThat(String.join(" ", result.errors()).toLowerCase())
        .doesNotContain("no rows were saved");
    verify(repository, times(2))
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
  void shouldRejectDayLevelSaveDatesWithoutCallingOracle() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository);

    var retrievalResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA", "A", "O", "2026-07-10", null, new BigDecimal("10.25"), "create"));
    var updateResult =
        service.save(
            new RtmEmsLogAmvSaveRequestDto(
                "BA",
                "A",
                "O",
                "2026-07-01",
                "2026-08-10",
                new BigDecimal("10.25"),
                "update"));

    assertThat(retrievalResult.status()).isEqualTo("validation_failed");
    assertThat(retrievalResult.errors()).anyMatch(error -> error.startsWith("Retrieval date"));
    assertThat(updateResult.status()).isEqualTo("validation_failed");
    assertThat(updateResult.errors()).anyMatch(error -> error.startsWith("Update date"));
    verifyNoInteractions(repository);
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
              row(species, "1", growthIndicator, effectiveDate, "1.25"));
      case "HE" -> List.of(row(species, "A", growthIndicator, effectiveDate, "20.50"));
      case "WH" -> List.of(row(species, "A", growthIndicator, effectiveDate, "30.75"));
      case "LO" -> List.of(row(species, "A", growthIndicator, effectiveDate, "31.75"));
      case "YE" -> List.of(row(species, "A", growthIndicator, effectiveDate, "32.75"));
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
        new OracleRtmEmsLogAmvService(repository);
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

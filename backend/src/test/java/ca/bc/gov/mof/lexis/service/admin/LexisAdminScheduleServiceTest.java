package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

@ExtendWith(MockitoExtension.class)
class LexisAdminScheduleServiceTest {

  private static final Clock FIXED_CLOCK =
      Clock.fixed(Instant.parse("2026-06-25T12:00:00Z"), ZoneId.of("America/Vancouver"));

  @Mock private LexisReportScheduleRepository repository;

  private LexisAdminScheduleService newService() {
    return new LexisAdminScheduleService(repository, FIXED_CLOCK, immediateTransactions());
  }

  private static TransactionOperations immediateTransactions() {
    return new TransactionOperations() {
      @Override
      public <T> T execute(TransactionCallback<T> action) {
        return action.doInTransaction(new SimpleTransactionStatus());
      }
    };
  }

  @Test
  void upcomingSchedulesShouldDelegateToRepository() {
    LexisAdminScheduleService service = newService();
    ExportScheduleRowDto row =
        new ExportScheduleRowDto(1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null);
    when(repository.findUpcomingExportSchedules()).thenReturn(List.of(row));

    assertThat(service.upcomingSchedules()).containsExactly(row);
  }

  @Test
  void upcomingSchedulesPageShouldDelegatePagingToRepository() {
    LexisAdminScheduleService service = newService();
    ExportScheduleRowDto row =
        new ExportScheduleRowDto(1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null);
    when(repository.findUpcomingExportSchedules(1, 50)).thenReturn(List.of(row));
    when(repository.countUpcomingExportSchedules()).thenReturn(73);

    var result = service.upcomingSchedules(1, 50);

    assertThat(result.results()).containsExactly(row);
    assertThat(result.total()).isEqualTo(73);
    assertThat(result.page()).isEqualTo(1);
    assertThat(result.size()).isEqualTo(50);
  }

  @Test
  void upcomingSchedulesPageShouldNormalizeInvalidPaging() {
    LexisAdminScheduleService service = newService();
    when(repository.findUpcomingExportSchedules(0, 100)).thenReturn(List.of());
    when(repository.countUpcomingExportSchedules()).thenReturn(0);

    var result = service.upcomingSchedules(-3, 0);

    assertThat(result.results()).isEmpty();
    assertThat(result.total()).isZero();
    assertThat(result.page()).isZero();
    assertThat(result.size()).isEqualTo(100);
    verify(repository).findUpcomingExportSchedules(0, 100);
  }

  @Test
  void upcomingSchedulesPageShouldCapPageSizeAtTwoHundred() {
    LexisAdminScheduleService service = newService();
    when(repository.findUpcomingExportSchedules(2, 200)).thenReturn(List.of());
    when(repository.countUpcomingExportSchedules()).thenReturn(0);

    var result = service.upcomingSchedules(2, 500);

    assertThat(result.results()).isEmpty();
    assertThat(result.page()).isEqualTo(2);
    assertThat(result.size()).isEqualTo(200);
    verify(repository).findUpcomingExportSchedules(2, 200);
  }

  @Test
  void schedulesShouldIncludeHistoricalRowsAndRetainRequestedSorting() {
    LexisAdminScheduleService service = newService();
    ExportScheduleRowDto row =
        new ExportScheduleRowDto(
            1001L,
            LocalDate.of(2026, 6, 24),
            null,
            null,
            null,
            null,
            null,
            0L,
            true);
    when(repository.findExportSchedules(0, 50, "teacMeetingDate", "desc")).thenReturn(List.of(row));
    when(repository.countExportSchedules()).thenReturn(2154);

    var result = service.schedules(0, 50, "teacMeetingDate", "desc");

    assertThat(result.results()).containsExactly(row);
    assertThat(result.total()).isEqualTo(2154);
    verify(repository).findExportSchedules(0, 50, "teacMeetingDate", "desc");
  }

  @Test
  void createScheduleShouldRejectPastAdvertisingDatesBeforeRepositoryMutation() {
    LexisAdminScheduleService service = newService();

    var result =
        service.createSchedule(
            request(
                LocalDate.of(2026, 6, 24),
                LocalDate.of(2026, 6, 20),
                LocalDate.of(2026, 6, 26)));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("Advertising date must be today or a future date.");
    verifyNoInteractions(repository);
  }

  @ParameterizedTest
  @MethodSource("missingRequiredScheduleDates")
  void createScheduleShouldRejectEveryMissingDatabaseRequiredDate(
      ExportScheduleCreateRequestDto request, String expectedMessage) {
    LexisAdminScheduleService service = newService();

    var result = service.createSchedule(request);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo(expectedMessage);
    verifyNoInteractions(repository);
  }

  @ParameterizedTest
  @MethodSource("missingRequiredScheduleDates")
  void updateScheduleShouldRejectEveryMissingDatabaseRequiredDateBeforeLookup(
      ExportScheduleCreateRequestDto request, String expectedMessage) {
    LexisAdminScheduleService service = newService();

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo(expectedMessage);
    verifyNoInteractions(repository);
  }

  @Test
  void createScheduleShouldRejectOfferWithdrawalAfterOfferEndBeforeRepositoryMutation() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 8, 7),
            LocalDate.of(2026, 8, 14),
            LocalDate.of(2026, 8, 4));

    var result = service.createSchedule(request);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("Offer withdrawal date cannot be after the offer end date.");
    verifyNoInteractions(repository);
  }

  @Test
  void createScheduleShouldRejectTeacAfterOfferEndBeforeRepositoryMutation() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 8, 7),
            LocalDate.of(2026, 8, 4),
            LocalDate.of(2026, 8, 14));

    var result = service.createSchedule(request);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("TEAC meeting date cannot be after the offer end date.");
    verifyNoInteractions(repository);
  }

  @Test
  void createScheduleShouldAllowLegacyDuplicateAdvertisingDate() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 6, 25),
            LocalDate.of(2026, 7, 8));
    ExportScheduleRowDto inserted = scheduleRow(1002L, request);
    when(repository.insertExportSchedule(request)).thenReturn(inserted);

    var result = service.createSchedule(request);

    assertThat(result.success()).isTrue();
    assertThat(result.schedule()).isEqualTo(inserted);
    verify(repository).insertExportSchedule(request);
  }

  @Test
  void createScheduleShouldInsertValidSchedule() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 6, 25),
            LocalDate.of(2026, 7, 8));
    ExportScheduleRowDto inserted =
        new ExportScheduleRowDto(
            1002L,
            request.advertisingDate(),
            request.applicationReceiptDate(),
            request.offerReceiptDate(),
            request.offerEndDate(),
            request.offerWithdrawalDate(),
            request.teacMeetingDate());
    when(repository.insertExportSchedule(request)).thenReturn(inserted);

    var result = service.createSchedule(request);

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Export schedule added.");
    assertThat(result.schedule()).isEqualTo(inserted);
    verify(repository).insertExportSchedule(request);
  }

  @Test
  void createScheduleShouldNotMisclassifyPrimaryKeyCollisionAsAdvertisingDateCollision() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 15));
    when(repository.insertExportSchedule(request))
        .thenThrow(new DuplicateKeyException("unique constraint"));

    assertThatThrownBy(() -> service.createSchedule(request))
        .isInstanceOf(DuplicateKeyException.class)
        .hasMessage("unique constraint");
  }

  @Test
  void updateScheduleShouldRejectReferencedSchedule() {
    LexisAdminScheduleService service = newService();
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(2L);

    var result =
        service.updateSchedule(
            1001L,
            request(
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 6, 25),
                LocalDate.of(2026, 7, 8)));

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo("Export schedule is used by existing applications and cannot be changed.");
    verify(repository, never()).updateExportSchedule(anyLong(), any());
  }

  @Test
  void updateScheduleShouldRejectInvalidScheduleIdBeforeRepositoryLookup() {
    LexisAdminScheduleService service = newService();

    var result =
        service.updateSchedule(
            0L,
            request(
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 6, 25),
                LocalDate.of(2026, 7, 8)));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("A valid export schedule id is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void updateScheduleShouldAllowLegacyDuplicateAdvertisingDate() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 8),
            LocalDate.of(2026, 7, 22));
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(0L);
    ExportScheduleRowDto updated = scheduleRow(1001L, request);
    when(repository.updateExportSchedule(1001L, request)).thenReturn(updated);

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isTrue();
    assertThat(result.schedule()).isEqualTo(updated);
    verify(repository).updateExportSchedule(1001L, request);
  }

  @Test
  void updateScheduleShouldUpdateFutureUnreferencedSchedule() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 8),
            LocalDate.of(2026, 7, 22));
    ExportScheduleRowDto updated =
        new ExportScheduleRowDto(
            1001L,
            request.advertisingDate(),
            request.applicationReceiptDate(),
            request.offerReceiptDate(),
            request.offerEndDate(),
            request.offerWithdrawalDate(),
            request.teacMeetingDate());
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(0L);
    when(repository.updateExportSchedule(1001L, request)).thenReturn(updated);

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Export schedule updated.");
    assertThat(result.schedule()).isEqualTo(updated);
  }

  @Test
  void updateScheduleShouldAllowUnchangedAdvertisingDateOwnedBySameSchedule() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 8),
            LocalDate.of(2026, 7, 22));
    ExportScheduleRowDto existing =
        new ExportScheduleRowDto(
            1001L, request.advertisingDate(), null, null, null, null, null);
    ExportScheduleRowDto updated = scheduleRow(1001L, request);
    when(repository.findExportScheduleById(1001L)).thenReturn(Optional.of(existing));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(0L);
    when(repository.updateExportSchedule(1001L, request)).thenReturn(updated);

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isTrue();
    assertThat(result.schedule()).isEqualTo(updated);
    verify(repository).updateExportSchedule(1001L, request);
  }

  @Test
  void updateScheduleShouldUpdatePastUnreferencedSchedule() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 6, 24),
            LocalDate.of(2026, 6, 24),
            LocalDate.of(2026, 7, 8));
    ExportScheduleRowDto updated = scheduleRow(1001L, request);
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 6, 24), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(0L);
    when(repository.updateExportSchedule(1001L, request)).thenReturn(updated);

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isTrue();
    assertThat(result.schedule()).isEqualTo(updated);
  }

  @Test
  void updateScheduleShouldPropagateNonDuplicateIntegrityViolation() {
    LexisAdminScheduleService service = newService();
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 29));
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(0L);
    when(repository.updateExportSchedule(1001L, request))
        .thenThrow(new DataIntegrityViolationException("constraint"));

    assertThatThrownBy(() -> service.updateSchedule(1001L, request))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessage("constraint");
  }

  @Test
  void deleteScheduleShouldDeletePastUnreferencedSchedules() {
    LexisAdminScheduleService service = newService();
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 6, 24), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(0L);
    when(repository.deleteExportSchedule(1001L)).thenReturn(true);

    var result = service.deleteSchedule(1001L);

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Export schedule deleted.");
  }

  @Test
  void deleteScheduleShouldRejectReferencedFutureScheduleBeforeDelete() {
    LexisAdminScheduleService service = newService();
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(1L);

    var result = service.deleteSchedule(1001L);

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo("Export schedule is used by existing applications and cannot be changed.");
    verify(repository, never()).deleteExportSchedule(1001L);
  }

  @Test
  void deleteScheduleShouldFailClosedWhenUsageLookupFails() {
    LexisAdminScheduleService service = newService();
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> service.deleteSchedule(1001L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    verify(repository, never()).deleteExportSchedule(1001L);
  }

  @Test
  void deleteScheduleShouldDeleteFutureUnreferencedSchedule() {
    LexisAdminScheduleService service = newService();
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null)));
    when(repository.countApplicationsForExportSchedule(1001L)).thenReturn(0L);
    when(repository.deleteExportSchedule(1001L)).thenReturn(true);

    var result = service.deleteSchedule(1001L);

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Export schedule deleted.");
  }

  @Test
  void mutationGuardShouldAllowLegacyDuplicateDateAfterFirstTransactionCompletes()
      throws Exception {
    BlockingCompletionTransactions transactions = new BlockingCompletionTransactions();
    LexisAdminScheduleService service =
        new LexisAdminScheduleService(repository, FIXED_CLOCK, transactions);
    ExportScheduleCreateRequestDto firstRequest =
        request(
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 8),
            LocalDate.of(2026, 7, 22));
    ExportScheduleCreateRequestDto secondRequest = firstRequest;
    AtomicInteger sequence = new AtomicInteger();
    when(repository.insertExportSchedule(any()))
        .thenAnswer(
            invocation ->
                scheduleRow(
                    3000L + sequence.incrementAndGet(),
                    invocation.getArgument(0, ExportScheduleCreateRequestDto.class)));

    CountDownLatch secondTaskStarted = new CountDownLatch(1);
    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      var first = executor.submit(() -> service.createSchedule(firstRequest));
      assertThat(transactions.firstCompletionReached.await(5, TimeUnit.SECONDS)).isTrue();
      var second =
          executor.submit(
              () -> {
                secondTaskStarted.countDown();
                return service.createSchedule(secondRequest);
              });
      assertThat(secondTaskStarted.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(transactions.secondExecutionEntered.await(250, TimeUnit.MILLISECONDS)).isFalse();
      verify(repository, times(1)).insertExportSchedule(any());

      transactions.releaseFirstCompletion.countDown();
      assertThat(first.get(5, TimeUnit.SECONDS).success()).isTrue();
      assertThat(second.get(5, TimeUnit.SECONDS).success()).isTrue();
      assertThat(transactions.secondExecutionEntered.getCount()).isZero();
      verify(repository, times(2)).insertExportSchedule(any());
    } finally {
      transactions.releaseFirstCompletion.countDown();
      executor.shutdownNow();
    }
  }

  private static void awaitOrFail(CountDownLatch latch) {
    try {
      if (!latch.await(5, TimeUnit.SECONDS)) {
        throw new AssertionError("Timed out waiting for concurrent schedule test");
      }
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new AssertionError("Interrupted while waiting for concurrent schedule test", ex);
    }
  }

  private static ExportScheduleRowDto scheduleRow(
      long scheduleId, ExportScheduleCreateRequestDto request) {
    return new ExportScheduleRowDto(
        scheduleId,
        request.advertisingDate(),
        request.applicationReceiptDate(),
        request.offerReceiptDate(),
        request.offerEndDate(),
        request.offerWithdrawalDate(),
        request.teacMeetingDate());
  }

  private static final class BlockingCompletionTransactions implements TransactionOperations {
    private final AtomicInteger executions = new AtomicInteger();
    private final CountDownLatch firstCompletionReached = new CountDownLatch(1);
    private final CountDownLatch releaseFirstCompletion = new CountDownLatch(1);
    private final CountDownLatch secondExecutionEntered = new CountDownLatch(1);

    @Override
    public <T> T execute(TransactionCallback<T> action) {
      int execution = executions.incrementAndGet();
      if (execution == 2) {
        secondExecutionEntered.countDown();
      }
      T result = action.doInTransaction(new SimpleTransactionStatus());
      if (execution == 1) {
        // TransactionOperations returns only after its transaction has committed or rolled back.
        firstCompletionReached.countDown();
        awaitOrFail(releaseFirstCompletion);
      }
      return result;
    }
  }

  private static ExportScheduleCreateRequestDto request(
      LocalDate advertisingDate,
      LocalDate applicationReceiptDate,
      LocalDate offerReceiptDate) {
    return new ExportScheduleCreateRequestDto(
        advertisingDate,
        applicationReceiptDate,
        offerReceiptDate,
        offerReceiptDate.plusDays(29),
        offerReceiptDate.plusDays(19),
        offerReceiptDate.plusDays(22));
  }

  private static Stream<Arguments> missingRequiredScheduleDates() {
    LocalDate advertisingDate = LocalDate.of(2026, 7, 1);
    LocalDate applicationReceiptDate = LocalDate.of(2026, 6, 25);
    LocalDate offerReceiptDate = LocalDate.of(2026, 7, 8);
    LocalDate offerEndDate = LocalDate.of(2026, 8, 6);
    LocalDate offerWithdrawalDate = LocalDate.of(2026, 7, 27);
    LocalDate teacMeetingDate = LocalDate.of(2026, 7, 30);
    return Stream.of(
        Arguments.of(
            new ExportScheduleCreateRequestDto(
                null,
                applicationReceiptDate,
                offerReceiptDate,
                offerEndDate,
                offerWithdrawalDate,
                teacMeetingDate),
            "Advertising date is required."),
        Arguments.of(
            new ExportScheduleCreateRequestDto(
                advertisingDate,
                null,
                offerReceiptDate,
                offerEndDate,
                offerWithdrawalDate,
                teacMeetingDate),
            "Application receipt date is required."),
        Arguments.of(
            new ExportScheduleCreateRequestDto(
                advertisingDate,
                applicationReceiptDate,
                null,
                offerEndDate,
                offerWithdrawalDate,
                teacMeetingDate),
            "Offer receipt date is required."),
        Arguments.of(
            new ExportScheduleCreateRequestDto(
                advertisingDate,
                applicationReceiptDate,
                offerReceiptDate,
                null,
                offerWithdrawalDate,
                teacMeetingDate),
            "Offer end date is required."),
        Arguments.of(
            new ExportScheduleCreateRequestDto(
                advertisingDate,
                applicationReceiptDate,
                offerReceiptDate,
                offerEndDate,
                null,
                teacMeetingDate),
            "Offer withdrawal date is required."),
        Arguments.of(
            new ExportScheduleCreateRequestDto(
                advertisingDate,
                applicationReceiptDate,
                offerReceiptDate,
                offerEndDate,
                offerWithdrawalDate,
                null),
            "TEAC meeting date is required."));
  }
}

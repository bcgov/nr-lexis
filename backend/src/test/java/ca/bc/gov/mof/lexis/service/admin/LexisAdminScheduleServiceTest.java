package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.dao.DataIntegrityViolationException;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LexisAdminScheduleServiceTest {

  private static final Clock FIXED_CLOCK =
      Clock.fixed(Instant.parse("2026-06-25T12:00:00Z"), ZoneId.of("America/Vancouver"));

  @Mock private LexisReportScheduleRepository repository;

  @Test
  void upcomingSchedulesShouldDelegateToRepository() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
    ExportScheduleRowDto row =
        new ExportScheduleRowDto(1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null);
    when(repository.findUpcomingExportSchedules()).thenReturn(List.of(row));

    assertThat(service.upcomingSchedules()).containsExactly(row);
  }

  @Test
  void upcomingSchedulesPageShouldDelegatePagingToRepository() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
    when(repository.findUpcomingExportSchedules(2, 200)).thenReturn(List.of());
    when(repository.countUpcomingExportSchedules()).thenReturn(0);

    var result = service.upcomingSchedules(2, 500);

    assertThat(result.results()).isEmpty();
    assertThat(result.page()).isEqualTo(2);
    assertThat(result.size()).isEqualTo(200);
    verify(repository).findUpcomingExportSchedules(2, 200);
  }

  @Test
  void createScheduleShouldRejectPastAdvertisingDatesBeforeRepositoryMutation() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);

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

  @Test
  void createScheduleShouldRejectOfferWithdrawalAfterOfferEndBeforeRepositoryMutation() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
  void createScheduleShouldRejectDuplicateAdvertisingDate() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 6, 25),
            LocalDate.of(2026, 7, 8));
    when(repository.advertisingDateExists(LocalDate.of(2026, 7, 1))).thenReturn(true);

    var result = service.createSchedule(request);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("A schedule already exists for that advertising date.");
    verify(repository).advertisingDateExists(LocalDate.of(2026, 7, 1));
  }

  @Test
  void createScheduleShouldInsertValidSchedule() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    when(repository.advertisingDateExists(LocalDate.of(2026, 7, 1))).thenReturn(false);
    when(repository.insertExportSchedule(request)).thenReturn(inserted);

    var result = service.createSchedule(request);

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Export schedule added.");
    assertThat(result.schedule()).isEqualTo(inserted);
    verify(repository).insertExportSchedule(request);
  }

  @Test
  void createScheduleShouldReturnValidationMessageForDatabaseConstraintViolation() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
    ExportScheduleCreateRequestDto request =
        request(
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 1),
            LocalDate.of(2026, 7, 15));
    when(repository.advertisingDateExists(LocalDate.of(2026, 7, 1))).thenReturn(false);
    when(repository.insertExportSchedule(request))
        .thenThrow(new DataIntegrityViolationException("constraint"));

    var result = service.createSchedule(request);

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo("Export schedule dates are invalid or conflict with an existing schedule.");
    assertThat(result.schedule()).isNull();
  }

  @Test
  void updateScheduleShouldRejectReferencedSchedule() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);

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
  void updateScheduleShouldRejectDuplicateAdvertisingDateBeforeMutation() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    when(repository.advertisingDateExistsForOtherSchedule(LocalDate.of(2026, 7, 15), 1001L))
        .thenReturn(true);

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("A schedule already exists for that advertising date.");
    verify(repository, never()).updateExportSchedule(1001L, request);
  }

  @Test
  void updateScheduleShouldUpdateFutureUnreferencedSchedule() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    when(repository.advertisingDateExistsForOtherSchedule(LocalDate.of(2026, 7, 15), 1001L))
        .thenReturn(false);
    when(repository.updateExportSchedule(1001L, request)).thenReturn(updated);

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Export schedule updated.");
    assertThat(result.schedule()).isEqualTo(updated);
  }

  @Test
  void updateScheduleShouldReturnValidationMessageForDatabaseConstraintViolation() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
    when(repository.advertisingDateExistsForOtherSchedule(LocalDate.of(2026, 7, 15), 1001L))
        .thenReturn(false);
    when(repository.updateExportSchedule(1001L, request))
        .thenThrow(new DataIntegrityViolationException("constraint"));

    var result = service.updateSchedule(1001L, request);

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo("Export schedule dates are invalid or conflict with an existing schedule.");
    assertThat(result.schedule()).isNull();
  }

  @Test
  void deleteScheduleShouldRejectPastSchedules() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
    when(repository.findExportScheduleById(1001L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1001L, LocalDate.of(2026, 6, 24), null, null, null, null, null)));

    var result = service.deleteSchedule(1001L);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("Only current or future export schedules can be changed.");
  }

  @Test
  void deleteScheduleShouldRejectReferencedFutureScheduleBeforeDelete() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
  void deleteScheduleShouldDeleteFutureUnreferencedSchedule() {
    LexisAdminScheduleService service = new LexisAdminScheduleService(repository, FIXED_CLOCK);
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
}

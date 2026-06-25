package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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

  private static ExportScheduleCreateRequestDto request(
      LocalDate advertisingDate,
      LocalDate applicationReceiptDate,
      LocalDate offerReceiptDate) {
    return new ExportScheduleCreateRequestDto(
        advertisingDate,
        applicationReceiptDate,
        offerReceiptDate,
        offerReceiptDate.plusDays(1),
        offerReceiptDate.plusDays(2),
        offerReceiptDate.plusDays(3));
  }
}

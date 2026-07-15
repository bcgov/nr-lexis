package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleMutationResultDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminScheduleService;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
class LexisAdminScheduleControllerTest {

  @Mock private ObjectProvider<LexisAdminScheduleService> scheduleServiceProvider;
  @Mock private LexisAdminScheduleService scheduleService;

  @Test
  void schedulesShouldReturnNoContentWhenServiceMissing() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(null);
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.schedules(0, 100, "upcoming", "advertisingDate", "asc");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
  }

  @Test
  void schedulesShouldDelegateToService() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(scheduleService);
    ExportScheduleRowDto row =
        new ExportScheduleRowDto(1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null);
    LexisAdminPagedResponseDto<ExportScheduleRowDto> payload =
        new LexisAdminPagedResponseDto<>(java.util.List.of(row), 1, 0, 100);
    when(scheduleService.schedules(0, 100, "past", "teacMeetingDate", "desc")).thenReturn(payload);
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.schedules(0, 100, "past", "teacMeetingDate", "desc");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(scheduleService).schedules(0, 100, "past", "teacMeetingDate", "desc");
  }

  @Test
  void createScheduleShouldReturnBadRequestForValidationFailure() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(scheduleService);
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 1), null, null, null, null, null);
    when(scheduleService.createSchedule(request))
        .thenReturn(new ExportScheduleMutationResultDto(false, "Advertising date is required.", null));
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.createSchedule(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
  }

  @Test
  void createScheduleShouldReturnOkForSuccess() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(scheduleService);
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 1), null, null, null, null, null);
    ExportScheduleRowDto row =
        new ExportScheduleRowDto(1001L, LocalDate.of(2026, 7, 1), null, null, null, null, null);
    when(scheduleService.createSchedule(request))
        .thenReturn(new ExportScheduleMutationResultDto(true, "Export schedule added.", row));
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.createSchedule(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().schedule()).isEqualTo(row);
  }

  @Test
  void updateScheduleShouldReturnNoContentWhenServiceMissing() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(null);
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 15), null, null, null, null, null);
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.updateSchedule(1001L, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
  }

  @Test
  void updateScheduleShouldReturnBadRequestForGuardrailFailure() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(scheduleService);
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 15), null, null, null, null, null);
    when(scheduleService.updateSchedule(1001L, request))
        .thenReturn(
            new ExportScheduleMutationResultDto(
                false, "A schedule already exists for that advertising date.", null));
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.updateSchedule(1001L, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().message())
        .isEqualTo("A schedule already exists for that advertising date.");
  }

  @Test
  void updateScheduleShouldReturnOkForSuccess() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(scheduleService);
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 15), null, null, null, null, null);
    ExportScheduleRowDto row =
        new ExportScheduleRowDto(1001L, LocalDate.of(2026, 7, 15), null, null, null, null, null);
    when(scheduleService.updateSchedule(1001L, request))
        .thenReturn(new ExportScheduleMutationResultDto(true, "Export schedule updated.", row));
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.updateSchedule(1001L, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().schedule()).isEqualTo(row);
  }

  @Test
  void deleteScheduleShouldReturnNoContentWhenServiceMissing() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(null);
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.deleteSchedule(1001L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
  }

  @Test
  void deleteScheduleShouldReturnBadRequestForGuardrailFailure() {
    when(scheduleServiceProvider.getIfAvailable()).thenReturn(scheduleService);
    when(scheduleService.deleteSchedule(1001L))
        .thenReturn(
            new ExportScheduleMutationResultDto(
                false,
                "Export schedule is used by existing applications and cannot be changed.",
                null));
    LexisAdminScheduleController controller =
        new LexisAdminScheduleController(scheduleServiceProvider);

    var response = controller.deleteSchedule(1001L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
  }
}

package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleMutationResultDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminScheduleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/admin/schedules")
public class LexisAdminScheduleController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisAdminScheduleController.class);

  private final ObjectProvider<LexisAdminScheduleService> scheduleServiceProvider;

  public LexisAdminScheduleController(ObjectProvider<LexisAdminScheduleService> scheduleServiceProvider) {
    this.scheduleServiceProvider = scheduleServiceProvider;
  }

  @GetMapping
  public ResponseEntity<LexisAdminPagedResponseDto<ExportScheduleRowDto>> upcomingSchedules(
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "100") int size) {
    LexisAdminScheduleService service = scheduleServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin schedule service unavailable - returning no content for schedules");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.upcomingSchedules(page, size));
  }

  @PostMapping
  public ResponseEntity<ExportScheduleMutationResultDto> createSchedule(
      @RequestBody(required = false) ExportScheduleCreateRequestDto request) {
    LexisAdminScheduleService service = scheduleServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin schedule service unavailable - returning no content for schedule create");
      return ResponseEntity.noContent().build();
    }
    ExportScheduleMutationResultDto result = service.createSchedule(request);
    return result.success() ? ResponseEntity.ok(result) : ResponseEntity.badRequest().body(result);
  }

  @PutMapping("/{exportScheduleId}")
  public ResponseEntity<ExportScheduleMutationResultDto> updateSchedule(
      @PathVariable long exportScheduleId,
      @RequestBody(required = false) ExportScheduleCreateRequestDto request) {
    LexisAdminScheduleService service = scheduleServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin schedule service unavailable - returning no content for schedule update");
      return ResponseEntity.noContent().build();
    }
    ExportScheduleMutationResultDto result = service.updateSchedule(exportScheduleId, request);
    return result.success() ? ResponseEntity.ok(result) : ResponseEntity.badRequest().body(result);
  }

  @DeleteMapping("/{exportScheduleId}")
  public ResponseEntity<ExportScheduleMutationResultDto> deleteSchedule(
      @PathVariable long exportScheduleId) {
    LexisAdminScheduleService service = scheduleServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin schedule service unavailable - returning no content for schedule delete");
      return ResponseEntity.noContent().build();
    }
    ExportScheduleMutationResultDto result = service.deleteSchedule(exportScheduleId);
    return result.success() ? ResponseEntity.ok(result) : ResponseEntity.badRequest().body(result);
  }
}

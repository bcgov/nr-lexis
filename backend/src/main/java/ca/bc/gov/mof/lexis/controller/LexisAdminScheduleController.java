package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleMutationResultDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminScheduleService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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
  public ResponseEntity<List<ExportScheduleRowDto>> upcomingSchedules() {
    LexisAdminScheduleService service = scheduleServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin schedule service unavailable - returning no content for schedules");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.upcomingSchedules());
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
}

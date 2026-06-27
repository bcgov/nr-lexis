package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleMutationResultDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("oracle")
public class LexisAdminScheduleService {

  private static final int DEFAULT_PAGE_SIZE = 100;
  private static final int MAX_PAGE_SIZE = 200;
  private static final String SCHEDULE_CONSTRAINT_MESSAGE =
      "Export schedule dates are invalid or conflict with an existing schedule.";

  private final LexisReportScheduleRepository repository;
  private final Clock clock;

  @Autowired
  public LexisAdminScheduleService(LexisReportScheduleRepository repository) {
    this(repository, Clock.systemDefaultZone());
  }

  LexisAdminScheduleService(LexisReportScheduleRepository repository, Clock clock) {
    this.repository = repository;
    this.clock = clock == null ? Clock.systemDefaultZone() : clock;
  }

  public List<ExportScheduleRowDto> upcomingSchedules() {
    return repository.findUpcomingExportSchedules();
  }

  public LexisAdminPagedResponseDto<ExportScheduleRowDto> upcomingSchedules(int page, int size) {
    int normalizedPage = Math.max(0, page);
    int normalizedSize = size < 1 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
    return new LexisAdminPagedResponseDto<>(
        repository.findUpcomingExportSchedules(normalizedPage, normalizedSize),
        repository.countUpcomingExportSchedules(),
        normalizedPage,
        normalizedSize);
  }

  @Transactional
  public ExportScheduleMutationResultDto createSchedule(ExportScheduleCreateRequestDto request) {
    String validationError = validate(request);
    if (validationError != null) {
      return new ExportScheduleMutationResultDto(false, validationError, null);
    }

    if (repository.advertisingDateExists(request.advertisingDate())) {
      return new ExportScheduleMutationResultDto(
          false,
          "A schedule already exists for that advertising date.",
          null);
    }

    try {
      ExportScheduleRowDto row = repository.insertExportSchedule(request);
      return new ExportScheduleMutationResultDto(true, "Export schedule added.", row);
    } catch (DataIntegrityViolationException ex) {
      return new ExportScheduleMutationResultDto(false, SCHEDULE_CONSTRAINT_MESSAGE, null);
    }
  }

  @Transactional
  public ExportScheduleMutationResultDto updateSchedule(
      long exportScheduleId, ExportScheduleCreateRequestDto request) {
    String rowValidationError = validateMutableSchedule(exportScheduleId);
    if (rowValidationError != null) {
      return new ExportScheduleMutationResultDto(false, rowValidationError, null);
    }

    String validationError = validate(request);
    if (validationError != null) {
      return new ExportScheduleMutationResultDto(false, validationError, null);
    }

    if (repository.advertisingDateExistsForOtherSchedule(
        request.advertisingDate(), exportScheduleId)) {
      return new ExportScheduleMutationResultDto(
          false, "A schedule already exists for that advertising date.", null);
    }

    try {
      ExportScheduleRowDto row = repository.updateExportSchedule(exportScheduleId, request);
      return new ExportScheduleMutationResultDto(true, "Export schedule updated.", row);
    } catch (DataIntegrityViolationException ex) {
      return new ExportScheduleMutationResultDto(false, SCHEDULE_CONSTRAINT_MESSAGE, null);
    }
  }

  @Transactional
  public ExportScheduleMutationResultDto deleteSchedule(long exportScheduleId) {
    String rowValidationError = validateMutableSchedule(exportScheduleId);
    if (rowValidationError != null) {
      return new ExportScheduleMutationResultDto(false, rowValidationError, null);
    }

    boolean deleted = repository.deleteExportSchedule(exportScheduleId);
    return deleted
        ? new ExportScheduleMutationResultDto(true, "Export schedule deleted.", null)
        : new ExportScheduleMutationResultDto(false, "Export schedule not found.", null);
  }

  private String validateMutableSchedule(long exportScheduleId) {
    if (exportScheduleId < 1) {
      return "A valid export schedule id is required.";
    }

    ExportScheduleRowDto existing =
        repository.findExportScheduleById(exportScheduleId).orElse(null);
    if (existing == null) {
      return "Export schedule not found.";
    }

    LocalDate today = LocalDate.now(clock);
    if (existing.advertisingDate() == null || existing.advertisingDate().isBefore(today)) {
      return "Only current or future export schedules can be changed.";
    }

    long usageCount = repository.countApplicationsForExportSchedule(exportScheduleId);
    if (usageCount > 0L) {
      return "Export schedule is used by existing applications and cannot be changed.";
    }

    return null;
  }

  private String validate(ExportScheduleCreateRequestDto request) {
    if (request == null) {
      return "Export schedule details are required.";
    }

    LocalDate advertisingDate = request.advertisingDate();
    if (advertisingDate == null) {
      return "Advertising date is required.";
    }
    if (advertisingDate.isBefore(LocalDate.now(clock))) {
      return "Advertising date must be today or a future date.";
    }
    if (request.applicationReceiptDate() != null
        && request.applicationReceiptDate().isAfter(advertisingDate)) {
      return "Application receipt date cannot be after the advertising date.";
    }
    if (request.offerReceiptDate() != null && request.offerReceiptDate().isBefore(advertisingDate)) {
      return "Offer receipt date cannot be before the advertising date.";
    }
    if (request.offerEndDate() != null
        && request.offerReceiptDate() != null
        && request.offerEndDate().isBefore(request.offerReceiptDate())) {
      return "Offer end date cannot be before the offer receipt date.";
    }
    if (request.offerWithdrawalDate() != null
        && request.offerWithdrawalDate().isBefore(advertisingDate)) {
      return "Offer withdrawal date cannot be before the advertising date.";
    }
    if (request.offerEndDate() != null
        && request.offerWithdrawalDate() != null
        && request.offerWithdrawalDate().isAfter(request.offerEndDate())) {
      return "Offer withdrawal date cannot be after the offer end date.";
    }
    if (request.teacMeetingDate() != null && request.teacMeetingDate().isBefore(advertisingDate)) {
      return "TEAC meeting date cannot be before the advertising date.";
    }
    if (request.offerEndDate() != null
        && request.teacMeetingDate() != null
        && request.teacMeetingDate().isAfter(request.offerEndDate())) {
      return "TEAC meeting date cannot be after the offer end date.";
    }
    return null;
  }
}

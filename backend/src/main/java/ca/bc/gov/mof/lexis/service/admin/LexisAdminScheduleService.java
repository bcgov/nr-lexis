package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleMutationResultDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("oracle")
public class LexisAdminScheduleService {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisAdminScheduleService.class);
  private static final int DEFAULT_PAGE_SIZE = 100;
  private static final int MAX_PAGE_SIZE = 200;
  private static final String PAST_SCOPE = "past";
  private static final String UPCOMING_SCOPE = "upcoming";
  private static final String DEFAULT_SORT_FIELD = "advertisingDate";
  private static final String DEFAULT_SORT_DIRECTION = "asc";
  private static final String SCHEDULE_CONSTRAINT_MESSAGE =
      "Export schedule dates are invalid or conflict with an existing schedule.";
  private static final String SCHEDULE_DATABASE_MESSAGE =
      "Export schedule could not be saved. Contact support if the problem persists.";

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
    return schedules(page, size, UPCOMING_SCOPE, DEFAULT_SORT_FIELD, DEFAULT_SORT_DIRECTION);
  }

  public LexisAdminPagedResponseDto<ExportScheduleRowDto> schedules(
      int page, int size, String scope, String sortField, String sortDirection) {
    int normalizedPage = Math.max(0, page);
    int normalizedSize = size < 1 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
    String normalizedScope = normalizeScope(scope);
    List<ExportScheduleRowDto> rows =
        repository.findExportSchedules(
            normalizedPage, normalizedSize, normalizedScope, sortField, sortDirection);
    return new LexisAdminPagedResponseDto<>(
        PAST_SCOPE.equals(normalizedScope)
            ? rows.stream().map(this::asReadOnlySchedule).toList()
            : rows,
        repository.countExportSchedules(normalizedScope),
        normalizedPage,
        normalizedSize);
  }

  @Transactional
  public ExportScheduleMutationResultDto createSchedule(ExportScheduleCreateRequestDto request) {
    String validationError = validate(request);
    if (validationError != null) {
      return new ExportScheduleMutationResultDto(false, validationError, null);
    }

    try {
      if (repository.advertisingDateExists(request.advertisingDate())) {
        return new ExportScheduleMutationResultDto(
            false,
            "A schedule already exists for that advertising date.",
            null);
      }
      ExportScheduleRowDto row = repository.insertExportSchedule(request);
      return new ExportScheduleMutationResultDto(true, "Export schedule added.", row);
    } catch (DataIntegrityViolationException ex) {
      return new ExportScheduleMutationResultDto(false, SCHEDULE_CONSTRAINT_MESSAGE, null);
    } catch (DataAccessException ex) {
      LOGGER.warn(
          "Export schedule create failed for advertising date {}: {}: {}",
          request.advertisingDate(),
          ex.getClass().getSimpleName(),
          ex.getMessage());
      LOGGER.debug("Export schedule create failure detail", ex);
      return new ExportScheduleMutationResultDto(false, SCHEDULE_DATABASE_MESSAGE, null);
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

    try {
      if (repository.advertisingDateExistsForOtherSchedule(
          request.advertisingDate(), exportScheduleId)) {
        return new ExportScheduleMutationResultDto(
            false, "A schedule already exists for that advertising date.", null);
      }
      ExportScheduleRowDto row = repository.updateExportSchedule(exportScheduleId, request);
      return new ExportScheduleMutationResultDto(true, "Export schedule updated.", row);
    } catch (DataIntegrityViolationException ex) {
      return new ExportScheduleMutationResultDto(false, SCHEDULE_CONSTRAINT_MESSAGE, null);
    } catch (DataAccessException ex) {
      LOGGER.warn(
          "Export schedule update failed for id {} and advertising date {}: {}: {}",
          exportScheduleId,
          request.advertisingDate(),
          ex.getClass().getSimpleName(),
          ex.getMessage());
      LOGGER.debug("Export schedule update failure detail", ex);
      return new ExportScheduleMutationResultDto(false, SCHEDULE_DATABASE_MESSAGE, null);
    }
  }

  @Transactional
  public ExportScheduleMutationResultDto deleteSchedule(long exportScheduleId) {
    String rowValidationError = validateMutableSchedule(exportScheduleId);
    if (rowValidationError != null) {
      return new ExportScheduleMutationResultDto(false, rowValidationError, null);
    }

    try {
      boolean deleted = repository.deleteExportSchedule(exportScheduleId);
      return deleted
        ? new ExportScheduleMutationResultDto(true, "Export schedule deleted.", null)
        : new ExportScheduleMutationResultDto(false, "Export schedule not found.", null);
    } catch (DataAccessException ex) {
      LOGGER.warn(
          "Export schedule delete failed for id {}: {}: {}",
          exportScheduleId,
          ex.getClass().getSimpleName(),
          ex.getMessage());
      LOGGER.debug("Export schedule delete failure detail", ex);
      return new ExportScheduleMutationResultDto(
          false,
          "Export schedule could not be deleted. Contact support if the problem persists.",
          null);
    }
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

  private String normalizeScope(String scope) {
    return PAST_SCOPE.equalsIgnoreCase(scope) ? PAST_SCOPE : UPCOMING_SCOPE;
  }

  private ExportScheduleRowDto asReadOnlySchedule(ExportScheduleRowDto row) {
    return new ExportScheduleRowDto(
        row.exportScheduleId(),
        row.advertisingDate(),
        row.applicationReceiptDate(),
        row.offerReceiptDate(),
        row.offerEndDate(),
        row.offerWithdrawalDate(),
        row.teacMeetingDate(),
        row.applicationCount(),
        false);
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

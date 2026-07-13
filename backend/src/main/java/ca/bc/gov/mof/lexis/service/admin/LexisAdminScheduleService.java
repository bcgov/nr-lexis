package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleMutationResultDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@Profile("oracle")
public class LexisAdminScheduleService {

  private static final int DEFAULT_PAGE_SIZE = 100;
  private static final int MAX_PAGE_SIZE = 200;
  private static final String DUPLICATE_ADVERTISING_DATE_MESSAGE =
      "A schedule already exists for that advertising date.";

  private final LexisReportScheduleRepository repository;
  private final Clock clock;
  private final TransactionOperations transactionOperations;

  /*
   * The business key is not protected by the checked-in Oracle schema. This process-local guard
   * closes the check/write race only while deployment enforces one backend pod. The programmatic
   * transaction remains inside the guard, so the guard is released only after commit or rollback.
   * A database uniqueness rule is still required before backend scale-out.
   */
  private final ReentrantLock scheduleMutationGuard = new ReentrantLock(true);

  @Autowired
  public LexisAdminScheduleService(
      LexisReportScheduleRepository repository,
      PlatformTransactionManager transactionManager) {
    this(
        repository,
        LexisBusinessTime.systemClock(),
        scheduleTransactionOperations(transactionManager));
  }

  LexisAdminScheduleService(
      LexisReportScheduleRepository repository,
      Clock clock,
      TransactionOperations transactionOperations) {
    this.repository = repository;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
    this.transactionOperations = transactionOperations;
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

  public ExportScheduleMutationResultDto createSchedule(ExportScheduleCreateRequestDto request) {
    return executeScheduleMutation(() -> createScheduleInTransaction(request), true);
  }

  private ExportScheduleMutationResultDto createScheduleInTransaction(
      ExportScheduleCreateRequestDto request) {
    String validationError = validate(request);
    if (validationError != null) {
      return new ExportScheduleMutationResultDto(false, validationError, null);
    }

    if (repository.advertisingDateExists(request.advertisingDate())) {
      return new ExportScheduleMutationResultDto(
          false,
          DUPLICATE_ADVERTISING_DATE_MESSAGE,
          null);
    }

    ExportScheduleRowDto row = repository.insertExportSchedule(request);
    return new ExportScheduleMutationResultDto(true, "Export schedule added.", row);
  }

  public ExportScheduleMutationResultDto updateSchedule(
      long exportScheduleId, ExportScheduleCreateRequestDto request) {
    return executeScheduleMutation(
        () -> updateScheduleInTransaction(exportScheduleId, request), true);
  }

  private ExportScheduleMutationResultDto updateScheduleInTransaction(
      long exportScheduleId, ExportScheduleCreateRequestDto request) {
    String validationError = validate(request);
    if (validationError != null) {
      return new ExportScheduleMutationResultDto(false, validationError, null);
    }

    String rowValidationError = validateMutableSchedule(exportScheduleId);
    if (rowValidationError != null) {
      return new ExportScheduleMutationResultDto(false, rowValidationError, null);
    }

    if (repository.advertisingDateExistsForOtherSchedule(
        request.advertisingDate(), exportScheduleId)) {
      return new ExportScheduleMutationResultDto(
          false, DUPLICATE_ADVERTISING_DATE_MESSAGE, null);
    }

    ExportScheduleRowDto row = repository.updateExportSchedule(exportScheduleId, request);
    return new ExportScheduleMutationResultDto(true, "Export schedule updated.", row);
  }

  public ExportScheduleMutationResultDto deleteSchedule(long exportScheduleId) {
    return executeScheduleMutation(
        () -> deleteScheduleInTransaction(exportScheduleId), false);
  }

  private ExportScheduleMutationResultDto deleteScheduleInTransaction(long exportScheduleId) {
    String rowValidationError = validateMutableSchedule(exportScheduleId);
    if (rowValidationError != null) {
      return new ExportScheduleMutationResultDto(false, rowValidationError, null);
    }

    boolean deleted = repository.deleteExportSchedule(exportScheduleId);
    return deleted
        ? new ExportScheduleMutationResultDto(true, "Export schedule deleted.", null)
        : new ExportScheduleMutationResultDto(false, "Export schedule not found.", null);
  }

  private ExportScheduleMutationResultDto executeScheduleMutation(
      Supplier<ExportScheduleMutationResultDto> mutation,
      boolean duplicateMeansAdvertisingDateCollision) {
    scheduleMutationGuard.lock();
    try {
      try {
        ExportScheduleMutationResultDto result =
            transactionOperations.execute(status -> mutation.get());
        if (result == null) {
          throw new IllegalStateException("Export schedule transaction returned no result.");
        }
        return result;
      } catch (DuplicateKeyException ex) {
        if (!duplicateMeansAdvertisingDateCollision) {
          throw ex;
        }
        return new ExportScheduleMutationResultDto(
            false, DUPLICATE_ADVERTISING_DATE_MESSAGE, null);
      }
    } finally {
      scheduleMutationGuard.unlock();
    }
  }

  private static TransactionOperations scheduleTransactionOperations(
      PlatformTransactionManager transactionManager) {
    TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
    transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    return transactionTemplate;
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
    if (request.applicationReceiptDate() == null) {
      return "Application receipt date is required.";
    }
    if (request.offerReceiptDate() == null) {
      return "Offer receipt date is required.";
    }
    if (request.offerEndDate() == null) {
      return "Offer end date is required.";
    }
    if (request.offerWithdrawalDate() == null) {
      return "Offer withdrawal date is required.";
    }
    if (request.teacMeetingDate() == null) {
      return "TEAC meeting date is required.";
    }
    if (request.applicationReceiptDate().isAfter(advertisingDate)) {
      return "Application receipt date cannot be after the advertising date.";
    }
    if (request.offerReceiptDate().isBefore(advertisingDate)) {
      return "Offer receipt date cannot be before the advertising date.";
    }
    if (request.offerEndDate().isBefore(request.offerReceiptDate())) {
      return "Offer end date cannot be before the offer receipt date.";
    }
    if (request.offerWithdrawalDate().isBefore(advertisingDate)) {
      return "Offer withdrawal date cannot be before the advertising date.";
    }
    if (request.offerWithdrawalDate().isAfter(request.offerEndDate())) {
      return "Offer withdrawal date cannot be after the offer end date.";
    }
    if (request.teacMeetingDate().isBefore(advertisingDate)) {
      return "TEAC meeting date cannot be before the advertising date.";
    }
    if (request.teacMeetingDate().isAfter(request.offerEndDate())) {
      return "TEAC meeting date cannot be after the offer end date.";
    }
    return null;
  }
}

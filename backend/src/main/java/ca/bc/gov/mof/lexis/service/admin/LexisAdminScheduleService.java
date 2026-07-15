package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleMutationResultDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.coordination.RedisLeaseService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
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

  private final LexisReportScheduleRepository repository;
  private final Clock clock;
  private final TransactionOperations transactionOperations;
  private final RedisLeaseService redisLeases;

  private final ReentrantLock scheduleMutationGuard = new ReentrantLock(true);

  @Autowired
  public LexisAdminScheduleService(
      LexisReportScheduleRepository repository,
      PlatformTransactionManager transactionManager,
      ObjectProvider<RedisLeaseService> redisLeaseProvider) {
    this(
        repository,
        LexisBusinessTime.systemClock(),
        scheduleTransactionOperations(transactionManager),
        redisLeaseProvider == null ? null : redisLeaseProvider.getIfAvailable());
  }

  LexisAdminScheduleService(
      LexisReportScheduleRepository repository,
      Clock clock,
      TransactionOperations transactionOperations) {
    this(repository, clock, transactionOperations, null);
  }

  LexisAdminScheduleService(
      LexisReportScheduleRepository repository,
      Clock clock,
      TransactionOperations transactionOperations,
      RedisLeaseService redisLeases) {
    this.repository = repository;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
    this.transactionOperations = transactionOperations;
    this.redisLeases = redisLeases;
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
    return executeScheduleMutation(() -> createScheduleInTransaction(request));
  }

  private ExportScheduleMutationResultDto createScheduleInTransaction(
      ExportScheduleCreateRequestDto request) {
    String validationError = validate(request);
    if (validationError != null) {
      return new ExportScheduleMutationResultDto(false, validationError, null);
    }

    ExportScheduleRowDto row = repository.insertExportSchedule(request);
    return new ExportScheduleMutationResultDto(true, "Export schedule added.", row);
  }

  public ExportScheduleMutationResultDto updateSchedule(
      long exportScheduleId, ExportScheduleCreateRequestDto request) {
    return executeScheduleMutation(() -> updateScheduleInTransaction(exportScheduleId, request));
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

    ExportScheduleRowDto row = repository.updateExportSchedule(exportScheduleId, request);
    return new ExportScheduleMutationResultDto(true, "Export schedule updated.", row);
  }

  public ExportScheduleMutationResultDto deleteSchedule(long exportScheduleId) {
    return executeScheduleMutation(() -> deleteScheduleInTransaction(exportScheduleId));
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
      Supplier<ExportScheduleMutationResultDto> mutation) {
    if (redisLeases != null) {
      return redisLeases.execute(List.of("admin:export-schedule"), () -> executeTransaction(mutation));
    }
    scheduleMutationGuard.lock();
    try {
      return executeTransaction(mutation);
    } finally {
      scheduleMutationGuard.unlock();
    }
  }

  private ExportScheduleMutationResultDto executeTransaction(
      Supplier<ExportScheduleMutationResultDto> mutation) {
    ExportScheduleMutationResultDto result =
        transactionOperations.execute(status -> mutation.get());
    if (result == null) {
      throw new IllegalStateException("Export schedule transaction returned no result.");
    }
    return result;
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

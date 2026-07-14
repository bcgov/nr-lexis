package ca.bc.gov.mof.lexis.service.exemption;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ApplicationUpdateRecord;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository.ExemptionRecord;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository.ExemptionUpdateRecord;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Profile("oracle")
public class ExemptionExpiryProcessor {

  static final String EXPIRY_USER = "EXPIRY_MONITOR";
  static final String EXPIRED_STATUS = "EXP";
  static final String EXPIRY_REMARK_PREFIX = "Exemption expired,";

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionExpiryProcessor.class);

  private final ExemptionDetailsRpcRepository exemptionRepository;
  private final ApplicationDetailsRpcRepository applicationRepository;
  private final PermitRpcRepository permitRepository;
  private final ApplicationEditLockService editLockService;
  private final Clock clock;

  @Autowired
  public ExemptionExpiryProcessor(
      ExemptionDetailsRpcRepository exemptionRepository,
      ApplicationDetailsRpcRepository applicationRepository,
      PermitRpcRepository permitRepository,
      ApplicationEditLockService editLockService) {
    this(
        exemptionRepository,
        applicationRepository,
        permitRepository,
        editLockService,
        Clock.system(ZoneId.of("America/Vancouver")));
  }

  ExemptionExpiryProcessor(
      ExemptionDetailsRpcRepository exemptionRepository,
      ApplicationDetailsRpcRepository applicationRepository,
      PermitRpcRepository permitRepository,
      ApplicationEditLockService editLockService,
      Clock clock) {
    this.exemptionRepository = exemptionRepository;
    this.applicationRepository = applicationRepository;
    this.permitRepository = permitRepository;
    this.editLockService = editLockService;
    this.clock = clock;
  }

  /** Processes one exemption in its own transaction so one bad aggregate cannot poison the run. */
  @Transactional
  public boolean expireOne(String exemptionNumber) {
    List<Long> acquiredApplicationLocks = new ArrayList<>();
    List<Long> acquiredPermitLocks = new ArrayList<>();
    boolean exemptionLockAcquired = false;
    try {
      ApplicationEditLockDto exemptionLock =
          editLockService.acquireExemption(
              exemptionNumber, EXPIRY_USER, EXPIRY_USER, false);
      if (exemptionLock == null || exemptionLock.locked()) {
        LOGGER.info(
            "event=lexis_exemption_expiry operation=expire_one outcome=deferred reason=aggregate_locked exemptionFingerprint={}",
            fingerprint(exemptionNumber));
        return false;
      }
      exemptionLockAcquired = true;

      Optional<ExemptionRecord> exemption =
          exemptionRepository.findExemptionRecord(exemptionNumber);
      if (exemption.isEmpty()) {
        LOGGER.warn(
            "event=lexis_exemption_expiry operation=expire_one outcome=deferred reason=candidate_missing exemptionFingerprint={}",
            fingerprint(exemptionNumber));
        return false;
      }
      if (EXPIRED_STATUS.equalsIgnoreCase(exemption.get().exemptionStatusCode())) {
        return true;
      }

      List<Long> applicationNumbers =
          applicationNumbers(
              exemptionRepository.findApplicationSummariesByExemptionNumber(exemptionNumber));
      List<Long> permitNumbers =
          permitNumbers(exemptionRepository.findPermitsByExemptionNumber(exemptionNumber));

      // Controller mutations acquire aggregate locks in parent -> permit -> application order.
      if (!acquirePermitLocks(permitNumbers, acquiredPermitLocks)
          || !acquireApplicationLocks(applicationNumbers, acquiredApplicationLocks)) {
        LOGGER.info(
            "event=lexis_exemption_expiry operation=expire_one outcome=deferred reason=related_record_locked exemptionFingerprint={}",
            fingerprint(exemptionNumber));
        return false;
      }

      Optional<ExpiryAggregate> currentAggregate =
          reloadUnchangedAggregate(
              exemptionNumber, exemption.get(), applicationNumbers, permitNumbers);
      if (currentAggregate.isEmpty()) {
        LOGGER.info(
            "event=lexis_exemption_expiry operation=expire_one outcome=deferred reason=aggregate_changed exemptionFingerprint={}",
            fingerprint(exemptionNumber));
        return false;
      }

      if (!expireApplications(currentAggregate.get().applications())
          || !expirePermits(currentAggregate.get().permits())) {
        markRollbackOnly();
        LOGGER.warn(
            "event=lexis_exemption_expiry operation=expire_one outcome=deferred reason=child_update_failed exemptionFingerprint={}",
            fingerprint(exemptionNumber));
        return false;
      }

      ExemptionRecord current = currentAggregate.get().exemption();
      boolean updated =
          exemptionRepository.updateExemption(
              new ExemptionUpdateRecord(
                  current.exemptionNumber(),
                  current.exemptionNumber(),
                  current.approvedVolume(),
                  current.approvalDate(),
                  current.expiryDate(),
                  current.otherConditions(),
                  current.exemptionTypeCode(),
                  EXPIRED_STATUS,
                  current.entryUserId(),
                  current.entryTimestamp(),
                  EXPIRY_USER,
                  null));
      if (!updated) {
        markRollbackOnly();
      }
      return updated;
    } finally {
      releaseAggregateLocksAfterTransaction(
          exemptionNumber,
          exemptionLockAcquired,
          acquiredApplicationLocks,
          acquiredPermitLocks);
    }
  }

  private boolean acquireApplicationLocks(
      List<Long> applicationNumbers,
      List<Long> acquiredApplicationLocks) {
    for (Long applicationNumber : applicationNumbers) {
      ApplicationEditLockDto lock =
          editLockService.acquire(applicationNumber, EXPIRY_USER, EXPIRY_USER, false);
      if (lock == null || lock.locked()) {
        return false;
      }
      acquiredApplicationLocks.add(applicationNumber);
    }
    return true;
  }

  private boolean acquirePermitLocks(
      List<Long> permitNumbers,
      List<Long> acquiredPermitLocks) {
    for (Long permitNumber : permitNumbers) {
      ApplicationEditLockDto lock =
          editLockService.acquirePermit(permitNumber, EXPIRY_USER, EXPIRY_USER, false);
      if (lock == null || lock.locked()) {
        return false;
      }
      acquiredPermitLocks.add(permitNumber);
    }
    return true;
  }

  private Optional<ExpiryAggregate> reloadUnchangedAggregate(
      String exemptionNumber,
      ExemptionRecord expectedExemption,
      List<Long> expectedApplicationNumbers,
      List<Long> expectedPermitNumbers) {
    Optional<ExemptionRecord> currentExemption =
        exemptionRepository.findExemptionRecord(exemptionNumber);
    if (currentExemption.isEmpty() || !expectedExemption.equals(currentExemption.get())) {
      return Optional.empty();
    }

    List<Long> currentApplicationNumbers =
        applicationNumbers(
            exemptionRepository.findApplicationSummariesByExemptionNumber(exemptionNumber));
    List<Long> currentPermitNumbers =
        permitNumbers(exemptionRepository.findPermitsByExemptionNumber(exemptionNumber));
    if (!expectedApplicationNumbers.equals(currentApplicationNumbers)
        || !expectedPermitNumbers.equals(currentPermitNumbers)) {
      return Optional.empty();
    }

    List<ApplicationUpdateRecord> applications = new ArrayList<>();
    for (Long applicationNumber : currentApplicationNumbers) {
      Optional<ApplicationUpdateRecord> current =
          applicationRepository.findApplicationUpdateRecord(applicationNumber);
      if (current.isEmpty()
          || !sameExemption(exemptionNumber, current.get().exemptionNumber())) {
        return Optional.empty();
      }
      applications.add(current.get());
    }

    List<PermitMutationRow> permits = new ArrayList<>();
    for (Long permitNumber : currentPermitNumbers) {
      Optional<PermitMutationRow> current =
          permitRepository.findPermitMutationByPermitNumber(permitNumber);
      if (current.isEmpty()
          || !sameExemption(exemptionNumber, current.get().exemptionNumber())) {
        return Optional.empty();
      }
      permits.add(current.get());
    }
    return Optional.of(
        new ExpiryAggregate(
            currentExemption.get(), List.copyOf(applications), List.copyOf(permits)));
  }

  private List<Long> applicationNumbers(
      List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> applications) {
    return applications.stream()
        .map(ExemptionDetailsRpcRepository.ApplicationSummaryRow::applicationNumber)
        .filter(java.util.Objects::nonNull)
        .distinct()
        .sorted()
        .toList();
  }

  private List<Long> permitNumbers(
      List<ExemptionDetailsRpcRepository.PermitSummaryRow> permits) {
    return permits.stream()
        .map(ExemptionDetailsRpcRepository.PermitSummaryRow::permitNumber)
        .filter(java.util.Objects::nonNull)
        .distinct()
        .sorted()
        .toList();
  }

  private boolean sameExemption(String expected, String actual) {
    return normalize(expected).equalsIgnoreCase(normalize(actual));
  }

  private void releaseAggregateLocksAfterTransaction(
      String exemptionNumber,
      boolean exemptionLockAcquired,
      List<Long> applicationNumbers,
      List<Long> permitNumbers) {
    if (!exemptionLockAcquired && applicationNumbers.isEmpty() && permitNumbers.isEmpty()) {
      return;
    }
    Runnable release =
        () -> {
          applicationNumbers.forEach(
              applicationNumber -> editLockService.release(applicationNumber, EXPIRY_USER));
          permitNumbers.forEach(
              permitNumber -> editLockService.releasePermit(permitNumber, EXPIRY_USER));
          if (exemptionLockAcquired) {
            editLockService.releaseExemption(exemptionNumber, EXPIRY_USER);
          }
        };
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      release.run();
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCompletion(int status) {
            release.run();
          }
        });
  }

  private boolean expireApplications(List<ApplicationUpdateRecord> applications) {
    for (ApplicationUpdateRecord current : applications) {
      boolean remarkExists = hasExpiryRemark(current.applicationNumber());
      if (!EXPIRED_STATUS.equalsIgnoreCase(current.applicationStatusCode())
          && !applicationRepository.updateApplication(withExpiredStatus(current))) {
        return false;
      }

      if (!remarkExists) {
        String remark = EXPIRY_REMARK_PREFIX + " " + LocalDate.now(clock);
        Optional<ApplicationDetailsRpcRepository.RemarkRow> insertedRemark =
            applicationRepository.insertRemark(
                current.applicationNumber(), remark, EXPIRY_USER, Instant.now(clock));
        if (insertedRemark
            .filter(row -> matchesExpiryRemark(row, current.applicationNumber(), remark))
            .isEmpty()) {
          return false;
        }
      }
    }
    return true;
  }

  private boolean matchesExpiryRemark(
      ApplicationDetailsRpcRepository.RemarkRow row,
      Long applicationNumber,
      String remark) {
    return row != null
        && row.remarkId() > 0
        && java.util.Objects.equals(row.applicationNumber(), applicationNumber)
        && java.util.Objects.equals(row.remark(), remark)
        && EXPIRY_USER.equalsIgnoreCase(normalize(row.user()));
  }

  private boolean hasExpiryRemark(Long applicationNumber) {
    return applicationRepository.findRemarksByApplicationNumber(applicationNumber).stream()
        .anyMatch(
            remark ->
                EXPIRY_USER.equalsIgnoreCase(normalize(remark.user()))
                    && normalize(remark.remark())
                        .toLowerCase(Locale.ROOT)
                        .startsWith(EXPIRY_REMARK_PREFIX.toLowerCase(Locale.ROOT)));
  }

  private boolean expirePermits(List<PermitMutationRow> permits) {
    for (PermitMutationRow current : permits) {
      if (EXPIRED_STATUS.equalsIgnoreCase(current.permitStatusCode())) {
        continue;
      }
      if (!permitRepository.updatePermitDetail(
          withExpiredStatus(current), EXPIRY_USER, null)) {
        return false;
      }
    }
    return true;
  }

  private ApplicationUpdateRecord withExpiredStatus(ApplicationUpdateRecord row) {
    return new ApplicationUpdateRecord(
        row.applicationNumber(),
        row.federalApplicationNumber(),
        row.applicationDate(),
        row.termDays(),
        row.receivedDate(),
        row.applicationVolume(),
        row.averageLogVolume(),
        row.productLocation(),
        row.entryUserId(),
        row.entryTimestamp(),
        EXPIRY_USER,
        Instant.now(clock),
        row.exportScheduleId(),
        row.agentClientNumber(),
        row.agentClientLocationCode(),
        row.ownerClientNumber(),
        row.ownerClientLocationCode(),
        row.exemptionNumber(),
        row.exemptionReasonCode(),
        EXPIRED_STATUS,
        row.applicantTypeCode(),
        row.orgUnitNumber(),
        row.productTypeCode(),
        row.jurisdictionCode(),
        row.growthTypeCode(),
        row.agentContactName(),
        row.ownerContactName(),
        row.oicIndicator());
  }

  private PermitMutationRow withExpiredStatus(PermitMutationRow row) {
    return new PermitMutationRow(
        row.permitNumber(),
        row.destinationCompanyName(),
        row.transportName(),
        row.estimatedShippingDate(),
        row.otherPortOfExport(),
        row.applicationDate(),
        row.receivedDate(),
        row.permitIssueDate(),
        row.receiptNumber(),
        row.expiryDate(),
        row.permitVolume(),
        row.numberOfPieces(),
        row.feeInLieuVolume(),
        row.federalPermitNumber(),
        row.remarks(),
        row.entryUserId(),
        row.entryTimestamp(),
        row.transportTypeCode(),
        row.scaleMethodCode(),
        row.clientNumber(),
        row.clientLocationCode(),
        row.agentNumber(),
        row.agentLocationCode(),
        row.exemptionNumber(),
        row.orgUnitNo(),
        row.portOfExportCode(),
        EXPIRED_STATUS,
        row.growthTypeCode(),
        row.countryCode(),
        row.overrideFee(),
        row.overrideComment(),
        row.oicApplicationNumber(),
        row.oicRequestPieces(),
        row.oicRequestVolume(),
        row.productTypeCode());
  }

  private String normalize(String value) {
    return value == null ? "" : value.trim();
  }

  private record ExpiryAggregate(
      ExemptionRecord exemption,
      List<ApplicationUpdateRecord> applications,
      List<PermitMutationRow> permits) {}

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Direct unit calls do not have a surrounding Spring transaction.
    }
  }
}

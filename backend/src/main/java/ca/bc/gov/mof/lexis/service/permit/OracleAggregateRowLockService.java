package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository;
import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.RootRecordSnapshot;
import ca.bc.gov.mof.lexis.service.coordination.DistributedLockBusyException;
import ca.bc.gov.mof.lexis.service.coordination.InvalidRecordVersionException;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequest;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequestReader;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import ca.bc.gov.mof.lexis.service.coordination.StaleRecordException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Makes Oracle row locks the final boundary for coordinated aggregate mutations. */
@Service
@Profile("oracle")
public class OracleAggregateRowLockService {

  private final OracleAggregateLockRepository repository;
  private final OptimisticLockRequestReader optimisticLockRequestReader;
  private final OracleOptimisticRecordVersionService versionService;

  public OracleAggregateRowLockService(OracleAggregateLockRepository repository) {
    this(
        repository,
        new OptimisticLockRequestReader(),
        new OracleOptimisticRecordVersionService(repository));
  }

  @Autowired
  public OracleAggregateRowLockService(
      OracleAggregateLockRepository repository,
      OptimisticLockRequestReader optimisticLockRequestReader,
      OracleOptimisticRecordVersionService versionService) {
    this.repository = repository;
    this.optimisticLockRequestReader = optimisticLockRequestReader;
    this.versionService = versionService;
  }

  @Transactional
  public <T> T execute(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    return execute(
        exemptionNumbers, applicationNumbers, List.of(), permitNumbers, operation);
  }

  @Transactional
  public <T> T execute(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> offerNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    Objects.requireNonNull(operation, "operation");
    try {
      List<LockedRecord> lockedRecords = new ArrayList<>();
      normalizeExemptions(exemptionNumbers)
          .forEach(
              value ->
                  lockedRecords.add(
                      lockedRecord(
                          OptimisticRecordType.EXEMPTION,
                          value,
                          repository.lockExemption(value))));
      normalizeNumbers(applicationNumbers, "application")
          .forEach(
              value ->
                  lockedRecords.add(
                      lockedRecord(
                          OptimisticRecordType.APPLICATION,
                          value.toString(),
                          repository.lockApplication(value))));
      normalizeNumbers(offerNumbers, "offer")
          .forEach(
              value ->
                  lockedRecords.add(
                      lockedRecord(
                          OptimisticRecordType.OFFER,
                          value.toString(),
                          repository.lockOffer(value))));
      normalizeNumbers(permitNumbers, "permit")
          .forEach(
              value ->
                  lockedRecords.add(
                      lockedRecord(
                          OptimisticRecordType.PERMIT,
                          value.toString(),
                          repository.lockPermit(value))));
      LockedRecord optimisticTarget = verifyExpectedVersion(lockedRecords);
      T result = operation.get();
      if (TransactionSynchronizationManager.isActualTransactionActive()
          && TransactionAspectSupport.currentTransactionStatus().isRollbackOnly()) {
        throw new CoordinatedRollbackResultException(result);
      }
      publishFreshVersion(optimisticTarget);
      return result;
    } catch (PessimisticLockingFailureException exception) {
      throw new DistributedLockBusyException(
          "Another LEXIS operation is updating the same record. Try again shortly.", exception);
    }
  }

  @Transactional
  public <T> T executeOfferMutation(Long offerNumber, Supplier<T> operation) {
    if (offerNumber == null || offerNumber < 1) {
      throw new IllegalArgumentException("A valid offer number is required.");
    }
    return execute(List.of(), List.of(), List.of(offerNumber), List.of(), operation);
  }

  private LockedRecord lockedRecord(
      OptimisticRecordType recordType,
      String recordId,
      Optional<RootRecordSnapshot> snapshot) {
    Optional<RootRecordSnapshot> safeSnapshot =
        snapshot == null ? Optional.empty() : snapshot;
    return new LockedRecord(
        recordType,
        recordType.normalizeIdentifier(recordId),
        safeSnapshot.map(value -> versionService.toVersion(recordType, recordId, value)));
  }

  private LockedRecord verifyExpectedVersion(List<LockedRecord> lockedRecords) {
    OptimisticLockRequest request = optimisticLockRequestReader.currentRequest();
    if (request.expectedVersion().isEmpty()) {
      return null;
    }
    var expected = request.expectedVersion().orElseThrow();
    LockedRecord target =
        lockedRecords.stream()
            .filter(
                locked ->
                    locked.recordType() == expected.recordType()
                        && locked.recordId().equals(expected.recordId()))
            .findFirst()
            .orElseThrow(
                () ->
                    new InvalidRecordVersionException(
                        "The supplied record version does not belong to this operation.", null));
    OptimisticRecordVersion current = target.version().orElse(null);
    if (current == null || !current.token().equals(expected.token())) {
      throw new StaleRecordException(
          expected.recordType(), expected.recordId(), expected.token(), current);
    }
    return target;
  }

  private void publishFreshVersion(LockedRecord target) {
    if (target == null) {
      return;
    }
    Optional<RootRecordSnapshot> snapshot =
        switch (target.recordType()) {
          case APPLICATION ->
              repository.findApplicationVersion(Long.valueOf(target.recordId()));
          case EXEMPTION -> repository.findExemptionVersion(target.recordId());
          case PERMIT -> repository.findPermitVersion(Long.valueOf(target.recordId()));
          case OFFER -> repository.findOfferVersion(Long.valueOf(target.recordId()));
        };
    if (snapshot != null) {
      snapshot
          .map(
              value ->
                  versionService.toVersion(
                      target.recordType(), target.recordId(), value))
          .ifPresent(optimisticLockRequestReader::publishResponseVersion);
    }
  }

  private List<String> normalizeExemptions(Collection<String> values) {
    if (values == null) {
      throw new IllegalArgumentException("Exemption lock values are required.");
    }
    return values.stream()
        .map(value -> Objects.requireNonNull(value, "exemptionNumber").trim())
        .filter(value -> !value.isEmpty())
        .map(value -> value.toUpperCase(Locale.ROOT))
        .distinct()
        .sorted()
        .toList();
  }

  private List<Long> normalizeNumbers(Collection<Long> values, String label) {
    if (values == null) {
      throw new IllegalArgumentException(label + " lock values are required.");
    }
    return values.stream()
        .map(value -> Objects.requireNonNull(value, label + "Number"))
        .filter(value -> value > 0)
        .distinct()
        .sorted()
        .toList();
  }

  private record LockedRecord(
      OptimisticRecordType recordType,
      String recordId,
      Optional<OptimisticRecordVersion> version) {}
}

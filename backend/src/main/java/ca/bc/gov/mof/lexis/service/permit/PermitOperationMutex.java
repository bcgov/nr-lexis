package ca.bc.gov.mof.lexis.service.permit;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.NavigableSet;
import java.util.Objects;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Serializes local aggregate work and delegates cross-pod correctness to Oracle row locks. */
@Service
public final class PermitOperationMutex {

  private final ConcurrentHashMap<OperationKey, Entry> entries = new ConcurrentHashMap<>();
  private final ThreadLocal<NavigableSet<OperationKey>> heldKeys = new ThreadLocal<>();
  private final OracleAggregateRowLockService oracleRowLocks;

  public PermitOperationMutex() {
    this.oracleRowLocks = null;
  }

  @Autowired
  public PermitOperationMutex(
      ObjectProvider<OracleAggregateRowLockService> oracleRowLockProvider) {
    this.oracleRowLocks =
        oracleRowLockProvider == null ? null : oracleRowLockProvider.getIfAvailable();
  }

  public <T> T execute(Long permitNumber, Supplier<T> operation) {
    validateNumber(permitNumber, "permit");
    return executeKeys(List.of(OperationKey.number(OperationType.PERMIT, permitNumber)), operation);
  }

  public <T> T executeAll(Collection<Long> permitNumbers, Supplier<T> operation) {
    return executeAggregate(List.of(), permitNumbers, operation);
  }

  public <T> T executeExemptions(
      Collection<String> exemptionNumbers, Supplier<T> operation) {
    return executeAggregate(exemptionNumbers, List.of(), List.of(), operation);
  }

  public <T> T executeApplications(
      Collection<Long> applicationNumbers, Supplier<T> operation) {
    return executeAggregate(applicationNumbers, List.of(), operation);
  }

  public <T> T executeAggregate(
      Collection<Long> applicationNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    return executeAggregate(List.of(), applicationNumbers, permitNumbers, operation);
  }

  public <T> T executeAggregate(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    return executeAggregate(
        exemptionNumbers, applicationNumbers, List.of(), permitNumbers, operation);
  }

  public <T> T executeAggregate(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> offerNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    return executeAggregate(
        exemptionNumbers,
        applicationNumbers,
        offerNumbers,
        permitNumbers,
        MutationMode.INTERACTIVE,
        operation);
  }

  public <T> T executeSystemAggregate(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    return executeAggregate(
        exemptionNumbers,
        applicationNumbers,
        List.of(),
        permitNumbers,
        MutationMode.SYSTEM,
        operation);
  }

  public <T> T executeRootCreateAggregate(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    return executeAggregate(
        exemptionNumbers,
        applicationNumbers,
        List.of(),
        permitNumbers,
        MutationMode.ROOT_CREATE,
        operation);
  }

  private <T> T executeAggregate(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> offerNumbers,
      Collection<Long> permitNumbers,
      MutationMode mutationMode,
      Supplier<T> operation) {
    Objects.requireNonNull(exemptionNumbers, "exemptionNumbers");
    Objects.requireNonNull(applicationNumbers, "applicationNumbers");
    Objects.requireNonNull(offerNumbers, "offerNumbers");
    Objects.requireNonNull(permitNumbers, "permitNumbers");
    Objects.requireNonNull(operation, "operation");

    NavigableSet<OperationKey> keys = new TreeSet<>();
    addExemptionKeys(keys, exemptionNumbers);
    addKeys(keys, applicationNumbers, OperationType.APPLICATION, "application");
    addKeys(keys, offerNumbers, OperationType.OFFER, "offer");
    addKeys(keys, permitNumbers, OperationType.PERMIT, "permit");
    if (keys.isEmpty()) {
      throw new IllegalArgumentException("At least one aggregate key is required.");
    }
    return executeKeys(List.copyOf(keys), mutationMode, operation);
  }

  private <T> T executeKeys(List<OperationKey> keys, Supplier<T> operation) {
    return executeKeys(keys, MutationMode.INTERACTIVE, operation);
  }

  private <T> T executeKeys(
      List<OperationKey> keys,
      MutationMode mutationMode,
      Supplier<T> operation) {
    Objects.requireNonNull(operation, "operation");
    return executeInOrder(keys, 0, mutationMode, operation);
  }

  private <T> T executeInOrder(
      List<OperationKey> keys,
      int index,
      MutationMode mutationMode,
      Supplier<T> operation) {
    if (index >= keys.size()) {
      return executeWithOracleRowLocks(keys, mutationMode, operation);
    }
    return executeKey(
        keys.get(index),
        () -> executeInOrder(keys, index + 1, mutationMode, operation));
  }

  private <T> T executeKey(OperationKey key, Supplier<T> operation) {
    NavigableSet<OperationKey> currentHeldKeys = heldKeys.get();
    if (currentHeldKeys != null && currentHeldKeys.contains(key)) {
      return operation.get();
    }
    if (currentHeldKeys != null
        && !currentHeldKeys.isEmpty()
        && key.compareTo(currentHeldKeys.last()) < 0) {
      throw new IllegalStateException(
          "Aggregate operation locks must be acquired in exemption-then-application-then-offer-then-permit order.");
    }

    Entry entry =
        entries.compute(
            key,
            (ignored, current) -> {
              Entry selected = current == null ? new Entry() : current;
              selected.references++;
              return selected;
            });

    boolean acquired = false;
    try {
      entry.lock.lock();
      acquired = true;
      NavigableSet<OperationKey> updatedHeldKeys = heldKeys.get();
      if (updatedHeldKeys == null) {
        updatedHeldKeys = new TreeSet<>();
        heldKeys.set(updatedHeldKeys);
      }
      updatedHeldKeys.add(key);
      try {
        return operation.get();
      } finally {
        updatedHeldKeys.remove(key);
        if (updatedHeldKeys.isEmpty()) {
          heldKeys.remove();
        }
      }
    } finally {
      if (acquired) {
        entry.lock.unlock();
      }
      releaseEntry(key, entry);
    }
  }

  int trackedPermitCount() {
    return (int) entries.keySet().stream().filter(OperationKey::permit).count();
  }

  int trackedOperationCount() {
    return entries.size();
  }

  int trackedExemptionCount() {
    return (int) entries.keySet().stream().filter(OperationKey::exemption).count();
  }

  int trackedOfferCount() {
    return (int) entries.keySet().stream().filter(OperationKey::offer).count();
  }

  private void addExemptionKeys(
      Collection<OperationKey> keys, Collection<String> exemptionNumbers) {
    List<String> snapshot = new ArrayList<>(exemptionNumbers);
    for (String exemptionNumber : snapshot) {
      keys.add(OperationKey.exemption(canonicalExemptionNumber(exemptionNumber)));
    }
  }

  private void addKeys(
      Collection<OperationKey> keys,
      Collection<Long> numbers,
      OperationType type,
      String label) {
    List<Long> snapshot = new ArrayList<>(numbers);
    for (Long number : snapshot) {
      validateNumber(number, label);
      keys.add(OperationKey.number(type, number));
    }
  }

  private void validateNumber(Long number, String label) {
    if (number == null || number < 1) {
      throw new IllegalArgumentException("A valid " + label + " number is required.");
    }
  }

  private String canonicalExemptionNumber(String exemptionNumber) {
    if (exemptionNumber == null || exemptionNumber.isBlank()) {
      throw new IllegalArgumentException("A valid exemption number is required.");
    }
    return exemptionNumber.trim().toUpperCase(Locale.ROOT);
  }

  private void releaseEntry(OperationKey key, Entry entry) {
    entries.compute(
        key,
        (ignored, current) -> {
          if (current != entry) {
            throw new IllegalStateException(
                "Aggregate operation lock entry changed unexpectedly.");
          }
          entry.references--;
          return entry.references == 0 ? null : entry;
        });
  }

  private <T> T executeWithOracleRowLocks(
      Collection<OperationKey> keys,
      MutationMode mutationMode,
      Supplier<T> operation) {
    if (oracleRowLocks == null) {
      return operation.get();
    }
    List<String> exemptionNumbers =
        keys.stream()
            .filter(key -> key.type == OperationType.EXEMPTION)
            .map(OperationKey::textValue)
            .toList();
    List<Long> applicationNumbers =
        keys.stream()
            .filter(key -> key.type == OperationType.APPLICATION)
            .map(OperationKey::numericValue)
            .toList();
    List<Long> permitNumbers =
        keys.stream()
            .filter(key -> key.type == OperationType.PERMIT)
            .map(OperationKey::numericValue)
            .toList();
    List<Long> offerNumbers =
        keys.stream()
            .filter(key -> key.type == OperationType.OFFER)
            .map(OperationKey::numericValue)
            .toList();
    try {
      return switch (mutationMode) {
        case INTERACTIVE ->
            oracleRowLocks.execute(
                exemptionNumbers, applicationNumbers, offerNumbers, permitNumbers, operation);
        case ROOT_CREATE ->
            oracleRowLocks.executeRootCreateMutation(
                exemptionNumbers, applicationNumbers, offerNumbers, permitNumbers, operation);
        case SYSTEM ->
            oracleRowLocks.executeSystemMutation(
                exemptionNumbers, applicationNumbers, offerNumbers, permitNumbers, operation);
      };
    } catch (CoordinatedRollbackResultException exception) {
      return exception.result();
    }
  }

  private static final class Entry {
    private final ReentrantLock lock = new ReentrantLock();
    // Accessed only while ConcurrentHashMap.compute holds this permit key.
    private int references;
  }

  private enum OperationType {
    EXEMPTION,
    APPLICATION,
    OFFER,
    PERMIT
  }

  private enum MutationMode {
    INTERACTIVE,
    ROOT_CREATE,
    SYSTEM
  }

  private record OperationKey(OperationType type, String textValue, Long numericValue)
      implements Comparable<OperationKey> {

    private static OperationKey exemption(String exemptionNumber) {
      return new OperationKey(OperationType.EXEMPTION, exemptionNumber, null);
    }

    private static OperationKey number(OperationType type, Long number) {
      return new OperationKey(type, null, number);
    }

    @Override
    public int compareTo(OperationKey other) {
      int typeOrder = type.compareTo(other.type);
      if (typeOrder != 0) {
        return typeOrder;
      }
      return type == OperationType.EXEMPTION
          ? textValue.compareTo(other.textValue)
          : Long.compare(numericValue, other.numericValue);
    }

    boolean permit() {
      return type == OperationType.PERMIT;
    }

    boolean exemption() {
      return type == OperationType.EXEMPTION;
    }

    boolean offer() {
      return type == OperationType.OFFER;
    }

  }
}

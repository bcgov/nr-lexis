package ca.bc.gov.mof.lexis.service.permit;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.NavigableSet;
import java.util.Objects;
import java.util.TreeSet;
import java.util.function.Supplier;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Service;

/** Coordinates exemption, application, and permit mutations in a consistent lock order. */
@Service
public final class ApplicationPermitOperationCoordinator {

  private static final int MAX_DISCOVERY_ATTEMPTS = 5;

  private final PermitOperationMutex operationMutex;

  public ApplicationPermitOperationCoordinator(PermitOperationMutex operationMutex) {
    this.operationMutex = operationMutex;
  }

  public <T> T executePermitMutation(
      Long permitNumber,
      Supplier<? extends Collection<Long>> applicationDiscovery,
      Supplier<T> operation) {
    return executePermitMutation(
        permitNumber, List::of, applicationDiscovery, operation);
  }

  public <T> T executePermitMutation(
      Long permitNumber,
      Supplier<? extends Collection<String>> exemptionDiscovery,
      Supplier<? extends Collection<Long>> applicationDiscovery,
      Supplier<T> operation) {
    validateNumber(permitNumber, "permit");
    Objects.requireNonNull(exemptionDiscovery, "exemptionDiscovery");
    Objects.requireNonNull(applicationDiscovery, "applicationDiscovery");
    Objects.requireNonNull(operation, "operation");

    NavigableSet<String> expectedExemptions =
        normalizeExemptions(exemptionDiscovery.get());
    NavigableSet<Long> expectedApplications =
        normalizeNumbers(applicationDiscovery.get(), "application");
    for (int attempt = 0; attempt < MAX_DISCOVERY_ATTEMPTS; attempt++) {
      NavigableSet<String> lockedExemptions = new TreeSet<>(expectedExemptions);
      NavigableSet<Long> lockedApplications = new TreeSet<>(expectedApplications);
      DiscoveryAttempt<T> result =
          operationMutex.executeAggregate(
              lockedExemptions,
              lockedApplications,
              List.of(permitNumber),
              () -> {
                NavigableSet<String> actualExemptions =
                    normalizeExemptions(exemptionDiscovery.get());
                NavigableSet<Long> actualApplications =
                    normalizeNumbers(applicationDiscovery.get(), "application");
                if (!lockedExemptions.containsAll(actualExemptions)
                    || !lockedApplications.containsAll(actualApplications)) {
                  return DiscoveryAttempt.retry(
                      actualExemptions, actualApplications);
                }
                return DiscoveryAttempt.completed(operation.get());
              });
      if (!result.retry()) {
        return result.value();
      }
      expectedExemptions.addAll(result.discoveredExemptions());
      expectedApplications.addAll(result.discoveredApplications());
    }
    throw new DataRetrievalFailureException(
        "Permit aggregate relationships changed repeatedly during mutation.");
  }

  public <T> T executeApplicationMutation(
      Long applicationNumber,
      Supplier<? extends Collection<Long>> permitDiscovery,
      Supplier<T> operation) {
    validateNumber(applicationNumber, "application");
    Objects.requireNonNull(permitDiscovery, "permitDiscovery");
    Objects.requireNonNull(operation, "operation");

    return operationMutex.executeApplications(
        List.of(applicationNumber),
        () -> {
          NavigableSet<Long> permitNumbers =
              normalizeNumbers(permitDiscovery.get(), "permit");
          return permitNumbers.isEmpty()
              ? operation.get()
              : operationMutex.executeAll(permitNumbers, operation);
        });
  }

  public <T> T executeExemptionMutation(
      Collection<String> exemptionNumbers,
      Supplier<? extends Collection<Long>> applicationDiscovery,
      Supplier<T> operation) {
    return executeExemptionMutation(
        exemptionNumbers, applicationDiscovery, List::of, operation);
  }

  public <T> T executeExemptionMutation(
      Collection<String> exemptionNumbers,
      Supplier<? extends Collection<Long>> applicationDiscovery,
      Supplier<? extends Collection<Long>> permitDiscovery,
      Supplier<T> operation) {
    NavigableSet<String> lockedExemptions = normalizeExemptions(exemptionNumbers);
    Objects.requireNonNull(applicationDiscovery, "applicationDiscovery");
    Objects.requireNonNull(permitDiscovery, "permitDiscovery");
    Objects.requireNonNull(operation, "operation");

    NavigableSet<Long> expectedApplications =
        normalizeNumbers(applicationDiscovery.get(), "application");
    NavigableSet<Long> expectedPermits =
        normalizeNumbers(permitDiscovery.get(), "permit");
    for (int attempt = 0; attempt < MAX_DISCOVERY_ATTEMPTS; attempt++) {
      NavigableSet<Long> lockedApplications = new TreeSet<>(expectedApplications);
      NavigableSet<Long> lockedPermits = new TreeSet<>(expectedPermits);
      DiscoveryAttempt<T> result =
          operationMutex.executeAggregate(
              lockedExemptions,
              lockedApplications,
              lockedPermits,
              () -> {
                NavigableSet<Long> actualApplications =
                    normalizeNumbers(applicationDiscovery.get(), "application");
                NavigableSet<Long> actualPermits =
                    normalizeNumbers(permitDiscovery.get(), "permit");
                if (!lockedApplications.containsAll(actualApplications)
                    || !lockedPermits.containsAll(actualPermits)) {
                  return DiscoveryAttempt.retry(
                      new TreeSet<>(), actualApplications, actualPermits);
                }
                return DiscoveryAttempt.completed(operation.get());
              });
      if (!result.retry()) {
        return result.value();
      }
      expectedApplications.addAll(result.discoveredApplications());
      expectedPermits.addAll(result.discoveredPermits());
    }
    throw new DataRetrievalFailureException(
        "Exemption application relationships changed repeatedly during mutation.");
  }

  public <T> T executeKnownAggregate(
      Collection<String> exemptionNumbers,
      Collection<Long> applicationNumbers,
      Collection<Long> permitNumbers,
      Supplier<T> operation) {
    return operationMutex.executeAggregate(
        normalizeExemptions(exemptionNumbers),
        normalizeNumbers(applicationNumbers, "application"),
        normalizeNumbers(permitNumbers, "permit"),
        operation);
  }

  public <T> T executeApplicationLocalMutation(
      Long applicationNumber, Supplier<T> operation) {
    validateNumber(applicationNumber, "application");
    Objects.requireNonNull(operation, "operation");
    return operationMutex.executeApplications(List.of(applicationNumber), operation);
  }

  private NavigableSet<Long> normalizeNumbers(Collection<Long> numbers, String label) {
    if (numbers == null) {
      throw new DataRetrievalFailureException(
          "The " + label + " relationship lookup returned no result.");
    }
    NavigableSet<Long> normalized = new TreeSet<>();
    for (Long number : numbers) {
      if (number == null || number < 1) {
        throw new DataRetrievalFailureException(
            "The " + label + " relationship lookup returned an invalid number.");
      }
      normalized.add(number);
    }
    return normalized;
  }

  private NavigableSet<String> normalizeExemptions(
      Collection<String> exemptionNumbers) {
    if (exemptionNumbers == null) {
      throw new DataRetrievalFailureException(
          "The exemption relationship lookup returned no result.");
    }
    NavigableSet<String> normalized = new TreeSet<>();
    for (String exemptionNumber : exemptionNumbers) {
      if (exemptionNumber == null || exemptionNumber.isBlank()) {
        throw new DataRetrievalFailureException(
            "The exemption relationship lookup returned an invalid number.");
      }
      normalized.add(exemptionNumber.trim().toUpperCase(Locale.ROOT));
    }
    return normalized;
  }

  private void validateNumber(Long number, String label) {
    if (number == null || number < 1) {
      throw new IllegalArgumentException("A valid " + label + " number is required.");
    }
  }

  private record DiscoveryAttempt<T>(
      boolean retry,
      T value,
      NavigableSet<String> discoveredExemptions,
      NavigableSet<Long> discoveredApplications,
      NavigableSet<Long> discoveredPermits) {

    private static <T> DiscoveryAttempt<T> retry(
        NavigableSet<String> discoveredExemptions,
        NavigableSet<Long> discoveredApplications) {
      return retry(discoveredExemptions, discoveredApplications, new TreeSet<>());
    }

    private static <T> DiscoveryAttempt<T> retry(
        NavigableSet<String> discoveredExemptions,
        NavigableSet<Long> discoveredApplications,
        NavigableSet<Long> discoveredPermits) {
      return new DiscoveryAttempt<>(
          true,
          null,
          new TreeSet<>(discoveredExemptions),
          new TreeSet<>(discoveredApplications),
          new TreeSet<>(discoveredPermits));
    }

    private static <T> DiscoveryAttempt<T> completed(T value) {
      return new DiscoveryAttempt<>(
          false,
          value,
          new TreeSet<>(),
          new TreeSet<>(),
          new TreeSet<>());
    }
  }
}

package ca.bc.gov.mof.lexis.service.permit;

import static java.util.concurrent.TimeUnit.MILLISECONDS;
import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataRetrievalFailureException;

class ApplicationPermitOperationCoordinatorTest {

  private final PermitOperationMutex mutex = new PermitOperationMutex();
  private final ApplicationPermitOperationCoordinator coordinator =
      new ApplicationPermitOperationCoordinator(mutex);

  @Test
  void permitMutationShouldRetryWhenApplicationRelationshipsGrow() {
    AtomicInteger discoveries = new AtomicInteger();
    AtomicInteger operations = new AtomicInteger();

    String result =
        coordinator.executePermitMutation(
            7000123L,
            () ->
                discoveries.incrementAndGet() == 1
                    ? List.of()
                    : List.of(1000457L, 1000456L, 1000457L),
            () -> {
              operations.incrementAndGet();
              assertThat(mutex.trackedOperationCount()).isEqualTo(3);
              return "completed";
            });

    assertThat(result).isEqualTo("completed");
    assertThat(discoveries).hasValue(3);
    assertThat(operations).hasValue(1);
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void permitMutationShouldRetryWhenExemptionRelationshipChanges() {
    AtomicInteger exemptionDiscoveries = new AtomicInteger();
    AtomicInteger operations = new AtomicInteger();

    String result =
        coordinator.executePermitMutation(
            7000123L,
            () ->
                exemptionDiscoveries.incrementAndGet() == 1
                    ? List.of("EX-205")
                    : List.of("EX-206"),
            () -> List.of(1000456L),
            () -> {
              operations.incrementAndGet();
              assertThat(mutex.trackedOperationCount()).isEqualTo(4);
              return "completed";
            });

    assertThat(result).isEqualTo("completed");
    assertThat(exemptionDiscoveries).hasValue(3);
    assertThat(operations).hasValue(1);
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void caseOnlyExemptionDifferenceShouldNotCauseRetry() {
    AtomicInteger exemptionDiscoveries = new AtomicInteger();
    AtomicInteger operations = new AtomicInteger();

    String result =
        coordinator.executePermitMutation(
            7000123L,
            () ->
                exemptionDiscoveries.incrementAndGet() == 1
                    ? List.of(" ex-205 ")
                    : List.of("EX-205"),
            List::of,
            () -> {
              operations.incrementAndGet();
              return "completed";
            });

    assertThat(result).isEqualTo("completed");
    assertThat(exemptionDiscoveries).hasValue(2);
    assertThat(operations).hasValue(1);
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void exemptionMutationShouldRetryWhenChildRelationshipsGrow() {
    AtomicInteger applicationDiscoveries = new AtomicInteger();
    AtomicInteger permitDiscoveries = new AtomicInteger();
    AtomicInteger operations = new AtomicInteger();

    String result =
        coordinator.executeExemptionMutation(
            List.of("EX-205"),
            () ->
                applicationDiscoveries.incrementAndGet() == 1
                    ? List.of(1000456L)
                    : List.of(1000456L, 1000457L),
            () ->
                permitDiscoveries.incrementAndGet() == 1
                    ? List.of(7000123L)
                    : List.of(7000123L, 7000124L),
            () -> {
              operations.incrementAndGet();
              assertThat(mutex.trackedOperationCount()).isEqualTo(5);
              return "completed";
            });

    assertThat(result).isEqualTo("completed");
    assertThat(applicationDiscoveries).hasValue(3);
    assertThat(permitDiscoveries).hasValue(3);
    assertThat(operations).hasValue(1);
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void exemptionMutationShouldProceedWithConservativeLocksWhenRelationshipsShrink() {
    AtomicInteger applicationDiscoveries = new AtomicInteger();
    AtomicInteger permitDiscoveries = new AtomicInteger();

    String result =
        coordinator.executeExemptionMutation(
            List.of("EX-205"),
            () ->
                applicationDiscoveries.incrementAndGet() == 1
                    ? List.of(1000456L, 1000457L)
                    : List.of(1000456L),
            () ->
                permitDiscoveries.incrementAndGet() == 1
                    ? List.of(7000123L, 7000124L)
                    : List.of(7000123L),
            () -> {
              assertThat(mutex.trackedOperationCount()).isEqualTo(5);
              return "completed";
            });

    assertThat(result).isEqualTo("completed");
    assertThat(applicationDiscoveries).hasValue(2);
    assertThat(permitDiscoveries).hasValue(2);
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void exemptionMutationShouldFailClosedWhenRelationshipsNeverStabilize() {
    AtomicInteger discoveries = new AtomicInteger();
    AtomicInteger operations = new AtomicInteger();

    assertThatThrownBy(
            () ->
                coordinator.executeExemptionMutation(
                    List.of("EX-205"),
                    () ->
                        java.util.stream.LongStream.rangeClosed(
                                1, discoveries.incrementAndGet())
                            .map(value -> 1000000L + value)
                            .boxed()
                            .toList(),
                    List::of,
                    () -> {
                      operations.incrementAndGet();
                      return "not reached";
                    }))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("changed repeatedly");

    assertThat(discoveries).hasValue(6);
    assertThat(operations).hasValue(0);
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void applicationMutationWithoutPermitsShouldStillSerializeByApplication() throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch firstEntered = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondEntered = new CountDownLatch(1);
    try {
      Future<String> first =
          executor.submit(
              () ->
                  coordinator.executeApplicationMutation(
                      1000456L,
                      List::of,
                      () -> {
                        firstEntered.countDown();
                        await(releaseFirst);
                        return "first";
                      }));
      assertThat(firstEntered.await(2, SECONDS)).isTrue();

      Future<String> second =
          executor.submit(
              () ->
                  coordinator.executeApplicationMutation(
                      1000456L,
                      List::of,
                      () -> {
                        secondEntered.countDown();
                        return "second";
                      }));
      assertThat(secondEntered.await(150, MILLISECONDS)).isFalse();

      releaseFirst.countDown();
      assertThat(first.get(2, SECONDS)).isEqualTo("first");
      assertThat(second.get(2, SECONDS)).isEqualTo("second");
      assertThat(mutex.trackedOperationCount()).isZero();
    } finally {
      releaseFirst.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void applicationMutationShouldLockEveryDiscoveredPermit() {
    String result =
        coordinator.executeApplicationMutation(
            1000456L,
            () -> List.of(7000124L, 7000123L, 7000124L),
            () -> {
              assertThat(mutex.trackedOperationCount()).isEqualTo(3);
              return "completed";
            });

    assertThat(result).isEqualTo("completed");
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void linkedPermitAndApplicationMutationsShouldSerializeWithoutBlockingUnrelatedAggregate()
      throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(3);
    CountDownLatch firstEntered = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch reverseEntered = new CountDownLatch(1);
    CountDownLatch unrelatedEntered = new CountDownLatch(1);
    try {
      Future<String> first =
          executor.submit(
              () ->
                  coordinator.executeApplicationMutation(
                      1000456L,
                      () -> List.of(7000123L),
                      () -> {
                        firstEntered.countDown();
                        await(releaseFirst);
                        return "application";
                      }));
      assertThat(firstEntered.await(2, SECONDS)).isTrue();

      Future<String> reverse =
          executor.submit(
              () ->
                  coordinator.executePermitMutation(
                      7000123L,
                      () -> List.of(1000456L),
                      () -> {
                        reverseEntered.countDown();
                        return "permit";
                      }));
      assertThat(reverseEntered.await(150, MILLISECONDS)).isFalse();

      Future<String> unrelated =
          executor.submit(
              () ->
                  coordinator.executePermitMutation(
                      7000124L,
                      () -> List.of(1000457L),
                      () -> {
                        unrelatedEntered.countDown();
                        return "unrelated";
                      }));
      assertThat(unrelatedEntered.await(2, SECONDS)).isTrue();
      assertThat(unrelated.get(2, SECONDS)).isEqualTo("unrelated");

      releaseFirst.countDown();
      assertThat(first.get(2, SECONDS)).isEqualTo("application");
      assertThat(reverse.get(2, SECONDS)).isEqualTo("permit");
      assertThat(mutex.trackedOperationCount()).isZero();
    } finally {
      releaseFirst.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void invalidRelationshipDiscoveryShouldFailClosedAndCleanUp() {
    assertThatThrownBy(
            () ->
                coordinator.executeApplicationMutation(
                    1000456L,
                    () -> java.util.Arrays.asList(7000123L, null),
                    () -> "not reached"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid");

    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void invalidExemptionRelationshipDiscoveryShouldFailClosedAndCleanUp() {
    assertThatThrownBy(
            () ->
                coordinator.executePermitMutation(
                    7000123L,
                    () -> java.util.Arrays.asList("EX-205", null),
                    List::of,
                    () -> "not reached"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid");

    assertThat(mutex.trackedOperationCount()).isZero();
  }

  private static void await(CountDownLatch latch) {
    try {
      if (!latch.await(2, SECONDS)) {
        throw new IllegalStateException("Timed out waiting for test latch.");
      }
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Interrupted while waiting for test latch.", exception);
    }
  }
}

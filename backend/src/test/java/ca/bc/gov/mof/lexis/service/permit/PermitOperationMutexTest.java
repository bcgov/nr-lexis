package ca.bc.gov.mof.lexis.service.permit;

import static java.util.concurrent.TimeUnit.MILLISECONDS;
import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PermitOperationMutexTest {

  private final PermitOperationMutex mutex = new PermitOperationMutex();

  @Test
  void samePermitOperationsShouldNeverOverlapAndShouldCleanUp() throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch firstEntered = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondAttempted = new CountDownLatch(1);
    CountDownLatch secondEntered = new CountDownLatch(1);
    AtomicInteger active = new AtomicInteger();
    AtomicInteger maximumActive = new AtomicInteger();
    try {
      Future<String> first =
          executor.submit(
              () ->
                  mutex.execute(
                      7000123L,
                      () -> {
                        recordActive(active, maximumActive);
                        firstEntered.countDown();
                        await(releaseFirst);
                        active.decrementAndGet();
                        return "first";
                      }));
      assertThat(firstEntered.await(2, SECONDS)).isTrue();

      Future<String> second =
          executor.submit(
              () -> {
                secondAttempted.countDown();
                return mutex.execute(
                    7000123L,
                    () -> {
                      recordActive(active, maximumActive);
                      secondEntered.countDown();
                      active.decrementAndGet();
                      return "second";
                    });
              });
      assertThat(secondAttempted.await(2, SECONDS)).isTrue();
      assertThat(secondEntered.await(150, MILLISECONDS)).isFalse();

      releaseFirst.countDown();
      assertThat(first.get(2, SECONDS)).isEqualTo("first");
      assertThat(second.get(2, SECONDS)).isEqualTo("second");
      assertThat(maximumActive).hasValue(1);
      assertThat(mutex.trackedPermitCount()).isZero();
    } finally {
      releaseFirst.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void differentPermitsShouldRunConcurrently() throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch firstEntered = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondEntered = new CountDownLatch(1);
    try {
      Future<String> first =
          executor.submit(
              () ->
                  mutex.execute(
                      7000123L,
                      () -> {
                        firstEntered.countDown();
                        await(releaseFirst);
                        return "first";
                      }));
      assertThat(firstEntered.await(2, SECONDS)).isTrue();

      Future<String> second =
          executor.submit(
              () ->
                  mutex.execute(
                      7000124L,
                      () -> {
                        secondEntered.countDown();
                        return "second";
                      }));
      assertThat(secondEntered.await(2, SECONDS)).isTrue();

      releaseFirst.countDown();
      assertThat(first.get(2, SECONDS)).isEqualTo("first");
      assertThat(second.get(2, SECONDS)).isEqualTo("second");
      assertThat(mutex.trackedPermitCount()).isZero();
    } finally {
      releaseFirst.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void reversedAndDuplicatePermitSetsShouldSerializeWithoutDeadlock() throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch firstEntered = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondEntered = new CountDownLatch(1);
    try {
      Future<String> first =
          executor.submit(
              () ->
                  mutex.executeAll(
                      List.of(7000124L, 7000123L, 7000124L),
                      () -> {
                        firstEntered.countDown();
                        await(releaseFirst);
                        return "first";
                      }));
      assertThat(firstEntered.await(2, SECONDS)).isTrue();

      Future<String> second =
          executor.submit(
              () ->
                  mutex.executeAll(
                      List.of(7000123L, 7000124L),
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
  void exemptionAliasesShouldSerializeAsOneKeyAndCleanUp() throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch firstEntered = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondEntered = new CountDownLatch(1);
    try {
      Future<String> first =
          executor.submit(
              () ->
                  mutex.executeExemptions(
                      List.of(" ex-205 "),
                      () -> {
                        firstEntered.countDown();
                        await(releaseFirst);
                        return "first";
                      }));
      assertThat(firstEntered.await(2, SECONDS)).isTrue();

      Future<String> second =
          executor.submit(
              () ->
                  mutex.executeExemptions(
                      List.of("EX-205"),
                      () -> {
                        secondEntered.countDown();
                        return "second";
                      }));
      assertThat(secondEntered.await(150, MILLISECONDS)).isFalse();

      releaseFirst.countDown();
      assertThat(first.get(2, SECONDS)).isEqualTo("first");
      assertThat(second.get(2, SECONDS)).isEqualTo("second");
      assertThat(mutex.trackedExemptionCount()).isZero();
    } finally {
      releaseFirst.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void reversedAndDuplicateExemptionSetsShouldSerializeWithoutDeadlock() throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch firstEntered = new CountDownLatch(1);
    CountDownLatch releaseFirst = new CountDownLatch(1);
    CountDownLatch secondEntered = new CountDownLatch(1);
    try {
      Future<String> first =
          executor.submit(
              () ->
                  mutex.executeExemptions(
                      List.of("EX-206", "EX-205", "ex-206"),
                      () -> {
                        firstEntered.countDown();
                        await(releaseFirst);
                        return "first";
                      }));
      assertThat(firstEntered.await(2, SECONDS)).isTrue();

      Future<String> second =
          executor.submit(
              () ->
                  mutex.executeExemptions(
                      List.of("EX-205", "EX-206"),
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
  void applicationThenPermitNestingShouldBeReentrantAndCleanUp() {
    String result =
        mutex.executeApplications(
            List.of(1000456L, 1000456L),
            () ->
                mutex.executeAll(
                    List.of(7000124L, 7000123L),
                    () ->
                        mutex.executeAggregate(
                            List.of(1000456L),
                            List.of(7000123L),
                            () -> {
                              assertThat(mutex.trackedOperationCount()).isEqualTo(3);
                              return "completed";
                            })));

    assertThat(result).isEqualTo("completed");
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void exemptionThenApplicationThenPermitNestingShouldBeReentrantAndCleanUp() {
    String result =
        mutex.executeExemptions(
            List.of("EX-205"),
            () ->
                mutex.executeApplications(
                    List.of(1000456L),
                    () ->
                        mutex.executeAll(
                            List.of(7000123L),
                            () ->
                                mutex.executeAggregate(
                                    List.of("ex-205"),
                                    List.of(1000456L),
                                    List.of(7000123L),
                                    () -> {
                                      assertThat(mutex.trackedOperationCount()).isEqualTo(3);
                                      return "completed";
                                    }))));

    assertThat(result).isEqualTo("completed");
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void nestedLowerOrderShouldFailFastAndReleaseEveryEntry() {
    assertThatThrownBy(
            () ->
                mutex.execute(
                    7000123L,
                    () ->
                        mutex.executeApplications(
                            List.of(1000456L), () -> "not reached")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("exemption-then-application-then-permit order");

    assertThat(mutex.trackedOperationCount()).isZero();
    assertThat(mutex.executeApplications(List.of(1000456L), () -> "recovered"))
        .isEqualTo("recovered");
  }

  @Test
  void aggregateFailureShouldReleaseEveryKey() {
    assertThatThrownBy(
            () ->
                mutex.executeAggregate(
                    List.of(1000456L, 1000457L),
                    List.of(7000123L, 7000124L),
                    () -> {
                      throw new IllegalStateException("failed");
                    }))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("failed");

    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void exemptionAggregateFailureShouldReleaseEveryKey() {
    assertThatThrownBy(
            () ->
                mutex.executeAggregate(
                    List.of("EX-205"),
                    List.of(1000456L),
                    List.of(7000123L),
                    () -> {
                      throw new IllegalStateException("failed");
                    }))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("failed");

    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void invalidAggregateKeysShouldFailBeforeInvokingOperation() {
    AtomicInteger invocations = new AtomicInteger();

    assertThatThrownBy(() -> mutex.executeAll(null, invocations::incrementAndGet))
        .isInstanceOf(NullPointerException.class)
        .hasMessage("permitNumbers");
    assertThatThrownBy(() -> mutex.executeAll(List.of(), invocations::incrementAndGet))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("At least one aggregate key is required.");
    assertThatThrownBy(
            () ->
                mutex.executeAggregate(
                    List.of(1000456L),
                    java.util.Arrays.asList(7000123L, null),
                    invocations::incrementAndGet))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("A valid permit number is required.");
    assertThatThrownBy(
            () ->
                mutex.executeAggregate(
                    List.of(0L), List.of(7000123L), invocations::incrementAndGet))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("A valid application number is required.");
    assertThatThrownBy(
            () ->
                mutex.executeExemptions(
                    java.util.Arrays.asList("EX-205", null),
                    invocations::incrementAndGet))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("A valid exemption number is required.");
    assertThatThrownBy(
            () -> mutex.executeExemptions(List.of("  "), invocations::incrementAndGet))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("A valid exemption number is required.");

    assertThat(invocations).hasValue(0);
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  @Test
  void failureAndReentrantExecutionShouldReleaseEntries() {
    assertThatThrownBy(
            () ->
                mutex.execute(
                    7000123L,
                    () -> {
                      throw new IllegalStateException("failed");
                    }))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("failed");
    assertThat(mutex.trackedPermitCount()).isZero();

    String result =
        mutex.execute(7000123L, () -> mutex.execute(7000123L, () -> "completed"));

    assertThat(result).isEqualTo("completed");
    assertThat(mutex.trackedPermitCount()).isZero();
  }

  @Test
  void concurrentChurnShouldNotRetainPermitEntries() throws Exception {
    ExecutorService executor = Executors.newFixedThreadPool(8);
    try {
      List<Future<Long>> futures = new ArrayList<>();
      for (long operation = 1; operation <= 200; operation++) {
        long permitNumber = 7000000L + (operation % 20);
        futures.add(executor.submit(() -> mutex.execute(permitNumber, () -> permitNumber)));
      }
      for (Future<Long> future : futures) {
        assertThat(future.get(2, SECONDS)).isPositive();
      }
      assertThat(mutex.trackedPermitCount()).isZero();
    } finally {
      executor.shutdownNow();
    }
  }

  private static void recordActive(AtomicInteger active, AtomicInteger maximumActive) {
    int current = active.incrementAndGet();
    maximumActive.accumulateAndGet(current, Math::max);
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

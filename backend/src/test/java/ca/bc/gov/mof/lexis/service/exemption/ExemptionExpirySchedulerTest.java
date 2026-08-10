package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;

@ExtendWith(MockitoExtension.class)
class ExemptionExpirySchedulerTest {

  private static final Instant RUN_INSTANT = Instant.parse("2026-07-11T08:00:00Z");
  private static final ZoneId VANCOUVER = ZoneId.of("America/Vancouver");
  private static final Duration LOCK_AT_MOST_FOR = Duration.ofHours(6);
  private static final Duration LOCK_AT_LEAST_FOR = Duration.ofMinutes(5);

  @Mock private ExemptionExpiryService expiryService;
  @Mock private LockProvider lockProvider;
  @Mock private SimpleLock distributedLock;

  @BeforeEach
  void allowDistributedLockByDefault() {
    lenient().when(lockProvider.lock(any())).thenReturn(Optional.of(distributedLock));
  }

  @Test
  void shouldRecordCompletedRunAndResultCounts() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doReturn(
            new ExemptionExpiryService.ExpiryRunResult(
                3, List.of("EX-1", "EX-2"), List.of("EX-3")))
        .when(expiryService)
        .expireDueExemptions();

    scheduler.expireDueExemptions();

    verify(expiryService).expireDueExemptions();
    verify(distributedLock).unlock();
    assertThat(counter(registry, "completed")).isEqualTo(1d);
    assertThat(counter(registry, "failed")).isZero();
    assertThat(counter(registry, "skipped")).isZero();
    assertThat(gauge(registry, "lexis.expiry.last.completed.timestamp.seconds"))
        .isEqualTo(RUN_INSTANT.getEpochSecond());
    assertThat(gauge(registry, "lexis.expiry.last.failure.timestamp.seconds")).isZero();
    assertThat(gauge(registry, "lexis.expiry.last.candidate.count")).isEqualTo(3d);
    assertThat(gauge(registry, "lexis.expiry.last.expired.count")).isEqualTo(2d);
    assertThat(gauge(registry, "lexis.expiry.last.deferred.count")).isEqualTo(1d);
  }

  @Test
  void shouldRecordSkippedReentryWithoutRunningServiceTwice() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doAnswer(
            invocation -> {
              scheduler.expireDueExemptions();
              return emptyResult();
            })
        .when(expiryService)
        .expireDueExemptions();

    scheduler.expireDueExemptions();

    verify(expiryService, times(1)).expireDueExemptions();
    assertThat(counter(registry, "completed")).isEqualTo(1d);
    assertThat(counter(registry, "failed")).isZero();
    assertThat(counter(registry, "skipped")).isEqualTo(1d);
  }

  @Test
  void shouldUseOneNamedSixHourOracleLeaseWithFiveMinuteMinimum() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();

    scheduler.expireDueExemptions();

    var lockCaptor = ArgumentCaptor.forClass(LockConfiguration.class);
    verify(lockProvider).lock(lockCaptor.capture());
    assertThat(lockCaptor.getValue().getName()).isEqualTo("lexis-exemption-expiry");
    assertThat(lockCaptor.getValue().getLockAtMostFor()).isEqualTo(LOCK_AT_MOST_FOR);
    assertThat(lockCaptor.getValue().getLockAtLeastFor()).isEqualTo(LOCK_AT_LEAST_FOR);
  }

  @Test
  void scheduledTriggerShouldStayPinnedToTheConfiguredExpiryZone() throws NoSuchMethodException {
    Scheduled schedule =
        ExemptionExpiryScheduler.class
            .getDeclaredMethod("expireDueExemptions")
            .getAnnotation(Scheduled.class);

    assertThat(schedule.cron()).isEqualTo("${lexis.expiry.cron:30 0 0 * * *}");
    assertThat(schedule.zone()).isEqualTo("${lexis.expiry.zone:America/Vancouver}");
  }

  @Test
  void runDateShouldAdvanceAtVancouverMidnightWhenClockUsesUtc() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    MutableClock clock = new MutableClock(Instant.parse("2026-07-11T06:59:00Z"));
    ExemptionExpiryScheduler scheduler = scheduler(registry, clock);
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();

    scheduler.expireDueExemptions();
    clock.setInstant(Instant.parse("2026-07-11T07:01:00Z"));
    scheduler.expireDueExemptions();

    verify(expiryService, times(2)).expireDueExemptions();
    assertThat(counter(registry, "completed")).isEqualTo(2d);
  }

  @Test
  void heldDistributedLockShouldSkipWithoutRunningExpiry() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doReturn(Optional.empty()).when(lockProvider).lock(any());

    scheduler.expireDueExemptions();

    verifyNoInteractions(expiryService);
    assertThat(counter(registry, "completed")).isZero();
    assertThat(counter(registry, "failed")).isZero();
    assertThat(counter(registry, "skipped")).isEqualTo(1d);
  }

  @Test
  void sharedProviderShouldAllowOnlyOneSchedulerWhileFirstRunIsOpen() throws Exception {
    ExemptionExpiryService firstService = org.mockito.Mockito.mock(ExemptionExpiryService.class);
    ExemptionExpiryService secondService = org.mockito.Mockito.mock(ExemptionExpiryService.class);
    LockProvider sharedProvider = new SingleHolderLockProvider();
    SimpleMeterRegistry firstRegistry = new SimpleMeterRegistry();
    SimpleMeterRegistry secondRegistry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler firstScheduler =
        scheduler(firstService, sharedProvider, firstRegistry, fixedClock());
    ExemptionExpiryScheduler secondScheduler =
        scheduler(secondService, sharedProvider, secondRegistry, fixedClock());
    CountDownLatch firstRunStarted = new CountDownLatch(1);
    CountDownLatch releaseFirstRun = new CountDownLatch(1);
    doAnswer(
            invocation -> {
              firstRunStarted.countDown();
              if (!releaseFirstRun.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release first expiry run");
              }
              return emptyResult();
            })
        .when(firstService)
        .expireDueExemptions();
    ExecutorService executor = Executors.newSingleThreadExecutor();

    try {
      Future<?> firstRun = executor.submit(firstScheduler::expireDueExemptions);
      assertThat(firstRunStarted.await(5, TimeUnit.SECONDS)).isTrue();

      secondScheduler.expireDueExemptions();

      verifyNoInteractions(secondService);
      assertThat(counter(secondRegistry, "skipped")).isEqualTo(1d);
      releaseFirstRun.countDown();
      firstRun.get(5, TimeUnit.SECONDS);
      verify(firstService).expireDueExemptions();
      assertThat(counter(firstRegistry, "completed")).isEqualTo(1d);
    } finally {
      releaseFirstRun.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void unavailableLockTableShouldSkipAndAllowLaterRetry() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doThrow(new IllegalStateException("ORA-00942"))
        .doReturn(Optional.of(distributedLock))
        .when(lockProvider)
        .lock(any());
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();

    assertThatCode(scheduler::expireDueExemptions).doesNotThrowAnyException();
    scheduler.expireDueExemptions();

    verify(expiryService, times(1)).expireDueExemptions();
    assertThat(counter(registry, "completed")).isEqualTo(1d);
    assertThat(counter(registry, "failed")).isZero();
    assertThat(counter(registry, "skipped")).isEqualTo(1d);
  }

  @Test
  void shouldRecordFailureAndReleaseLocalGuard() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doThrow(new IllegalStateException("Oracle failed"))
        .doReturn(emptyResult())
        .when(expiryService)
        .expireDueExemptions();

    assertThatThrownBy(scheduler::expireDueExemptions).isInstanceOf(IllegalStateException.class);
    assertThat(counter(registry, "failed")).isEqualTo(1d);
    assertThat(gauge(registry, "lexis.expiry.last.failure.timestamp.seconds"))
        .isEqualTo(RUN_INSTANT.getEpochSecond());
    assertThat(gauge(registry, "lexis.expiry.last.completed.timestamp.seconds")).isZero();
    scheduler.expireDueExemptions();

    verify(expiryService, times(2)).expireDueExemptions();
    verify(distributedLock, times(2)).unlock();
    assertThat(counter(registry, "completed")).isEqualTo(1d);
  }

  @Test
  void unlockFailureAfterSuccessfulExpiryShouldFailTheRun() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();
    doThrow(new IllegalStateException("Unlock failed")).when(distributedLock).unlock();

    assertThatThrownBy(scheduler::expireDueExemptions)
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Unlock failed");

    assertThat(counter(registry, "completed")).isZero();
    assertThat(counter(registry, "failed")).isEqualTo(1d);
    assertThat(counter(registry, "skipped")).isZero();
  }

  @Test
  void unlockFailureShouldBeSuppressedOnOriginalExpiryFailure() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    IllegalStateException expiryFailure = new IllegalStateException("Expiry failed");
    IllegalStateException unlockFailure = new IllegalStateException("Unlock failed");
    doThrow(expiryFailure).when(expiryService).expireDueExemptions();
    doThrow(unlockFailure).when(distributedLock).unlock();

    RuntimeException thrown = null;
    try {
      scheduler.expireDueExemptions();
    } catch (RuntimeException ex) {
      thrown = ex;
    }

    assertThat(thrown).isSameAs(expiryFailure);
    assertThat(thrown.getSuppressed()).containsExactly(unlockFailure);
    assertThat(counter(registry, "completed")).isZero();
    assertThat(counter(registry, "failed")).isEqualTo(1d);
  }

  @Test
  void failureShouldPreserveLastCompletedRunGauges() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    MutableClock clock = new MutableClock(RUN_INSTANT);
    ExemptionExpiryScheduler scheduler = scheduler(registry, clock);
    doReturn(
            new ExemptionExpiryService.ExpiryRunResult(
                2, List.of("EX-1"), List.of("EX-2")))
        .doThrow(new IllegalStateException("Oracle failed"))
        .when(expiryService)
        .expireDueExemptions();

    scheduler.expireDueExemptions();
    Instant failureInstant = RUN_INSTANT.plusSeconds(24 * 60 * 60);
    clock.setInstant(failureInstant);
    assertThatThrownBy(scheduler::expireDueExemptions).isInstanceOf(IllegalStateException.class);

    assertThat(counter(registry, "completed")).isEqualTo(1d);
    assertThat(counter(registry, "failed")).isEqualTo(1d);
    assertThat(gauge(registry, "lexis.expiry.last.completed.timestamp.seconds"))
        .isEqualTo(RUN_INSTANT.getEpochSecond());
    assertThat(gauge(registry, "lexis.expiry.last.failure.timestamp.seconds"))
        .isEqualTo(failureInstant.getEpochSecond());
    assertThat(gauge(registry, "lexis.expiry.last.candidate.count")).isEqualTo(2d);
    assertThat(gauge(registry, "lexis.expiry.last.expired.count")).isEqualTo(1d);
    assertThat(gauge(registry, "lexis.expiry.last.deferred.count")).isEqualTo(1d);
  }

  private ExemptionExpiryScheduler scheduler(SimpleMeterRegistry registry) {
    return scheduler(registry, fixedClock());
  }

  private ExemptionExpiryScheduler scheduler(SimpleMeterRegistry registry, Clock clock) {
    return scheduler(expiryService, lockProvider, registry, clock);
  }

  private ExemptionExpiryScheduler scheduler(
      ExemptionExpiryService service,
      LockProvider provider,
      SimpleMeterRegistry registry,
      Clock clock) {
    return new ExemptionExpiryScheduler(
        service,
        provider,
        registry,
        clock,
        VANCOUVER,
        LOCK_AT_MOST_FOR,
        LOCK_AT_LEAST_FOR);
  }

  private Clock fixedClock() {
    return Clock.fixed(RUN_INSTANT, ZoneOffset.UTC);
  }

  private ExemptionExpiryService.ExpiryRunResult emptyResult() {
    return new ExemptionExpiryService.ExpiryRunResult(0, List.of(), List.of());
  }

  private double counter(SimpleMeterRegistry registry, String outcome) {
    return registry
        .get("lexis.expiry.runs")
        .tag("outcome", outcome)
        .counter()
        .count();
  }

  private double gauge(SimpleMeterRegistry registry, String name) {
    return registry.get(name).gauge().value();
  }

  private static final class MutableClock extends Clock {

    private Instant instant;

    private MutableClock(Instant instant) {
      this.instant = instant;
    }

    void setInstant(Instant instant) {
      this.instant = instant;
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return Clock.fixed(instant, zone);
    }

    @Override
    public Instant instant() {
      return instant;
    }
  }

  private static final class SingleHolderLockProvider implements LockProvider {

    private final AtomicBoolean held = new AtomicBoolean();

    @Override
    public Optional<SimpleLock> lock(LockConfiguration lockConfiguration) {
      if (!held.compareAndSet(false, true)) {
        return Optional.empty();
      }
      return Optional.of(() -> held.set(false));
    }
  }
}

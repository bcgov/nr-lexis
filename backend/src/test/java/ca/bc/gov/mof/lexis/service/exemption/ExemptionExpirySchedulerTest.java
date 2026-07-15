package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ExemptionExpirySchedulerTest {

  private static final Instant RUN_INSTANT = Instant.parse("2026-07-11T08:00:00Z");
  private static final ZoneId VANCOUVER = ZoneId.of("America/Vancouver");
  private static final Duration LOCK_AT_MOST_FOR = Duration.ofHours(6);
  private static final Duration LOCK_AT_LEAST_FOR = Duration.ZERO;

  @Mock private ExemptionExpiryService expiryService;
  @Mock private LockProvider lockProvider;
  @Mock private SimpleLock distributedLock;
  @Mock private RedisExpiryRunLedger completionLedger;

  @Test
  void shouldRecordCompletedRunAndResultCounts() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    allowLock();
    doReturn(
            new ExemptionExpiryService.ExpiryRunResult(
                3, List.of("EX-1", "EX-2"), List.of("EX-3")))
        .when(expiryService)
        .expireDueExemptions();

    scheduler.expireDueExemptions();

    verify(expiryService).expireDueExemptions();
    verify(completionLedger).markCompleted(LocalDate.of(2026, 7, 11));
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
    allowLock();
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
  void shouldRecordFailureAndReleaseLocalGuard() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    allowLock();
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
  void failureShouldPreserveLastCompletedRunGauges() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    MutableClock clock = new MutableClock(RUN_INSTANT);
    ExemptionExpiryScheduler scheduler = scheduler(registry, clock);
    allowLock();
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

  @Test
  void startupBeforeLegacyThresholdShouldWaitForScheduledRun() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler =
        scheduler(
            registry,
            Clock.fixed(Instant.parse("2026-07-11T07:00:29Z"), ZoneOffset.UTC));

    scheduler.catchUpExpiryAfterStartup();

    verify(expiryService, times(0)).expireDueExemptions();
    assertThat(counter(registry, "completed")).isZero();
    assertThat(counter(registry, "failed")).isZero();
    assertThat(counter(registry, "skipped")).isZero();
  }

  @Test
  void startupAfterLegacyThresholdShouldRunOnceForVancouverDate() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler =
        scheduler(
            registry,
            Clock.fixed(Instant.parse("2026-07-11T07:00:31Z"), ZoneOffset.UTC));
    allowLock();
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();

    scheduler.catchUpExpiryAfterStartup();
    scheduler.catchUpExpiryAfterStartup();
    scheduler.expireDueExemptions();

    verify(expiryService, times(1)).expireDueExemptions();
    assertThat(counter(registry, "completed")).isEqualTo(1d);
    assertThat(counter(registry, "failed")).isZero();
    assertThat(counter(registry, "skipped")).isEqualTo(2d);
  }

  @Test
  void startupFailureShouldNotEscapeAndShouldReleaseDateForCronRetry() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    allowLock();
    doThrow(new IllegalStateException("Oracle failed"))
        .doReturn(emptyResult())
        .when(expiryService)
        .expireDueExemptions();

    assertThatCode(scheduler::catchUpExpiryAfterStartup).doesNotThrowAnyException();
    scheduler.expireDueExemptions();

    verify(expiryService, times(2)).expireDueExemptions();
    assertThat(counter(registry, "completed")).isEqualTo(1d);
    assertThat(counter(registry, "failed")).isEqualTo(1d);
    assertThat(counter(registry, "skipped")).isZero();
  }

  @Test
  void distributedLockContentionShouldSkipWithoutClaimingTheDate() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doReturn(Optional.empty(), Optional.of(distributedLock))
        .when(lockProvider)
        .lock(any(LockConfiguration.class));
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();

    scheduler.expireDueExemptions();
    scheduler.expireDueExemptions();

    verify(expiryService).expireDueExemptions();
    verify(distributedLock).unlock();
    assertThat(counter(registry, "completed")).isEqualTo(1d);
    assertThat(counter(registry, "skipped")).isEqualTo(1d);
  }

  @Test
  void completedDateShouldBeSharedAcrossSchedulerInstances() {
    AtomicBoolean completed = new AtomicBoolean();
    doAnswer(invocation -> completed.get())
        .when(completionLedger)
        .completed(any(LocalDate.class));
    doAnswer(
            invocation -> {
              completed.set(true);
              return null;
            })
        .when(completionLedger)
        .markCompleted(any(LocalDate.class));
    allowLock();
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();
    SimpleMeterRegistry firstRegistry = new SimpleMeterRegistry();
    SimpleMeterRegistry secondRegistry = new SimpleMeterRegistry();

    scheduler(firstRegistry).expireDueExemptions();
    scheduler(secondRegistry).expireDueExemptions();

    verify(expiryService).expireDueExemptions();
    verify(distributedLock, times(2)).unlock();
    assertThat(counter(firstRegistry, "completed")).isEqualTo(1d);
    assertThat(counter(secondRegistry, "skipped")).isEqualTo(1d);
  }

  @Test
  void redisFailureShouldFailClosedForScheduledRun() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doThrow(new IllegalStateException("Redis unavailable"))
        .when(lockProvider)
        .lock(any(LockConfiguration.class));

    assertThatThrownBy(scheduler::expireDueExemptions).isInstanceOf(IllegalStateException.class);

    verifyNoInteractions(expiryService);
    verify(distributedLock, never()).unlock();
    assertThat(counter(registry, "failed")).isEqualTo(1d);
    assertThat(counter(registry, "completed")).isZero();
  }

  @Test
  void redisFailureDuringStartupCatchUpShouldNotFailApplicationStartup() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    doThrow(new IllegalStateException("Redis unavailable"))
        .when(lockProvider)
        .lock(any(LockConfiguration.class));

    assertThatCode(scheduler::catchUpExpiryAfterStartup).doesNotThrowAnyException();

    verifyNoInteractions(expiryService);
    assertThat(counter(registry, "failed")).isEqualTo(1d);
  }

  @Test
  void shouldUseTheConfiguredShedLockNameAndDurations() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ExemptionExpiryScheduler scheduler = scheduler(registry);
    allowLock();
    doReturn(emptyResult()).when(expiryService).expireDueExemptions();

    scheduler.expireDueExemptions();

    ArgumentCaptor<LockConfiguration> configuration =
        ArgumentCaptor.forClass(LockConfiguration.class);
    verify(lockProvider).lock(configuration.capture());
    assertThat(configuration.getValue().getName()).isEqualTo("lexis-exemption-expiry");
    assertThat(configuration.getValue().getLockAtMostFor()).isEqualTo(LOCK_AT_MOST_FOR);
    assertThat(configuration.getValue().getLockAtLeastFor()).isEqualTo(LOCK_AT_LEAST_FOR);
  }

  private ExemptionExpiryScheduler scheduler(SimpleMeterRegistry registry) {
    return scheduler(registry, Clock.fixed(RUN_INSTANT, ZoneOffset.UTC));
  }

  private ExemptionExpiryScheduler scheduler(SimpleMeterRegistry registry, Clock clock) {
    return new ExemptionExpiryScheduler(
        expiryService,
        lockProvider,
        completionLedger,
        registry,
        clock,
        VANCOUVER,
        LOCK_AT_MOST_FOR,
        LOCK_AT_LEAST_FOR);
  }

  private void allowLock() {
    doReturn(Optional.of(distributedLock))
        .when(lockProvider)
        .lock(any(LockConfiguration.class));
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
}

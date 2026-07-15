package ca.bc.gov.mof.lexis.service.exemption;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
@ConditionalOnProperty(prefix = "lexis.expiry", name = "enabled", havingValue = "true")
public class ExemptionExpiryScheduler {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionExpiryScheduler.class);
  private static final String RUN_METRIC = "lexis.expiry.runs";
  private static final String LOCK_NAME = "lexis-exemption-expiry";
  private static final LocalTime LEGACY_DAILY_RUN_TIME = LocalTime.of(0, 0, 30);

  private final ExemptionExpiryService expiryService;
  private final LockProvider lockProvider;
  private final RedisExpiryRunLedger completionLedger;
  private final Clock clock;
  private final ZoneId expiryZone;
  private final Duration lockAtMostFor;
  private final Duration lockAtLeastFor;
  private final AtomicBoolean running = new AtomicBoolean();
  private final AtomicReference<LocalDate> claimedRunDate = new AtomicReference<>();
  private final Counter completedRuns;
  private final Counter failedRuns;
  private final Counter skippedRuns;
  private final AtomicLong lastCompletedTimestamp = new AtomicLong();
  private final AtomicLong lastFailureTimestamp = new AtomicLong();
  private final AtomicLong lastCandidateCount = new AtomicLong();
  private final AtomicLong lastExpiredCount = new AtomicLong();
  private final AtomicLong lastDeferredCount = new AtomicLong();

  @Autowired
  public ExemptionExpiryScheduler(
      ExemptionExpiryService expiryService,
      LockProvider lockProvider,
      RedisExpiryRunLedger completionLedger,
      MeterRegistry meterRegistry,
      @Value("${lexis.expiry.zone:America/Vancouver}") String expiryZone,
      @Value("${lexis.expiry.lock-at-most-for:PT6H}") String lockAtMostFor,
      @Value("${lexis.expiry.lock-at-least-for:PT0S}") String lockAtLeastFor) {
    this(
        expiryService,
        lockProvider,
        completionLedger,
        meterRegistry,
        Clock.systemUTC(),
        ZoneId.of(expiryZone),
        Duration.parse(lockAtMostFor),
        Duration.parse(lockAtLeastFor));
  }

  ExemptionExpiryScheduler(
      ExemptionExpiryService expiryService,
      LockProvider lockProvider,
      RedisExpiryRunLedger completionLedger,
      MeterRegistry meterRegistry,
      Clock clock,
      ZoneId expiryZone,
      Duration lockAtMostFor,
      Duration lockAtLeastFor) {
    this.expiryService = Objects.requireNonNull(expiryService, "expiryService");
    this.lockProvider = Objects.requireNonNull(lockProvider, "lockProvider");
    this.completionLedger = Objects.requireNonNull(completionLedger, "completionLedger");
    MeterRegistry registry = Objects.requireNonNull(meterRegistry, "meterRegistry");
    this.clock = Objects.requireNonNull(clock, "clock");
    this.expiryZone = Objects.requireNonNull(expiryZone, "expiryZone");
    this.lockAtMostFor = positive(lockAtMostFor, "lockAtMostFor");
    this.lockAtLeastFor = nonNegative(lockAtLeastFor, "lockAtLeastFor");
    if (this.lockAtLeastFor.compareTo(this.lockAtMostFor) > 0) {
      throw new IllegalArgumentException("lockAtLeastFor must not exceed lockAtMostFor");
    }
    this.completedRuns = runCounter(registry, "completed");
    this.failedRuns = runCounter(registry, "failed");
    this.skippedRuns = runCounter(registry, "skipped");
    registerGauge(
        registry, "lexis.expiry.last.completed.timestamp.seconds", lastCompletedTimestamp);
    registerGauge(
        registry, "lexis.expiry.last.failure.timestamp.seconds", lastFailureTimestamp);
    registerGauge(registry, "lexis.expiry.last.candidate.count", lastCandidateCount);
    registerGauge(registry, "lexis.expiry.last.expired.count", lastExpiredCount);
    registerGauge(registry, "lexis.expiry.last.deferred.count", lastDeferredCount);
  }

  @Scheduled(
      cron = "${lexis.expiry.cron:30 0 0 * * *}",
      zone = "${lexis.expiry.zone:America/Vancouver}")
  public void expireDueExemptions() {
    runForCurrentLocalDate("scheduled_run");
  }

  @EventListener(ApplicationReadyEvent.class)
  public void catchUpExpiryAfterStartup() {
    if (currentLocalTime().isBefore(LEGACY_DAILY_RUN_TIME)) {
      return;
    }
    try {
      runForCurrentLocalDate("startup_catch_up");
    } catch (RuntimeException ignored) {
      // The scheduled run remains available for retry. A dependency failure during catch-up must
      // not turn an otherwise healthy deployment into an application restart loop.
      LOGGER.warn("event=lexis_exemption_expiry operation=startup_catch_up outcome=deferred");
    }
  }

  private void runForCurrentLocalDate(String operation) {
    if (!running.compareAndSet(false, true)) {
      skippedRuns.increment();
      LOGGER.info(
          "event=lexis_exemption_expiry operation={} outcome=skipped reason=already_running",
          operation);
      return;
    }
    LocalDate runDate = currentLocalDate();
    boolean dateClaimed = false;
    try {
      if (runDate.equals(claimedRunDate.get())) {
        skippedRuns.increment();
        LOGGER.info(
            "event=lexis_exemption_expiry operation={} outcome=skipped reason=date_already_processed",
            operation);
        return;
      }

      Optional<SimpleLock> distributedLock =
          lockProvider.lock(
              new LockConfiguration(
                  clock.instant(), LOCK_NAME, lockAtMostFor, lockAtLeastFor));
      if (distributedLock.isEmpty()) {
        skippedRuns.increment();
        LOGGER.info(
            "event=lexis_exemption_expiry operation={} outcome=skipped reason=distributed_lock_held",
            operation);
        return;
      }

      claimedRunDate.set(runDate);
      dateClaimed = true;

      Optional<ExemptionExpiryService.ExpiryRunResult> result =
          expireDueExemptionsAndRelease(distributedLock.orElseThrow(), runDate);
      if (result.isEmpty()) {
        skippedRuns.increment();
        LOGGER.info(
            "event=lexis_exemption_expiry operation={} outcome=skipped reason=date_already_processed",
            operation);
        return;
      }
      ExemptionExpiryService.ExpiryRunResult completedResult = result.orElseThrow();
      lastCandidateCount.set(completedResult.candidateCount());
      lastExpiredCount.set(completedResult.expiredExemptions().size());
      lastDeferredCount.set(completedResult.deferredExemptions().size());
      lastCompletedTimestamp.set(clock.instant().getEpochSecond());
      completedRuns.increment();
    } catch (RuntimeException ex) {
      if (dateClaimed) {
        claimedRunDate.compareAndSet(runDate, null);
      }
      lastFailureTimestamp.set(clock.instant().getEpochSecond());
      failedRuns.increment();
      LOGGER.error(
          "event=lexis_exemption_expiry operation={} outcome=failed failureType={}",
          operation,
          exceptionType(ex));
      throw ex;
    } finally {
      running.set(false);
    }
  }

  private Optional<ExemptionExpiryService.ExpiryRunResult> expireDueExemptionsAndRelease(
      SimpleLock lock, LocalDate runDate) {
    RuntimeException failure = null;
    try {
      if (completionLedger.completed(runDate)) {
        return Optional.empty();
      }
      ExemptionExpiryService.ExpiryRunResult result = expiryService.expireDueExemptions();
      completionLedger.markCompleted(runDate);
      return Optional.of(result);
    } catch (RuntimeException ex) {
      failure = ex;
      throw ex;
    } finally {
      try {
        lock.unlock();
      } catch (RuntimeException unlockFailure) {
        if (failure == null) {
          throw unlockFailure;
        }
        failure.addSuppressed(unlockFailure);
      }
    }
  }

  private LocalDate currentLocalDate() {
    return LocalDate.ofInstant(clock.instant(), expiryZone);
  }

  private LocalTime currentLocalTime() {
    return LocalTime.ofInstant(clock.instant(), expiryZone);
  }

  private Counter runCounter(MeterRegistry registry, String outcome) {
    return Counter.builder(RUN_METRIC)
        .description("Number of exemption expiry scheduler runs by outcome")
        .tag("outcome", outcome)
        .register(registry);
  }

  private void registerGauge(MeterRegistry registry, String name, AtomicLong value) {
    Gauge.builder(name, value, AtomicLong::get).register(registry);
  }

  private static Duration positive(Duration value, String name) {
    Objects.requireNonNull(value, name);
    if (value.isZero() || value.isNegative()) {
      throw new IllegalArgumentException(name + " must be positive");
    }
    return value;
  }

  private static Duration nonNegative(Duration value, String name) {
    Objects.requireNonNull(value, name);
    if (value.isNegative()) {
      throw new IllegalArgumentException(name + " must not be negative");
    }
    return value;
  }
}

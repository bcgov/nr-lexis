package ca.bc.gov.mof.lexis.service.exemption;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
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
  private static final LocalTime LEGACY_DAILY_RUN_TIME = LocalTime.of(0, 0, 30);
  private static final ZoneId DEFAULT_EXPIRY_ZONE = ZoneId.of("America/Vancouver");

  private final ExemptionExpiryService expiryService;
  private final Clock clock;
  private final ZoneId expiryZone;
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

  public ExemptionExpiryScheduler(
      ExemptionExpiryService expiryService, MeterRegistry meterRegistry) {
    this(expiryService, meterRegistry, Clock.systemUTC(), DEFAULT_EXPIRY_ZONE);
  }

  @Autowired
  public ExemptionExpiryScheduler(
      ExemptionExpiryService expiryService,
      MeterRegistry meterRegistry,
      @Value("${lexis.expiry.zone:America/Vancouver}") String expiryZone) {
    this(expiryService, meterRegistry, Clock.systemUTC(), ZoneId.of(expiryZone));
  }

  ExemptionExpiryScheduler(
      ExemptionExpiryService expiryService, MeterRegistry meterRegistry, Clock clock) {
    this(expiryService, meterRegistry, clock, DEFAULT_EXPIRY_ZONE);
  }

  ExemptionExpiryScheduler(
      ExemptionExpiryService expiryService,
      MeterRegistry meterRegistry,
      Clock clock,
      ZoneId expiryZone) {
    this.expiryService = Objects.requireNonNull(expiryService, "expiryService");
    MeterRegistry registry = Objects.requireNonNull(meterRegistry, "meterRegistry");
    this.clock = Objects.requireNonNull(clock, "clock");
    this.expiryZone = Objects.requireNonNull(expiryZone, "expiryZone");
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
      claimedRunDate.set(runDate);
      dateClaimed = true;

      ExemptionExpiryService.ExpiryRunResult result = expiryService.expireDueExemptions();
      lastCandidateCount.set(result.candidateCount());
      lastExpiredCount.set(result.expiredExemptions().size());
      lastDeferredCount.set(result.deferredExemptions().size());
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
}

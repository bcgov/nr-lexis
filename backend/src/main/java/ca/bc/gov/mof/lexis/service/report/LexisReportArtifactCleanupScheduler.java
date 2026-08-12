package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Removes orphaned report artifacts from each backend pod's local temporary storage. */
@Service
public class LexisReportArtifactCleanupScheduler {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(LexisReportArtifactCleanupScheduler.class);

  private final LexisReportResourceManager reportResources;
  private final Duration staleAfter;
  private final Clock clock;

  @Autowired
  public LexisReportArtifactCleanupScheduler(
      LexisReportResourceManager reportResources, LexisReportResourceProperties properties) {
    this(
        reportResources,
        Duration.ofMinutes(
            Objects.requireNonNull(properties, "properties").getArtifactStaleAfterMinutes()),
        Clock.systemUTC());
  }

  LexisReportArtifactCleanupScheduler(
      LexisReportResourceManager reportResources, Duration staleAfter, Clock clock) {
    this.reportResources = Objects.requireNonNull(reportResources, "reportResources");
    this.staleAfter = Objects.requireNonNull(staleAfter, "staleAfter");
    this.clock = Objects.requireNonNull(clock, "clock");
    if (staleAfter.isZero() || staleAfter.isNegative()) {
      throw new IllegalArgumentException("staleAfter must be positive");
    }
  }

  @Scheduled(
      cron = "${lexis.reports.artifact-cleanup-cron:0 30 3 * * *}",
      zone = "${lexis.reports.artifact-cleanup-zone:America/Vancouver}")
  public void deleteStaleArtifacts() {
    Instant staleBefore = clock.instant().minus(staleAfter);
    try {
      LexisReportResourceManager.StaleArtifactCleanupResult result =
          reportResources.deleteStaleArtifacts(staleBefore);
      String outcome = result.failedFileCount() == 0 ? "completed" : "completed_with_failures";
      LOGGER.info(
          "event=lexis_report_artifact_cleanup outcome={} deletedFiles={} deletedBytes={} failedFiles={}",
          outcome,
          result.deletedFileCount(),
          result.deletedByteCount(),
          result.failedFileCount());
    } catch (RuntimeException exception) {
      LOGGER.warn(
          "event=lexis_report_artifact_cleanup outcome=failed failureType={}",
          exceptionType(exception));
    }
  }
}

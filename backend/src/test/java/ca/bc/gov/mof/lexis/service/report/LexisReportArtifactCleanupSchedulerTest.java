package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

class LexisReportArtifactCleanupSchedulerTest {

  @Test
  void shouldDeleteArtifactsOlderThanTheConfiguredAge() {
    LexisReportResourceManager reportResources = mock(LexisReportResourceManager.class);
    Instant now = Instant.parse("2026-08-11T18:00:00Z");
    Instant staleBefore = now.minus(Duration.ofHours(1));
    when(reportResources.deleteStaleArtifacts(staleBefore))
        .thenReturn(new LexisReportResourceManager.StaleArtifactCleanupResult(2, 4096, 0));
    LexisReportArtifactCleanupScheduler scheduler =
        new LexisReportArtifactCleanupScheduler(
            reportResources, Duration.ofHours(1), Clock.fixed(now, ZoneOffset.UTC));

    scheduler.deleteStaleArtifacts();

    verify(reportResources).deleteStaleArtifacts(staleBefore);
  }

  @Test
  void shouldLeaveCleanupFailureForTheNextScheduledRun() {
    LexisReportResourceManager reportResources = mock(LexisReportResourceManager.class);
    Instant now = Instant.parse("2026-08-11T18:00:00Z");
    when(reportResources.deleteStaleArtifacts(now.minus(Duration.ofHours(1))))
        .thenThrow(
            new LexisReportGenerationException(
                "temporary storage unavailable", new IOException("unavailable")));
    LexisReportArtifactCleanupScheduler scheduler =
        new LexisReportArtifactCleanupScheduler(
            reportResources, Duration.ofHours(1), Clock.fixed(now, ZoneOffset.UTC));

    assertThatCode(scheduler::deleteStaleArtifacts).doesNotThrowAnyException();
  }

  @Test
  void shouldRunEveryPodEarlyMorningInVancouver() throws Exception {
    Scheduled schedule =
        LexisReportArtifactCleanupScheduler.class
            .getMethod("deleteStaleArtifacts")
            .getAnnotation(Scheduled.class);

    assertThat(schedule.cron())
        .isEqualTo("${lexis.reports.artifact-cleanup-cron:0 30 3 * * *}");
    assertThat(schedule.zone())
        .isEqualTo("${lexis.reports.artifact-cleanup-zone:America/Vancouver}");
  }
}

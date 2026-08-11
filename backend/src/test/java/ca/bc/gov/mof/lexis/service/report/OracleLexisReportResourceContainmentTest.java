package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.test.ReportTestArtifacts.report;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class OracleLexisReportResourceContainmentTest {

  @TempDir Path tempDirectory;

  @Test
  void concurrentReportGenerationsShouldNotBeSerializedByTheApplication() throws Exception {
    OracleLegacyCsvReportService csvService = mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService tableService =
        mock(OracleLegacyJasperTableReportService.class);
    LexisReportRequestDto request = new LexisReportRequestDto(Map.of(), "CSV");
    CountDownLatch started = new CountDownLatch(2);
    CountDownLatch release = new CountDownLatch(1);
    when(csvService.generateLegacyCsvReport(
            LexisJasperReportDefinition.OFFER_REPORT, request, LexisReportFormat.CSV))
        .thenAnswer(
            invocation -> {
              started.countDown();
              release.await();
              return Optional.of(
                  report("offers.csv", "text/csv", (byte) 1));
            });
    OracleLexisReportService service = service(csvService, tableService, resources());

    try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
      Future<Optional<LexisGeneratedReport>> first =
          executor.submit(() -> service.generateReport("offerReport", request));
      Future<Optional<LexisGeneratedReport>> second =
          executor.submit(() -> service.generateReport("offerReport", request));

      boolean bothStarted = started.await(5, TimeUnit.SECONDS);
      release.countDown();

      assertThat(bothStarted).isTrue();
      assertThat(first.get(5, TimeUnit.SECONDS)).isPresent();
      assertThat(second.get(5, TimeUnit.SECONDS)).isPresent();
    } finally {
      release.countDown();
    }
  }

  @Test
  void generatedArtifactShouldPassThroughWithoutAnApplicationSizeCap() {
    OracleLegacyCsvReportService csvService = mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService tableService =
        mock(OracleLegacyJasperTableReportService.class);
    LexisReportRequestDto request = new LexisReportRequestDto(Map.of(), "CSV");
    LexisGeneratedReport artifact =
        report("offers.csv", "text/csv", (byte) 1, (byte) 2, (byte) 3, (byte) 4);
    when(csvService.generateLegacyCsvReport(
            LexisJasperReportDefinition.OFFER_REPORT, request, LexisReportFormat.CSV))
        .thenReturn(Optional.of(artifact));

    OracleLexisReportService service = service(csvService, tableService, resources());

    assertThat(service.generateReport("offerReport", request)).containsSame(artifact);
  }

  private OracleLexisReportService service(
      OracleLegacyCsvReportService csvService,
      OracleLegacyJasperTableReportService tableService,
      LexisReportResourceManager resources) {
    return new OracleLexisReportService(
        mock(DataSource.class),
        new LexisJasperReportParameterProvider(),
        csvService,
        tableService,
        mock(PermitRpcRepository.class),
        mock(LexisReportScheduleRepository.class),
        new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"),
        resources);
  }

  private LexisReportResourceManager resources() {
    LexisReportResourceProperties properties = new LexisReportResourceProperties();
    properties.setArtifactDirectory(tempDirectory.resolve("reports").toString());
    properties.setVirtualizerDirectory(tempDirectory.resolve("jasper").toString());
    properties.setVirtualizerMaxPages(2);
    return new LexisReportResourceManager(properties);
  }
}

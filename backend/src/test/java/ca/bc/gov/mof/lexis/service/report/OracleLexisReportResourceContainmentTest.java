package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
                  new LexisGeneratedReport("offers.csv", "text/csv", new byte[] {1}));
            });
    OracleLexisReportService service = service(csvService, tableService, resources(1024));

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
  void outputLimitShouldApplyToLegacyCsvResults() {
    OracleLegacyCsvReportService csvService = mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService tableService =
        mock(OracleLegacyJasperTableReportService.class);
    LexisReportRequestDto request = new LexisReportRequestDto(Map.of(), "CSV");
    when(csvService.generateLegacyCsvReport(
            LexisJasperReportDefinition.OFFER_REPORT, request, LexisReportFormat.CSV))
        .thenReturn(
            Optional.of(
                new LexisGeneratedReport("offers.csv", "text/csv", new byte[] {1, 2, 3, 4})));

    OracleLexisReportService service = service(csvService, tableService, resources(3));

    assertThatThrownBy(() -> service.generateReport("offerReport", request))
        .isInstanceOf(LexisReportOutputLimitException.class)
        .hasMessageContaining("3 bytes");
  }

  @Test
  void outputLimitShouldApplyToLegacyJasperTableResults() {
    OracleLegacyCsvReportService csvService = mock(OracleLegacyCsvReportService.class);
    OracleLegacyJasperTableReportService tableService =
        mock(OracleLegacyJasperTableReportService.class);
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("exportJurisdictionCode", "P"), "PDF");
    when(csvService.generateLegacyCsvReport(
            LexisJasperReportDefinition.TEAC_REPORT, request, LexisReportFormat.PDF))
        .thenReturn(Optional.empty());
    when(tableService.generateLegacyPdfReport(
            LexisJasperReportDefinition.TEAC_REPORT, request, LexisReportFormat.PDF))
        .thenReturn(
            Optional.of(
                new LexisGeneratedReport(
                    "teac.pdf", "application/pdf", new byte[] {1, 2, 3, 4})));

    OracleLexisReportService service = service(csvService, tableService, resources(3));

    assertThatThrownBy(() -> service.generateReport("teacReport", request))
        .isInstanceOf(LexisReportOutputLimitException.class)
        .hasMessageContaining("3 bytes");
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

  private LexisReportResourceManager resources(long maxOutputBytes) {
    LexisReportResourceProperties properties = new LexisReportResourceProperties();
    properties.setMaxOutputBytes(maxOutputBytes);
    properties.setVirtualizerDirectory(tempDirectory.resolve("jasper").toString());
    properties.setVirtualizerMaxPages(2);
    return new LexisReportResourceManager(properties);
  }
}

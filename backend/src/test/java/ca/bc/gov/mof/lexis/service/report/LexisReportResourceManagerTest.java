package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Statement;
import java.util.HashMap;
import java.util.Map;
import net.sf.jasperreports.engine.JRParameter;
import net.sf.jasperreports.engine.fill.JRSwapFileVirtualizer;
import net.sf.jasperreports.engine.query.JRJdbcQueryExecuterFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LexisReportResourceManagerTest {

  @TempDir Path tempDirectory;

  @Test
  void shouldFailFastAtConfiguredConcurrencyAndReleaseTheSlot() {
    LexisReportResourceManager manager = manager(1, 1024);

    try (LexisReportResourceManager.ReportPermit ignored = manager.acquire()) {
      assertThatThrownBy(manager::acquire)
          .isInstanceOf(LexisReportCapacityException.class)
          .hasMessageContaining("busy");
    }

    try (LexisReportResourceManager.ReportPermit ignored = manager.acquire()) {
      assertThat(ignored).isNotNull();
    }
  }

  @Test
  void shouldStopBufferedOutputBeforeItExceedsTheConfiguredLimit() throws Exception {
    LexisReportResourceManager manager = manager(1, 4);
    LexisReportResourceManager.LimitedByteArrayOutputStream output = manager.newOutputStream();

    output.write(new byte[] {1, 2, 3, 4});
    assertThat(output.toByteArray()).containsExactly(1, 2, 3, 4);
    assertThatThrownBy(() -> output.write(5))
        .isInstanceOf(LexisReportOutputLimitException.class)
        .hasMessageContaining("4 bytes");
    assertThatThrownBy(() -> manager.requireWithinOutputLimit(new byte[5]))
        .isInstanceOf(LexisReportOutputLimitException.class);
  }

  @Test
  void shouldInstallAndCleanUpAJasperSwapFileVirtualizer() throws Exception {
    LexisReportResourceManager manager = manager(1, 1024);
    Map<String, Object> parameters = new HashMap<>();

    try (LexisReportResourceManager.JasperVirtualizerSession ignored =
        manager.openVirtualizer(parameters)) {
      assertThat(parameters.get(JRParameter.REPORT_VIRTUALIZER))
          .isInstanceOf(JRSwapFileVirtualizer.class);
      assertThat(Files.isDirectory(tempDirectory.resolve("jasper"))).isTrue();
    }

    try (var files = Files.list(tempDirectory.resolve("jasper"))) {
      assertThat(files).isEmpty();
    }
  }

  @Test
  void shouldApplyTheSameConfiguredQueryTimeoutToJdbcAndJasper() throws Exception {
    LexisReportResourceManager manager = manager(1, 1024, 37);
    Statement statement = mock(Statement.class);

    manager.applyQueryTimeout(statement);

    verify(statement).setQueryTimeout(37);
    assertThat(
            manager
                .jasperReportsContext()
                .getProperty(JRJdbcQueryExecuterFactory.PROPERTY_JDBC_QUERY_TIMEOUT))
        .isEqualTo("37");
  }

  private LexisReportResourceManager manager(int maxConcurrent, long maxOutputBytes) {
    return manager(maxConcurrent, maxOutputBytes, 120);
  }

  private LexisReportResourceManager manager(
      int maxConcurrent, long maxOutputBytes, int queryTimeoutSeconds) {
    LexisReportResourceProperties properties = new LexisReportResourceProperties();
    properties.setMaxConcurrent(maxConcurrent);
    properties.setMaxOutputBytes(maxOutputBytes);
    properties.setVirtualizerDirectory(tempDirectory.resolve("jasper").toString());
    properties.setVirtualizerMaxPages(2);
    properties.setQueryTimeoutSeconds(queryTimeoutSeconds);
    return new LexisReportResourceManager(properties);
  }
}

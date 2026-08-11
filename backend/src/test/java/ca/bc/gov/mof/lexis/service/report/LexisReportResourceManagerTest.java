package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.ResultSet;
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
  void shouldWriteAndCompleteAFileBackedArtifact() throws Exception {
    LexisReportResourceManager manager = manager();
    LexisGeneratedReport report;

    try (LexisReportArtifact artifact = manager.createArtifact()) {
      artifact.outputStream().write(new byte[] {1, 2, 3, 4, 5});
      report = artifact.complete("report.csv", "text/csv");
    }

    assertThat(report.contentLength()).isEqualTo(5);
    assertThat(Files.readAllBytes(report.artifactPath())).containsExactly(1, 2, 3, 4, 5);
    Files.delete(report.artifactPath());
  }

  @Test
  void shouldDeleteAnIncompleteArtifact() throws Exception {
    LexisReportResourceManager manager = manager();
    Path path;

    try (LexisReportArtifact artifact = manager.createArtifact()) {
      path = artifact.path();
      artifact.outputStream().write(1);
    }

    assertThat(path).doesNotExist();
  }

  @Test
  void shouldCompleteAnArtifactBeyondTheRetiredTwentyFiveMibibyteCap() throws Exception {
    LexisReportResourceManager manager = manager();
    byte[] oneMibibyte = new byte[1024 * 1024];
    LexisGeneratedReport report;

    try (LexisReportArtifact artifact = manager.createArtifact()) {
      for (int index = 0; index < 26; index++) {
        artifact.outputStream().write(oneMibibyte);
      }
      report = artifact.complete("large-report.csv", "text/csv");
    }

    assertThat(report.contentLength()).isEqualTo(26L * 1024L * 1024L);
    Files.delete(report.artifactPath());
  }

  @Test
  void shouldInstallAndCleanUpAJasperSwapFileVirtualizer() throws Exception {
    LexisReportResourceManager manager = manager();
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
  void shouldApplyTheSameJdbcControlsToDirectAndJasperQueries() throws Exception {
    LexisReportResourceManager manager = manager(37, 250);
    Statement statement = mock(Statement.class);
    ResultSet resultSet = mock(ResultSet.class);

    manager.applyQueryControls(statement);
    manager.applyFetchSize(resultSet);

    verify(statement).setQueryTimeout(37);
    verify(statement).setFetchSize(250);
    verify(resultSet).setFetchSize(250);
    assertThat(
            manager
                .jasperReportsContext()
                .getProperty(JRJdbcQueryExecuterFactory.PROPERTY_JDBC_QUERY_TIMEOUT))
        .isEqualTo("37");
    assertThat(
            manager
                .jasperReportsContext()
                .getProperty(JRJdbcQueryExecuterFactory.PROPERTY_JDBC_FETCH_SIZE))
        .isEqualTo("250");
  }

  private LexisReportResourceManager manager() {
    return manager(120, 100);
  }

  private LexisReportResourceManager manager(
      int queryTimeoutSeconds, int jdbcFetchSize) {
    LexisReportResourceProperties properties = new LexisReportResourceProperties();
    properties.setArtifactDirectory(tempDirectory.resolve("reports").toString());
    properties.setVirtualizerDirectory(tempDirectory.resolve("jasper").toString());
    properties.setVirtualizerMaxPages(2);
    properties.setQueryTimeoutSeconds(queryTimeoutSeconds);
    properties.setJdbcFetchSize(jdbcFetchSize);
    return new LexisReportResourceManager(properties);
  }
}

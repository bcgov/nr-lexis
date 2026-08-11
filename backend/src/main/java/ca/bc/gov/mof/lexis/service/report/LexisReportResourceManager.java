package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import net.sf.jasperreports.engine.JRParameter;
import net.sf.jasperreports.engine.JasperReportsContext;
import net.sf.jasperreports.engine.SimpleJasperReportsContext;
import net.sf.jasperreports.engine.fill.JRSwapFileVirtualizer;
import net.sf.jasperreports.engine.query.JRJdbcQueryExecuterFactory;
import net.sf.jasperreports.engine.util.JRSwapFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** File-backed report, JDBC fetch, query-timeout, and Jasper temporary-storage controls. */
@Service
public class LexisReportResourceManager {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisReportResourceManager.class);
  private static final int SWAP_BLOCK_SIZE_BYTES = 4096;
  private static final int SWAP_MIN_GROW_BLOCKS = 100;

  private static final String ARTIFACT_FILE_PREFIX = "lexis-report-";
  private static final String ARTIFACT_FILE_SUFFIX = ".tmp";

  private final Path artifactDirectory;
  private final Path virtualizerDirectory;
  private final int virtualizerMaxPages;
  private final int queryTimeoutSeconds;
  private final int jdbcFetchSize;
  private final JasperReportsContext jasperReportsContext;

  public LexisReportResourceManager(LexisReportResourceProperties properties) {
    Objects.requireNonNull(properties, "properties");
    if (properties.getVirtualizerMaxPages() < 1
        || properties.getQueryTimeoutSeconds() < 1
        || properties.getQueryTimeoutSeconds() > 3600
        || properties.getJdbcFetchSize() < 1
        || properties.getJdbcFetchSize() > 10_000) {
      throw new IllegalArgumentException("Report resource limits are invalid.");
    }
    String artifactDirectoryValue = properties.getArtifactDirectory();
    if (artifactDirectoryValue == null || artifactDirectoryValue.isBlank()) {
      throw new IllegalArgumentException("Report artifact directory is required.");
    }
    String directory = properties.getVirtualizerDirectory();
    if (directory == null || directory.isBlank()) {
      throw new IllegalArgumentException("Report virtualizer directory is required.");
    }
    this.artifactDirectory = Path.of(artifactDirectoryValue).toAbsolutePath().normalize();
    this.virtualizerDirectory = Path.of(directory).toAbsolutePath().normalize();
    this.virtualizerMaxPages = properties.getVirtualizerMaxPages();
    this.queryTimeoutSeconds = properties.getQueryTimeoutSeconds();
    this.jdbcFetchSize = properties.getJdbcFetchSize();
    SimpleJasperReportsContext timeoutContext = new SimpleJasperReportsContext();
    timeoutContext.setProperty(
        JRJdbcQueryExecuterFactory.PROPERTY_JDBC_QUERY_TIMEOUT,
        Integer.toString(queryTimeoutSeconds));
    timeoutContext.setProperty(
        JRJdbcQueryExecuterFactory.PROPERTY_JDBC_FETCH_SIZE,
        Integer.toString(jdbcFetchSize));
    this.jasperReportsContext = timeoutContext;
  }

  static LexisReportResourceManager defaults() {
    return new LexisReportResourceManager(new LexisReportResourceProperties());
  }

  public LexisReportArtifact createArtifact() {
    try {
      Files.createDirectories(artifactDirectory);
      return new LexisReportArtifact(
          Files.createTempFile(artifactDirectory, ARTIFACT_FILE_PREFIX, ARTIFACT_FILE_SUFFIX));
    } catch (IOException exception) {
      throw new LexisReportGenerationException(
          "Report temporary storage could not be prepared.", exception);
    }
  }

  StaleArtifactCleanupResult deleteStaleArtifacts(Instant staleBefore) {
    Objects.requireNonNull(staleBefore, "staleBefore");
    if (Files.notExists(artifactDirectory)) {
      return StaleArtifactCleanupResult.empty();
    }

    long deletedFileCount = 0;
    long deletedByteCount = 0;
    long failedFileCount = 0;
    String artifactPattern = ARTIFACT_FILE_PREFIX + "*" + ARTIFACT_FILE_SUFFIX;
    try (DirectoryStream<Path> artifacts =
        Files.newDirectoryStream(artifactDirectory, artifactPattern)) {
      for (Path artifact : artifacts) {
        try {
          BasicFileAttributes attributes =
              Files.readAttributes(
                  artifact, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
          if (!attributes.isRegularFile()
              || !attributes.lastModifiedTime().toInstant().isBefore(staleBefore)) {
            continue;
          }
          if (Files.deleteIfExists(artifact)) {
            deletedFileCount++;
            deletedByteCount += attributes.size();
          }
        } catch (NoSuchFileException exception) {
          // The normal response cleanup won the race.
        } catch (IOException exception) {
          failedFileCount++;
          LOGGER.warn(
              "event=lexis_report_artifact_cleanup outcome=file_delete_failed failureType={}",
              exceptionType(exception));
        }
      }
    } catch (NoSuchFileException exception) {
      return new StaleArtifactCleanupResult(
          deletedFileCount, deletedByteCount, failedFileCount);
    } catch (IOException exception) {
      throw new LexisReportGenerationException(
          "Report temporary storage could not be inspected.", exception);
    }

    return new StaleArtifactCleanupResult(
        deletedFileCount, deletedByteCount, failedFileCount);
  }

  void applyQueryControls(Statement statement) throws SQLException {
    Statement safeStatement = Objects.requireNonNull(statement, "statement");
    safeStatement.setQueryTimeout(queryTimeoutSeconds);
    safeStatement.setFetchSize(jdbcFetchSize);
  }

  void applyFetchSize(ResultSet resultSet) throws SQLException {
    Objects.requireNonNull(resultSet, "resultSet").setFetchSize(jdbcFetchSize);
  }

  JasperReportsContext jasperReportsContext() {
    return jasperReportsContext;
  }

  public JasperVirtualizerSession openVirtualizer(Map<String, Object> reportParameters) {
    Objects.requireNonNull(reportParameters, "reportParameters");
    try {
      Files.createDirectories(virtualizerDirectory);
    } catch (IOException ex) {
      throw new LexisReportGenerationException(
          "Jasper temporary storage could not be prepared.", ex);
    }

    JRSwapFile swapFile =
        new JRSwapFile(
            virtualizerDirectory.toString(), SWAP_BLOCK_SIZE_BYTES, SWAP_MIN_GROW_BLOCKS);
    JRSwapFileVirtualizer virtualizer =
        new JRSwapFileVirtualizer(virtualizerMaxPages, swapFile, true);
    reportParameters.put(JRParameter.REPORT_VIRTUALIZER, virtualizer);
    return new JasperVirtualizerSession(virtualizer);
  }

  public static final class JasperVirtualizerSession implements AutoCloseable {

    private final JRSwapFileVirtualizer virtualizer;
    private final AtomicBoolean cleaned = new AtomicBoolean(false);

    private JasperVirtualizerSession(JRSwapFileVirtualizer virtualizer) {
      this.virtualizer = virtualizer;
    }

    @Override
    public void close() {
      if (cleaned.compareAndSet(false, true)) {
        virtualizer.cleanup();
      }
    }
  }

  record StaleArtifactCleanupResult(
      long deletedFileCount, long deletedByteCount, long failedFileCount) {

    private static StaleArtifactCleanupResult empty() {
      return new StaleArtifactCleanupResult(0, 0, 0);
    }
  }

}

package ca.bc.gov.mof.lexis.service.report;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import net.sf.jasperreports.engine.JRParameter;
import net.sf.jasperreports.engine.JasperReportsContext;
import net.sf.jasperreports.engine.SimpleJasperReportsContext;
import net.sf.jasperreports.engine.fill.JRSwapFileVirtualizer;
import net.sf.jasperreports.engine.query.JRJdbcQueryExecuterFactory;
import net.sf.jasperreports.engine.util.JRSwapFile;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/** Per-pod report concurrency, query-timeout, output-size, and Jasper temporary-storage controls. */
@Service
@Profile("oracle")
public class LexisReportResourceManager {

  private static final int SWAP_BLOCK_SIZE_BYTES = 4096;
  private static final int SWAP_MIN_GROW_BLOCKS = 100;

  private final Semaphore totalPermits;
  private final long maxOutputBytes;
  private final Path virtualizerDirectory;
  private final int virtualizerMaxPages;
  private final int queryTimeoutSeconds;
  private final JasperReportsContext jasperReportsContext;

  public LexisReportResourceManager(LexisReportResourceProperties properties) {
    Objects.requireNonNull(properties, "properties");
    if (properties.getMaxConcurrent() < 1
        || properties.getMaxOutputBytes() < 1
        || properties.getMaxOutputBytes() > Integer.MAX_VALUE
        || properties.getVirtualizerMaxPages() < 1
        || properties.getQueryTimeoutSeconds() < 1
        || properties.getQueryTimeoutSeconds() > 3600) {
      throw new IllegalArgumentException("Report resource limits are invalid.");
    }
    String directory = properties.getVirtualizerDirectory();
    if (directory == null || directory.isBlank()) {
      throw new IllegalArgumentException("Report virtualizer directory is required.");
    }
    this.totalPermits = new Semaphore(properties.getMaxConcurrent(), true);
    this.maxOutputBytes = properties.getMaxOutputBytes();
    this.virtualizerDirectory = Path.of(directory).toAbsolutePath().normalize();
    this.virtualizerMaxPages = properties.getVirtualizerMaxPages();
    this.queryTimeoutSeconds = properties.getQueryTimeoutSeconds();
    SimpleJasperReportsContext timeoutContext = new SimpleJasperReportsContext();
    timeoutContext.setProperty(
        JRJdbcQueryExecuterFactory.PROPERTY_JDBC_QUERY_TIMEOUT,
        Integer.toString(queryTimeoutSeconds));
    this.jasperReportsContext = timeoutContext;
  }

  static LexisReportResourceManager defaults() {
    return new LexisReportResourceManager(new LexisReportResourceProperties());
  }

  public ReportPermit acquire() {
    if (!totalPermits.tryAcquire()) {
      throw new LexisReportCapacityException(
          "Report generation is busy on this pod. Try again shortly.");
    }
    return new ReportPermit(totalPermits);
  }

  public LimitedByteArrayOutputStream newOutputStream() {
    return new LimitedByteArrayOutputStream(maxOutputBytes);
  }

  void applyQueryTimeout(Statement statement) throws SQLException {
    Objects.requireNonNull(statement, "statement").setQueryTimeout(queryTimeoutSeconds);
  }

  JasperReportsContext jasperReportsContext() {
    return jasperReportsContext;
  }

  public byte[] requireWithinOutputLimit(byte[] content) {
    byte[] safeContent = content == null ? new byte[0] : content;
    if (safeContent.length > maxOutputBytes) {
      throw new LexisReportOutputLimitException(maxOutputBytes);
    }
    return safeContent;
  }

  /**
   * Bounds legacy report rows that must be retained for Jasper rendering. The estimate supplied by
   * the caller includes conservative collection and cell overhead in addition to UTF-8 content.
   */
  public void requireWithinMaterializationBudget(long estimatedBytes) {
    if (estimatedBytes > maxOutputBytes) {
      throw new LexisReportOutputLimitException(maxOutputBytes);
    }
  }

  public LexisGeneratedReport requireWithinOutputLimit(LexisGeneratedReport report) {
    if (report == null) {
      return null;
    }
    requireWithinOutputLimit(report.content());
    return report;
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

  public void rethrowOutputLimit(Throwable throwable) {
    Throwable current = throwable;
    while (current != null) {
      if (current instanceof LexisReportOutputLimitException outputLimit) {
        throw outputLimit;
      }
      current = current.getCause();
    }
  }

  public static final class ReportPermit implements AutoCloseable {

    private final Semaphore totalSemaphore;
    private final AtomicBoolean released = new AtomicBoolean(false);

    private ReportPermit(Semaphore totalSemaphore) {
      this.totalSemaphore = totalSemaphore;
    }

    @Override
    public void close() {
      if (released.compareAndSet(false, true)) {
        totalSemaphore.release();
      }
    }
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

  public static final class LimitedByteArrayOutputStream extends ByteArrayOutputStream {

    private final long maxOutputBytes;

    private LimitedByteArrayOutputStream(long maxOutputBytes) {
      super((int) Math.min(16L * 1024L, maxOutputBytes));
      this.maxOutputBytes = maxOutputBytes;
    }

    @Override
    public synchronized void write(int value) {
      requireCapacity(1);
      super.write(value);
    }

    @Override
    public synchronized void write(byte[] bytes, int offset, int length) {
      Objects.checkFromIndexSize(offset, length, bytes.length);
      requireCapacity(length);
      super.write(bytes, offset, length);
    }

    @Override
    public synchronized void writeBytes(byte[] bytes) {
      write(bytes, 0, bytes.length);
    }

    private void requireCapacity(int additionalBytes) {
      if (additionalBytes > maxOutputBytes - count) {
        throw new LexisReportOutputLimitException(maxOutputBytes);
      }
    }
  }
}

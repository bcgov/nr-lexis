package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.service.report.LexisReportCapacityException;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Streams a staged report and removes the temporary file after every transfer attempt. */
final class TemporaryReportStreamingBody implements StreamingResponseBody {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(TemporaryReportStreamingBody.class);
  private static final String TEMP_FILE_PREFIX = "lexis-report-";
  private static final String TEMP_FILE_SUFFIX = ".tmp";
  private static final int MAX_ACTIVE_TRANSFERS = 256;
  private static final int MAX_STAGED_BYTES = 250 * 1024 * 1024;
  private static final Semaphore ACTIVE_TRANSFERS = new Semaphore(MAX_ACTIVE_TRANSFERS, true);
  private static final Semaphore STAGED_BYTES = new Semaphore(MAX_STAGED_BYTES, true);

  private final Path temporaryFile;
  private final TransferObserver transferObserver;
  private final int reservedBytes;
  private final AtomicBoolean reservationReleased = new AtomicBoolean(false);

  private TemporaryReportStreamingBody(
      Path temporaryFile, TransferObserver transferObserver, int reservedBytes) {
    this.temporaryFile = temporaryFile;
    this.transferObserver = transferObserver;
    this.reservedBytes = reservedBytes;
  }

  static TemporaryReportStreamingBody stage(
      byte[] content, TransferObserver transferObserver) throws IOException {
    byte[] stagedContent = content == null ? new byte[0] : content;
    int reservedBytes = Math.max(1, stagedContent.length);
    reserveTransfer(reservedBytes);
    Path temporaryFile = null;
    try {
      temporaryFile = Files.createTempFile(TEMP_FILE_PREFIX, TEMP_FILE_SUFFIX);
      Files.write(
          temporaryFile,
          stagedContent,
          StandardOpenOption.TRUNCATE_EXISTING);
      return new TemporaryReportStreamingBody(temporaryFile, transferObserver, reservedBytes);
    } catch (IOException | RuntimeException exception) {
      releaseTransfer(reservedBytes);
      if (temporaryFile != null) {
        try {
          Files.deleteIfExists(temporaryFile);
        } catch (IOException cleanupException) {
          exception.addSuppressed(cleanupException);
        }
      }
      throw exception;
    }
  }

  @Override
  public void writeTo(OutputStream outputStream) throws IOException {
    long startedNanos = System.nanoTime();
    boolean successful = false;
    try {
      Files.copy(temporaryFile, outputStream);
      outputStream.flush();
      successful = true;
    } finally {
      notifyTransferObserver(successful, System.nanoTime() - startedNanos);
      try {
        Files.deleteIfExists(temporaryFile);
      } catch (IOException exception) {
        LOGGER.warn("Unable to remove staged LEXIS report after transfer", exception);
      }
      releaseReservation();
    }
  }

  private static void reserveTransfer(int reservedBytes) {
    if (!ACTIVE_TRANSFERS.tryAcquire()) {
      throw new LexisReportCapacityException(
          "Report download capacity is busy on this pod. Try again shortly.");
    }
    if (!STAGED_BYTES.tryAcquire(reservedBytes)) {
      ACTIVE_TRANSFERS.release();
      throw new LexisReportCapacityException(
          "Report download storage is busy on this pod. Try again shortly.");
    }
  }

  private void releaseReservation() {
    if (reservationReleased.compareAndSet(false, true)) {
      releaseTransfer(reservedBytes);
    }
  }

  private static void releaseTransfer(int reservedBytes) {
    STAGED_BYTES.release(reservedBytes);
    ACTIVE_TRANSFERS.release();
  }

  private void notifyTransferObserver(boolean successful, long durationNanos) {
    if (transferObserver == null) {
      return;
    }
    try {
      transferObserver.completed(successful, Math.max(0L, durationNanos));
    } catch (RuntimeException exception) {
      LOGGER.warn("Unable to record staged LEXIS report transfer outcome", exception);
    }
  }

  Path temporaryFile() {
    return temporaryFile;
  }

  static int availableTransferSlots() {
    return ACTIVE_TRANSFERS.availablePermits();
  }

  static int availableStagedBytes() {
    return STAGED_BYTES.availablePermits();
  }

  @FunctionalInterface
  interface TransferObserver {
    void completed(boolean successful, long durationNanos);
  }
}

package ca.bc.gov.mof.lexis.controller;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Streams a staged report and removes the temporary file after every transfer attempt. */
final class TemporaryReportStreamingBody implements StreamingResponseBody {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(TemporaryReportStreamingBody.class);
  private final Path temporaryFile;
  private final TransferObserver transferObserver;

  private TemporaryReportStreamingBody(Path temporaryFile, TransferObserver transferObserver) {
    this.temporaryFile = temporaryFile;
    this.transferObserver = transferObserver;
  }

  static TemporaryReportStreamingBody fromArtifact(
      Path artifactPath, TransferObserver transferObserver) throws IOException {
    Path temporaryFile =
        Objects.requireNonNull(artifactPath, "artifactPath").toAbsolutePath().normalize();
    if (!Files.isRegularFile(temporaryFile)) {
      throw new IOException("Generated report artifact is unavailable.");
    }
    return new TemporaryReportStreamingBody(temporaryFile, transferObserver);
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
    }
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

  @FunctionalInterface
  interface TransferObserver {
    void completed(boolean successful, long durationNanos);
  }
}

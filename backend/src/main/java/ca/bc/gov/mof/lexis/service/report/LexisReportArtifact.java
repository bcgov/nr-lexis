package ca.bc.gov.mof.lexis.service.report;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Objects;

/** Incrementally written temporary report that deletes incomplete output on close. */
public final class LexisReportArtifact implements AutoCloseable {

  private final Path path;
  private final OutputStream outputStream;
  private boolean outputClosed;
  private boolean completed;

  LexisReportArtifact(Path path) throws IOException {
    this.path = Objects.requireNonNull(path, "path").toAbsolutePath().normalize();
    this.outputStream =
        new BufferedOutputStream(
            Files.newOutputStream(
                this.path, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING));
  }

  public OutputStream outputStream() {
    if (outputClosed) {
      throw new IllegalStateException("Report artifact output is already closed.");
    }
    return outputStream;
  }

  public LexisGeneratedReport complete(String filename, String mediaType) throws IOException {
    if (completed) {
      throw new IllegalStateException("Report artifact is already complete.");
    }
    closeOutput();
    long contentLength = Files.size(path);
    completed = true;
    return new LexisGeneratedReport(filename, mediaType, path, contentLength);
  }

  Path path() {
    return path;
  }

  @Override
  public void close() throws IOException {
    IOException failure = null;
    try {
      closeOutput();
    } catch (IOException exception) {
      failure = exception;
    }

    if (!completed) {
      try {
        Files.deleteIfExists(path);
      } catch (IOException exception) {
        if (failure == null) {
          failure = exception;
        } else {
          failure.addSuppressed(exception);
        }
      }
    }

    if (failure != null) {
      throw failure;
    }
  }

  private void closeOutput() throws IOException {
    if (!outputClosed) {
      outputClosed = true;
      outputStream.close();
    }
  }
}

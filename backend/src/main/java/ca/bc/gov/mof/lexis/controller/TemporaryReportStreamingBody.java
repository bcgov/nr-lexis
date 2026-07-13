package ca.bc.gov.mof.lexis.controller;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Streams a staged report and removes the temporary file after every transfer attempt. */
final class TemporaryReportStreamingBody implements StreamingResponseBody {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(TemporaryReportStreamingBody.class);
  private static final String TEMP_FILE_PREFIX = "lexis-report-";
  private static final String TEMP_FILE_SUFFIX = ".tmp";

  private final Path temporaryFile;

  private TemporaryReportStreamingBody(Path temporaryFile) {
    this.temporaryFile = temporaryFile;
  }

  static TemporaryReportStreamingBody stage(byte[] content) throws IOException {
    Path temporaryFile = Files.createTempFile(TEMP_FILE_PREFIX, TEMP_FILE_SUFFIX);
    try {
      Files.write(
          temporaryFile,
          content == null ? new byte[0] : content,
          StandardOpenOption.TRUNCATE_EXISTING);
      return new TemporaryReportStreamingBody(temporaryFile);
    } catch (IOException exception) {
      try {
        Files.deleteIfExists(temporaryFile);
      } catch (IOException cleanupException) {
        exception.addSuppressed(cleanupException);
      }
      throw exception;
    }
  }

  @Override
  public void writeTo(OutputStream outputStream) throws IOException {
    try {
      Files.copy(temporaryFile, outputStream);
      outputStream.flush();
    } finally {
      try {
        Files.deleteIfExists(temporaryFile);
      } catch (IOException exception) {
        LOGGER.warn("Unable to remove staged LEXIS report after transfer", exception);
      }
    }
  }

  Path temporaryFile() {
    return temporaryFile;
  }
}

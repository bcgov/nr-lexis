package ca.bc.gov.mof.lexis.controller;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Stages Oracle attachments locally so slow clients do not hold database connections. */
final class TemporaryDocumentStreamingBody implements StreamingResponseBody {

  private static final String TEMP_FILE_PREFIX = "lexis-document-";

  private final ContentWriter contentWriter;
  private final Path temporaryDirectory;

  private TemporaryDocumentStreamingBody(
      ContentWriter contentWriter, Path temporaryDirectory) {
    this.contentWriter = Objects.requireNonNull(contentWriter, "contentWriter");
    this.temporaryDirectory = Objects.requireNonNull(temporaryDirectory, "temporaryDirectory");
  }

  static TemporaryDocumentStreamingBody stream(ContentWriter contentWriter) {
    return new TemporaryDocumentStreamingBody(
        contentWriter, Path.of(System.getProperty("java.io.tmpdir")));
  }

  static TemporaryDocumentStreamingBody stream(
      ContentWriter contentWriter, Path temporaryDirectory) {
    return new TemporaryDocumentStreamingBody(contentWriter, temporaryDirectory);
  }

  @Override
  public void writeTo(OutputStream outputStream) throws IOException {
    Path temporaryFile = null;
    try {
      temporaryFile = Files.createTempFile(temporaryDirectory, TEMP_FILE_PREFIX, ".tmp");
      try (OutputStream stagedOutput = Files.newOutputStream(temporaryFile)) {
        contentWriter.writeTo(stagedOutput);
      }
      Files.copy(temporaryFile, outputStream);
      outputStream.flush();
    } finally {
      if (temporaryFile != null) {
        Files.deleteIfExists(temporaryFile);
      }
    }
  }

  @FunctionalInterface
  interface ContentWriter {
    void writeTo(OutputStream outputStream) throws IOException;
  }
}

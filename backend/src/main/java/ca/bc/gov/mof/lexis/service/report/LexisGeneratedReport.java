package ca.bc.gov.mof.lexis.service.report;

import java.nio.file.Path;
import java.util.Objects;

/** A completed, file-backed report artifact owned by the HTTP response lifecycle. */
public record LexisGeneratedReport(
    String filename, String mediaType, Path artifactPath, long contentLength) {

  public LexisGeneratedReport {
    artifactPath = Objects.requireNonNull(artifactPath, "artifactPath").toAbsolutePath().normalize();
    if (contentLength < 0) {
      throw new IllegalArgumentException("Report content length must not be negative.");
    }
  }
}

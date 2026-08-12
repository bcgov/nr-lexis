package ca.bc.gov.mof.lexis.test;

import ca.bc.gov.mof.lexis.service.report.LexisGeneratedReport;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ReportTestArtifacts {

  private ReportTestArtifacts() {}

  public static LexisGeneratedReport report(
      String filename, String mediaType, byte... content) {
    try {
      Path artifact = Files.createTempFile("lexis-report-test-", ".tmp");
      Files.write(artifact, content);
      artifact.toFile().deleteOnExit();
      return new LexisGeneratedReport(filename, mediaType, artifact, content.length);
    } catch (IOException exception) {
      throw new AssertionError("Unable to create a test report artifact", exception);
    }
  }

  public static byte[] content(LexisGeneratedReport report) {
    try {
      return Files.readAllBytes(report.artifactPath());
    } catch (IOException exception) {
      throw new AssertionError("Unable to read a test report artifact", exception);
    } finally {
      try {
        Files.deleteIfExists(report.artifactPath());
      } catch (IOException exception) {
        throw new AssertionError("Unable to remove a test report artifact", exception);
      }
    }
  }
}

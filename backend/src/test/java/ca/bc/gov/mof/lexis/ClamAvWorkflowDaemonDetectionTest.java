package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ClamAvWorkflowDaemonDetectionTest {

  @Test
  void prWorkflowShouldBlockDeploysOnClamAvDaemonDetection() throws IOException {
    String workflow = read(".github/workflows/pr-open.yml");

    assertThat(workflow)
        .contains("clamav-daemon-detection:")
        .contains("name: ClamAV Daemon Detection")
        .contains("bash .github/scripts/check-clamav-daemon-detection.sh")
        .contains(
            "needs: [builds, vars, backend-tests, frontend-tests, clamav-daemon-detection]")
        .contains(
            "needs: [builds, backend-tests, frontend-tests, clamav-daemon-detection, deploys, tests]");
  }

  @Test
  void analysisWorkflowShouldIncludeClamAvDaemonDetectionInRequiredResults()
      throws IOException {
    String workflow = read(".github/workflows/analysis.yml");

    assertThat(workflow)
        .contains("clamav-daemon-detection:")
        .contains("name: ClamAV Daemon Detection")
        .contains("bash .github/scripts/check-clamav-daemon-detection.sh")
        .contains(
            "needs: [backend-tests, frontend-tests, clamav-daemon-detection, trivy]");
  }

  @Test
  void clamAvDaemonDetectionScriptShouldVerifyReadinessAndDetection() throws IOException {
    String script = read(".github/scripts/check-clamav-daemon-detection.sh");

    assertThat(script)
        .contains("docker build --pull")
        .contains("/opt/app-root/clamdcheck.sh")
        .contains("ClamAv-Ci-Test-Signature")
        .contains("FOUND")
        .contains("Expected ClamAV to detect the CI test payload.");
  }

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..", relativePath));
  }
}

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
  void clamAvDaemonDetectionScriptShouldVerifySupervisorDetectionAndShutdown() throws IOException {
    String script = read(".github/scripts/check-clamav-daemon-detection.sh");
    String dockerRun =
        script.substring(
            script.indexOf("docker run -d"), script.indexOf("\n\nexpected_supervisor="));

    assertThat(script)
        .contains("docker build --pull")
        .contains("target=/ci-bin,readonly")
        .contains("PATH=/ci-bin:")
        .contains("freshclam-initial-complete")
        .contains("freshclam-daemon-running")
        .contains("expected_supervisor=\"/opt/app-root/start-clamav.sh\"")
        .contains("docker inspect -f '{{.Path}}' \"${CONTAINER}\"")
        .contains("docker exec \"${CONTAINER}\" /opt/app-root/clamdcheck.sh live")
        .doesNotContain("docker exec \"${CONTAINER}\" /opt/app-root/clamdcheck.sh >/dev/null")
        .contains("ClamAv-Ci-Test-Signature")
        .contains("FOUND")
        .contains("Expected ClamAV to detect the CI test payload.")
        .contains("docker kill --signal=TERM \"${CONTAINER}\"")
        .contains("docker inspect -f '{{.State.ExitCode}}' \"${CONTAINER}\"")
        .contains("stopped gracefully.");
    assertThat(dockerRun)
        .endsWith("\"${IMAGE}\"")
        .doesNotContain("sh -c", "bash -c", "exec clamd");
  }

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..", relativePath));
  }
}

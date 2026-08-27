package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class DeployedSmokeWorkflowTest {

  @Test
  void deployedSmokeShouldRunOnceAndVerifyTheBackendThroughTheFrontendProxy() throws IOException {
    String workflow = read(".github/workflows/reusable-tests.yml");
    int liveGate = workflow.indexOf("- name: Verify frontend proxy to backend");
    int playwright = workflow.indexOf("- name: Run basic Playwright smoke suite");

    assertThat(workflow)
        .contains("for attempt in $(seq 1 24)")
        .contains("--connect-timeout 5")
        .contains("--max-time 15")
        .contains("${E2E_BASE_URL}/api/lexis/session/capabilities")
        .contains("if [ \"${capabilities_status}\" != \"401\" ]")
        .doesNotContain(
            "Basic E2E retry",
            "e2e-retry:",
            "e2e-route-retry:",
            "BACKEND_PREFIX:",
            "BACKEND_BASE_URL",
            "/actuator/health/readiness",
            "capabilities_status} != \"404\"",
            "capabilities_status} != \"500\"",
            "capabilities_status} != \"200\"");
    assertThat(liveGate).isNotNegative();
    assertThat(playwright).isGreaterThan(liveGate);
  }

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..").resolve(relativePath));
  }
}

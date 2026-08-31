package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class DeployedSmokeWorkflowTest {

  @Test
  void deployedSmokeShouldRetryEnvironmentDependentFailuresOnAFreshRunner() throws IOException {
    String workflow = read(".github/workflows/reusable-tests.yml");
    int initialJob = workflow.indexOf("  e2e-tests:");
    int retryJob = workflow.indexOf("  e2e-retry:");

    assertThat(initialJob).isNotNegative();
    assertThat(retryJob).isGreaterThan(initialJob);

    String initialAttempt = workflow.substring(initialJob, retryJob);
    String retryAttempt = workflow.substring(retryJob);

    assertThat(initialAttempt)
        .contains("route_probe_outcome: ${{ steps.route_probe.outcome }}")
        .contains("proxy_probe_outcome: ${{ steps.proxy_probe.outcome }}")
        .contains("playwright_outcome: ${{ steps.playwright.outcome }}")
        .contains("id: route_probe\n        continue-on-error: true")
        .contains("id: proxy_probe\n        continue-on-error: true")
        .contains("id: playwright\n        continue-on-error: true")
        .contains(
            "- name: Verify frontend proxy to backend\n"
                + "        id: proxy_probe\n"
                + "        continue-on-error: true\n"
                + "        if: steps.route_probe.outcome == 'success'",
            "- name: Run basic Playwright smoke suite\n"
                + "        id: playwright\n"
                + "        continue-on-error: true\n"
                + "        if: >-",
            "steps.proxy_probe.outcome == 'success'",
            "if: (! cancelled()) && steps.playwright.outcome != 'skipped'");
    assertThat(retryAttempt)
        .contains("name: Basic E2E retry (chromium)")
        .contains("needs: [e2e-tests]")
        .contains(
            "needs.e2e-tests.outputs.route_probe_outcome == 'failure'",
            "needs.e2e-tests.outputs.proxy_probe_outcome == 'failure'",
            "needs.e2e-tests.outputs.playwright_outcome == 'failure'")
        .contains("runs-on: ubuntu-24.04")
        .contains("-retry")
        .doesNotContain("-route-retry")
        .doesNotContain("name: Basic E2E fresh-runner retry")
        .doesNotContain("continue-on-error: true");
  }

  @Test
  void deployedSmokeShouldVerifyTheBackendThroughTheFrontendProxy() throws IOException {
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

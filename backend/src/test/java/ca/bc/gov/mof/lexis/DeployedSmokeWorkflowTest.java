package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class DeployedSmokeWorkflowTest {

  @Test
  void deployedSmokeShouldUseOneJobAndPropagateFailureWithDiagnostics() throws IOException {
    String workflow = read(".github/workflows/reusable-tests.yml");

    assertThat(workflow.lines().filter(line -> line.equals("  e2e-tests:")).count()).isEqualTo(1);
    assertThat(workflow.lines().filter(line -> line.contains("name: Basic E2E")).count())
        .isEqualTo(1);
    assertThat(workflow)
        .contains(
            "name: Basic E2E (${{ matrix.project }})",
            "- name: Run basic Playwright smoke suite\n        id: playwright",
            "steps.playwright.outcome == 'success'",
            "steps.playwright.outcome == 'failure'",
            "!cancelled()",
            "name: playwright-report-${{ matrix.project }}-${{ inputs.target }}",
            "path: frontend/playwright-report")
        .doesNotContain(
            "e2e-retry:",
            "continue-on-error:",
            "route_probe_outcome:",
            "proxy_probe_outcome:",
            "playwright_outcome:",
            "needs.e2e-tests.outputs",
            "steps.route_probe.outcome",
            "steps.proxy_probe.outcome");
  }

  @Test
  void playwrightShouldRetryFailedTestsOnceInCiOnlyAndRetainSmokeFailureTraces()
      throws IOException {
    String smokeConfig = read("frontend/playwright.config.ts");
    String regressionConfig = read("frontend/e2e/playwright-config.ts");

    assertThat(smokeConfig)
        .contains("retries: process.env.CI ? 1 : 0", "trace: 'retain-on-failure'")
        .doesNotContain("on-first-retry");
    assertThat(regressionConfig).contains("retries: process.env.CI ? 1 : 0");
  }

  @Test
  void smokeFailureShouldBlockPrResultsAndProductionDeployment() throws IOException {
    String pullRequestWorkflow = read(".github/workflows/pr-open.yml");
    String mergeWorkflow = read(".github/workflows/merge.yml");
    String pullRequestResults =
        pullRequestWorkflow.substring(pullRequestWorkflow.indexOf("  results:"));
    String productionDeployment = mergeWorkflow.substring(mergeWorkflow.indexOf("  deploy-prod:"));

    assertThat(pullRequestWorkflow).contains("uses: ./.github/workflows/reusable-tests.yml");
    assertThat(pullRequestResults)
        .contains("name: PR Results", "tests,", "if: always()")
        .contains("contains(needs.*.result, 'failure')", "exit 1");
    assertThat(mergeWorkflow).contains("uses: ./.github/workflows/reusable-tests.yml");
    assertThat(productionDeployment).contains("needs: [tests, init]");
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

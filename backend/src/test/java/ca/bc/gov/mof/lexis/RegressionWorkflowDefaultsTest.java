package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class RegressionWorkflowDefaultsTest {

  @Test
  void regressionWorkflowShouldUseOnlyIdirTestCredentials() throws IOException {
    String workflow = Files.readString(resolveRegressionWorkflow());

    assertThat(workflow)
        .contains("name: Regression")
        .contains(
            "E2E_BASE_URL: https://${{ github.event.repository.name }}-test.apps.gold.devops.gov.bc.ca")
        .contains("if: github.ref_name == github.event.repository.default_branch")
        .contains("environment:\n      name: test\n      deployment: false")
        .contains("E2E_IDIR_USER: ${{ secrets.E2E_IDIR_USER }}")
        .contains("E2E_IDIR_PASSWORD: ${{ secrets.E2E_IDIR_PASSWORD }}")
        .contains("test environment secret is required")
        .contains("test -n \"$E2E_IDIR_USER\"")
        .contains("test -n \"$E2E_IDIR_PASSWORD\"")
        .contains("::add-mask::$E2E_IDIR_USER")
        .contains("::add-mask::$E2E_IDIR_PASSWORD")
        .contains("npm run e2e:regression -- --reporter=line")
        .doesNotContain("actions/upload-artifact")
        .doesNotContain("playwright-report")
        .doesNotContain("--reporter=html,list")
        .doesNotContain("E2E_BCEID")
        .doesNotContain("BCEID_PASSWORD")
        .doesNotContain("BCEID_USER");
  }

  @Test
  void regressionWorkflowShouldReportFailuresOutsideDeploymentEnvironment() throws IOException {
    String workflow = Files.readString(resolveRegressionWorkflow());

    assertThat(workflow)
        .contains("id: run-regression")
        .contains("continue-on-error: true")
        .contains("regression-result:")
        .contains("needs: [credentialed-regression]")
        .contains("needs.credentialed-regression.outputs.regression-outcome")
        .contains("TEST regression failed.");
  }

  @Test
  void regressionPlaywrightConfigShouldAvoidCredentialArtifacts() throws IOException {
    String config = Files.readString(resolveRegressionPlaywrightConfig());

    assertThat(config)
        .contains("testMatch: /regression\\.spec\\.ts/")
        .contains("reporter: [['line']]")
        .contains("trace: 'off'")
        .contains("screenshot: 'off'")
        .contains("video: 'off'");
  }

  @Test
  void regressionDiagnosticsShouldRedactTheConfiguredCredentials() throws IOException {
    String source = Files.readString(resolveRegressionAuthSource());

    assertThat(source)
        .contains("process.env.E2E_IDIR_USER")
        .contains("process.env.E2E_IDIR_PASSWORD")
        .contains("redacted.split(credential).join('[credential-redacted]')");
  }

  @Test
  void regressionSpecShouldKeepIndependentChecksRunningAfterFailure() throws IOException {
    String spec = Files.readString(resolveRegressionSpec());

    assertThat(spec)
        .contains("test.describe('TEST IDIR admin regression'")
        .doesNotContain("test.describe.serial('TEST IDIR admin regression'");
  }

  @Test
  void waitForFrontendShouldTolerateTransientRunnerNetworkIssues() throws IOException {
    String script = Files.readString(resolveWaitForFrontendScript());

    assertThat(script)
        .contains("WAIT_FOR_FRONTEND_IP_MODE:-ipv4")
        .contains("curl_ip_args=(--ipv4)")
        .contains("--retry \"${curl_retries}\"")
        .contains("--retry-all-errors")
        .contains("getent ahosts")
        .contains("Route DNS lookup returned ${dns_count} address record(s).")
        .contains("curl exit ${curl_status}")
        .doesNotContain("dns_output");
  }

  private static Path resolveRegressionWorkflow() {
    Path fromRepositoryRoot = Path.of(".github", "workflows", "regression.yml");
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", ".github", "workflows", "regression.yml");
  }

  private static Path resolveRegressionPlaywrightConfig() {
    Path fromRepositoryRoot = Path.of("frontend", "playwright.regression.config.ts");
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", "frontend", "playwright.regression.config.ts");
  }

  private static Path resolveRegressionSpec() {
    Path fromRepositoryRoot = Path.of("frontend", "e2e", "regression.spec.ts");
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", "frontend", "e2e", "regression.spec.ts");
  }

  private static Path resolveRegressionAuthSource() {
    Path fromRepositoryRoot = Path.of("frontend", "e2e", "utils", "regression-auth.ts");
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", "frontend", "e2e", "utils", "regression-auth.ts");
  }

  private static Path resolveWaitForFrontendScript() {
    Path fromRepositoryRoot = Path.of(".github", "scripts", "wait-for-frontend.sh");
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", ".github", "scripts", "wait-for-frontend.sh");
  }
}

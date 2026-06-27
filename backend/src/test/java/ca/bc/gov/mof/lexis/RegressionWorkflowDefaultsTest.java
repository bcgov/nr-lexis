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
            "E2E_BASE_URL: https://${{ github.event.repository.name }}-test.apps.silver.devops.gov.bc.ca")
        .contains("environment: test")
        .contains("E2E_IDIR_USER: ${{ secrets.E2E_IDIR_USER }}")
        .contains("E2E_IDIR_PASSWORD: ${{ secrets.E2E_IDIR_PASSWORD }}")
        .contains("test environment secret is required")
        .contains("test -n \"$E2E_IDIR_USER\"")
        .contains("test -n \"$E2E_IDIR_PASSWORD\"")
        .contains("npm run e2e:regression -- --reporter=html,list")
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
        .contains("trace: 'off'")
        .contains("screenshot: 'off'")
        .contains("video: 'off'");
  }

  @Test
  void regressionSpecShouldKeepIndependentChecksRunningAfterFailure() throws IOException {
    String spec = Files.readString(resolveRegressionSpec());

    assertThat(spec)
        .contains("test.describe('TEST IDIR admin regression'")
        .doesNotContain("test.describe.serial('TEST IDIR admin regression'");
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
}

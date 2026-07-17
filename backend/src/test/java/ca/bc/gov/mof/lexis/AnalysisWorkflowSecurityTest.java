package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class AnalysisWorkflowSecurityTest {

  @Test
  void trivyInfrastructureShouldBeRequiredWhileFindingsRemainNonBlocking()
      throws IOException {
    String workflow = read(".github/workflows/analysis.yml");
    String trivyJob = section(workflow, "  trivy:", "  results:");

    assertThat(trivyJob)
        .contains("contents: read")
        .contains("security-events: write")
        .contains("exit-code: \"0\"")
        .contains(
            "if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository")
        .doesNotContain("continue-on-error: true");
  }

  @Test
  void aggregateShouldIncludeTrivyAndRecognizeCancelledJobs() throws IOException {
    String workflow = read(".github/workflows/analysis.yml");
    String resultsJob = workflow.substring(workflow.indexOf("  results:"));

    assertThat(resultsJob)
        .contains("needs: [backend-tests, frontend-tests, trivy]")
        .contains("contains(needs.*.result, 'cancelled')")
        .doesNotContain("contains(needs.*.result, 'canceled')");
  }

  @Test
  void frontendTestsShouldNotInheritTheSonarSecret() throws IOException {
    String workflow = read(".github/workflows/analysis.yml");
    String frontendJob = section(workflow, "  frontend-tests:", "  trivy:");
    String testCommands = section(frontendJob, "          commands: |", "          dir: frontend");

    assertThat(frontendJob)
        .contains(
            "sonar_token: ${{ github.event_name == 'push' && secrets.sonar_token_frontend || '' }}")
        .doesNotContain("env:\n          sonar_token:", "sonar_token: ${{ env.sonar_token }}");
    assertThat(testCommands).doesNotContain("secrets.", "sonar_token", "SONAR_TOKEN");
  }

  @Test
  void ordinaryPullRequestTestsShouldNotReceiveRepositorySecrets() throws IOException {
    String workflow = read(".github/workflows/pr-open.yml");
    String backendJob = section(workflow, "  backend-tests:", "  frontend-tests:");
    String frontendJob = section(workflow, "  frontend-tests:", "  deploys:");

    assertThat(backendJob).doesNotContain("secrets.", "environment:");
    assertThat(frontendJob).doesNotContain("secrets.", "environment:");
  }

  @Test
  void analysisBackendTestsShouldNotReceiveTheSonarSecret() throws IOException {
    String workflow = read(".github/workflows/analysis.yml");
    String backendJob = section(workflow, "  backend-tests:", "  frontend-tests:");
    String testStep = section(backendJob, "      - name: Maven verify", "      - name: SonarCloud scan");
    String sonarStep = backendJob.substring(backendJob.indexOf("      - name: SonarCloud scan"));

    assertThat(testStep).doesNotContain("secrets.", "SONAR_TOKEN", "environment:");
    assertThat(sonarStep)
        .contains("if: github.event_name == 'push' && env.SONAR_TOKEN != ''")
        .contains("SONAR_TOKEN: ${{ secrets.sonar_token_backend }}");
  }

  private static String section(String source, String startMarker, String endMarker) {
    int start = source.indexOf(startMarker);
    int end = source.indexOf(endMarker, start + startMarker.length());
    assertThat(start).isNotNegative();
    assertThat(end).isGreaterThan(start);
    return source.substring(start, end);
  }

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..", relativePath));
  }
}

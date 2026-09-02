package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class PublicPullRequestWorkflowTest {

  private static final String SAME_REPOSITORY_CONDITION =
      "github.event.pull_request.head.repo.full_name == github.repository";

  @Test
  void forkPullRequestsShouldRunReadOnlyChecksWithoutPublishingOrDeploying() throws IOException {
    String workflow = read(".github/workflows/pr-open.yml");

    assertThat(workflowJob(workflow, "builds", "backend-tests"))
        .contains("if: " + SAME_REPOSITORY_CONDITION)
        .contains("packages: write");
    assertThat(workflowJob(workflow, "deploys", "tests"))
        .contains("if: " + SAME_REPOSITORY_CONDITION)
        .contains("uses: ./.github/workflows/reusable-deploy.yml");
    assertThat(workflowJob(workflow, "tests", "results"))
        .contains(SAME_REPOSITORY_CONDITION)
        .contains("needs.deploys.outputs.triggered == 'true'");

    assertThat(workflowJob(workflow, "backend-tests", "frontend-tests"))
        .doesNotContain(SAME_REPOSITORY_CONDITION);
    assertThat(workflowJob(workflow, "frontend-tests", "deploys"))
        .doesNotContain(SAME_REPOSITORY_CONDITION);
    assertThat(workflowJob(workflow, "results", null))
        .contains("contains(needs.*.result, 'failure')")
        .doesNotContain("contains(needs.*.result, 'skipped')");

    String validationWorkflow = read(".github/workflows/pr-validate.yml");
    assertThat(workflowJob(validationWorkflow, "validate", "results"))
        .contains(SAME_REPOSITORY_CONDITION)
        .contains("pull-requests: write");
    assertThat(workflowJob(validationWorkflow, "results", null))
        .doesNotContain("contains(needs.*.result, 'skipped')");
  }

  @Test
  void mergeWorkflowShouldNotAdvertiseUnsupportedManualDeployment() throws IOException {
    String workflow = read(".github/workflows/merge.yml");
    String triggerBlock =
        workflow.substring(workflow.indexOf("on:"), workflow.indexOf("concurrency:"));

    assertThat(triggerBlock)
        .contains("push:")
        .doesNotContain("workflow_dispatch:");
  }

  @Test
  void mergeWorkflowShouldBuildAndDeployTheExactMainCommit() throws IOException {
    String workflow = read(".github/workflows/merge.yml");

    assertThat(workflowJob(workflow, "builds", "deploy-test"))
        .contains("uses: actions/checkout@")
        .contains("ref: ${{ github.sha }}")
        .contains("persist-credentials: false")
        .contains("actual_sha=\"$(git rev-parse HEAD)\"")
        .contains("uses: docker/build-push-action@")
        .contains("context: ./${{ matrix.package }}")
        .contains("type=raw,value=${{ github.sha }}")
        .contains("uses: actions/attest-build-provenance@")
        .contains("package: [backend, frontend]")
        .doesNotContain("bcgov/action-builder-ghcr@", "github.ref", "tag_fallback:");
    assertThat(workflowJob(workflow, "deploy-test", "tests"))
        .contains("needs: [builds]")
        .contains("tag: ${{ github.sha }}");
    assertThat(workflowJob(workflow, "deploy-prod", "monitor-prod"))
        .contains("tag: ${{ github.sha }}");
    assertThat(workflowJob(workflow, "promote", null))
        .contains("target: ${{ github.sha }}")
        .doesNotContain("needs.init.outputs.pr");
  }

  private static String workflowJob(String workflow, String jobName, String nextJobName) {
    int start = workflow.indexOf("  " + jobName + ":");
    int end =
        nextJobName == null
            ? workflow.length()
            : workflow.indexOf("  " + nextJobName + ":", start);
    assertThat(start).isNotNegative();
    assertThat(end).isGreaterThan(start);
    return workflow.substring(start, end);
  }

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..").resolve(relativePath));
  }
}

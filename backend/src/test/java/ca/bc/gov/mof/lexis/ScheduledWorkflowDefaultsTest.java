package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ScheduledWorkflowDefaultsTest {

  @Test
  void scheduledPrPurgeShouldKeepOpenShiftConnectionInputs() throws IOException {
    String ageOutJob = scheduledPrPurgeJob();

    assertThat(ageOutJob)
        .contains("name: PR Deployment Purge")
        .contains("environment: dev")
        .contains("oc_namespace: ${{ secrets.oc_namespace }}")
        .contains("oc_token: ${{ secrets.oc_token }}")
        .contains("oc_server: ${{ vars.oc_server }}")
        .contains("oc whoami >/dev/null")
        .contains("oc project \"${NAMESPACE}\" >/dev/null")
        .doesNotContain("oc_server: ${{ secrets.oc_server }}");
  }

  @Test
  void scheduledPrPurgeShouldOnlyDeleteLabeledPrDeploymentResources() throws IOException {
    String ageOutJob = scheduledPrPurgeJob();

    assertThat(ageOutJob)
        .contains("set -euo pipefail")
        .contains("RESOURCE_TYPES=\"deploy,rs,pod,svc,route,hpa,networkpolicy,secret,pvc,cm\"")
        .contains("oc auth can-i delete deployments -n \"${NAMESPACE}\"")
        .contains("oc auth can-i delete routes -n \"${NAMESPACE}\"")
        .contains("oc auth can-i delete persistentvolumeclaims -n \"${NAMESPACE}\"")
        .contains("oc auth can-i delete networkpolicies -n \"${NAMESPACE}\"")
        .contains("grep -E \"${REPO}-(backend|frontend)-[0-9]+\"")
        .contains(
            "LABEL=$(oc get deploy \"${name}\" -n \"${NAMESPACE}\" -o jsonpath='{.metadata.labels.app}'")
        .contains(
            "oc delete \"${RESOURCE_TYPES}\" -n \"${NAMESPACE}\" -l \"app=${LABEL}\" --ignore-not-found")
        .doesNotContain("oc delete all")
        .doesNotContain("oc delete project")
        .doesNotContain("oc delete namespace")
        .doesNotContain("oc delete \"${RESOURCE_TYPES}\" -n \"${NAMESPACE}\" --all");
  }

  private static String scheduledPrPurgeJob() throws IOException {
    String workflow = Files.readString(resolveScheduledWorkflow());
    return workflowJob(workflow, "ageOutPRs", "schema-spy");
  }

  private static Path resolveScheduledWorkflow() {
    Path fromRepositoryRoot = Path.of(".github", "workflows", "scheduled.yml");
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", ".github", "workflows", "scheduled.yml");
  }

  private static String workflowJob(String workflow, String jobName, String nextJobName) {
    int start = workflow.indexOf("  " + jobName + ":");
    int end = workflow.indexOf("  " + nextJobName + ":", start);
    assertThat(start).isNotNegative();
    assertThat(end).isGreaterThan(start);
    return workflow.substring(start, end);
  }
}

package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ClamAvDeploymentConfigTest {

  @Test
  void deploymentTemplateShouldRequireSharedClamAvServiceHost() throws IOException {
    String template = read("backend/openshift.deploy.yml");

    assertThat(template)
        .contains("name: LEXIS_VIRUS_SCAN_HOST")
        .contains("description: Shared ClamAV service DNS name")
        .contains("required: true")
        .contains("value: ${LEXIS_VIRUS_SCAN_HOST}")
        .contains("name: LEXIS_VIRUS_SCAN_PORT")
        .contains("value: \"3310\"")
        .doesNotContain("${NAME}-clamav-${ZONE}")
        .doesNotContain("CLAMAV_REGISTRY")
        .doesNotContain("CLAMAV_IMAGE_TAG")
        .doesNotContain("CLAMAV_DEFINITION_MIRROR");
  }

  @Test
  void reusableDeployShouldBuildSharedClamAvServiceHostFromEnvironmentSecret() throws IOException {
    String workflow = read(".github/workflows/reusable-deploy.yml");

    assertThat(workflow)
        .contains("clamav_namespace:")
        .contains("-p LEXIS_VIRUS_SCAN_HOST=\"clamav.${{ secrets.clamav_namespace }}.svc\"");
  }

  @Test
  void deploymentWorkflowCallersShouldSupplySharedClamAvNamespace() throws IOException {
    String prOpenWorkflow = read(".github/workflows/pr-open.yml");
    String mergeWorkflow = read(".github/workflows/merge.yml");
    String namespaceSecret = "clamav_namespace: ${{ secrets.clamav_namespace }}";

    assertThat(prOpenWorkflow).contains(namespaceSecret);
    assertThat(occurrences(mergeWorkflow, namespaceSecret)).isEqualTo(2);
  }

  @Test
  void previewCleanupShouldNotManageLocalClamAvWorkloads() throws IOException {
    String workflow = read(".github/workflows/pr-close.yml");

    assertThat(workflow)
        .contains("for component in backend frontend; do")
        .contains("s/^${REPO}-(backend|frontend)-([0-9]+)$/\\2/p")
        .doesNotContain("backend frontend clamav", "(backend|frontend|clamav)");
  }

  private static int occurrences(String value, String expected) {
    int count = 0;
    int index = 0;
    while ((index = value.indexOf(expected, index)) >= 0) {
      count++;
      index += expected.length();
    }
    return count;
  }

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..").resolve(relativePath));
  }
}

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

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..").resolve(relativePath));
  }
}

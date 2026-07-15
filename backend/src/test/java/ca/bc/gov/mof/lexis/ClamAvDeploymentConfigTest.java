package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class ClamAvDeploymentConfigTest {

  @Test
  void deploymentTemplatesShouldRequireSharedClamAvServiceHost() throws IOException {
    for (Path templatePath : deploymentTemplates()) {
      String template = Files.readString(resolve(templatePath));

      assertThat(template)
          .contains("name: LEXIS_VIRUS_SCAN_PORT")
          .contains("value: \"3310\"")
          .doesNotContain("${NAME}-clamav-${ZONE}")
          .doesNotContain("CLAMAV_REGISTRY")
          .doesNotContain("CLAMAV_IMAGE_TAG")
          .doesNotContain("CLAMAV_DEFINITION_MIRROR");
    }

    assertThat(Files.readString(resolve(Path.of("backend", "openshift.deploy.yml"))))
        .contains(
            "name: LEXIS_VIRUS_SCAN_HOST\n"
                + "    description: Shared ClamAV service DNS name\n"
                + "    required: true");
    assertThat(Files.readString(resolve(Path.of("backend", "openshift", "deployment.yaml"))))
        .contains("value: ${LEXIS_VIRUS_SCAN_HOST}");
  }

  @Test
  void reusableDeployShouldBuildSharedClamAvServiceHostFromEnvironmentSecret() throws IOException {
    String template = Files.readString(resolve(Path.of(".github", "workflows", "reusable-deploy.yml")));

    assertThat(template)
        .contains("clamav_namespace:")
        .contains("-p LEXIS_VIRUS_SCAN_HOST=\"clamav.${{ secrets.clamav_namespace }}.svc\"");
  }

  private static List<Path> deploymentTemplates() {
    return List.of(
        Path.of("backend", "openshift.deploy.yml"),
        Path.of("backend", "openshift", "deployment.yaml"));
  }

  private static Path resolve(Path path) {
    if (Files.exists(path)) {
      return path;
    }

    return Path.of("..").resolve(path);
  }
}

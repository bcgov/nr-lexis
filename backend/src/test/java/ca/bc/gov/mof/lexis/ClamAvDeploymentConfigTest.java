package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class ClamAvDeploymentConfigTest {

  @Test
  void clamdConfigShouldUseWritableLogFile() throws IOException {
    for (Path configPath : clamdConfigPaths()) {
      String config = Files.readString(resolve(configPath));

      assertThat(config)
          .contains("LogFile /var/log/clamav/clamav.log")
          .doesNotContain("LogFile /dev/stdout")
          .doesNotContain("AllowSupplementaryGroups");
    }
  }

  private static List<Path> clamdConfigPaths() {
    return List.of(
        Path.of("clamav", "config", "clamd.conf"),
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

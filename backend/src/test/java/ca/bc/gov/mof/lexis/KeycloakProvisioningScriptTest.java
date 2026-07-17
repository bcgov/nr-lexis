package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class KeycloakProvisioningScriptTest {

  @Test
  void provisioningScriptShouldFailClosedAndEnforceExclusiveScopeAssignment()
      throws IOException, InterruptedException {
    Path script = resolve(".github/scripts/test-ensure-keycloak-scopes.sh").toAbsolutePath();
    Process process = new ProcessBuilder("bash", script.toString()).redirectErrorStream(true).start();

    boolean completed = process.waitFor(30, TimeUnit.SECONDS);
    String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);

    assertThat(completed).as(output).isTrue();
    assertThat(process.exitValue()).as(output).isZero();
    assertThat(output).contains("Keycloak provisioning script checks passed.");
  }

  private static Path resolve(String path) {
    Path fromRepositoryRoot = Path.of(path);
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", path);
  }
}

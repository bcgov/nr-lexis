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

  @Test
  void definitionsShouldRefreshPeriodicallyAndExposeStaleness() throws IOException {
    String freshclam = Files.readString(resolve(Path.of("clamav", "config", "freshclam.conf")));
    String deployment = Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));
    String dockerfile = Files.readString(resolve(Path.of("clamav", "Dockerfile")));
    String startup = Files.readString(resolve(Path.of("clamav", "start-clamav.sh")));
    String health = Files.readString(resolve(Path.of("clamav", "clamdcheck.sh")));

    assertThat(freshclam).contains("Checks 12");
    assertThat(deployment).contains("Checks 12");
    assertThat(dockerfile).contains("CMD [\"/opt/app-root/start-clamav.sh\"]");
    assertThat(startup).contains("freshclam --daemon --foreground=true");
    assertThat(health).contains("-mmin -4320");
  }

  @Test
  void startupShouldSuperviseScannerAndDefinitionRefreshProcesses() throws IOException {
    String startup = Files.readString(resolve(Path.of("clamav", "start-clamav.sh")));

    assertThat(startup)
        .contains("#!/usr/bin/env bash")
        .contains("trap handle_shutdown TERM INT HUP")
        .contains("freshclam &")
        .contains("if wait \"${freshclam_pid}\"")
        .contains("freshclam --daemon --foreground=true &")
        .contains("freshclam_pid=$!")
        .contains("clamd &")
        .contains("clamd_pid=$!")
        .contains("wait -n -p exited_pid")
        .contains("kill -TERM \"${freshclam_pid}\"")
        .contains("kill -TERM \"${clamd_pid}\"")
        .contains("exited unexpectedly; stopping the ClamAV container for restart.")
        .doesNotContain("exec clamd");
  }

  @Test
  void livenessShouldOnlyPingWhileReadinessAlsoRequiresFreshDefinitions() throws IOException {
    String deployment = Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));
    String health = Files.readString(resolve(Path.of("clamav", "clamdcheck.sh")));

    assertThat(deployment)
        .contains(
            "              livenessProbe:\n"
                + "                exec:\n"
                + "                  command:\n"
                + "                    - /opt/app-root/clamdcheck.sh\n"
                + "                    - live\n")
        .contains(
            "              readinessProbe:\n"
                + "                exec:\n"
                + "                  command:\n"
                + "                    - /opt/app-root/clamdcheck.sh\n"
                + "                initialDelaySeconds: 60\n");
    assertThat(health)
        .contains("printf 'zPING\\0'")
        .contains("if [ \"${1:-ready}\" = \"live\" ]")
        .contains("-mmin -4320");
    assertThat(health.indexOf("exit 0")).isLessThan(health.indexOf("-mmin -4320"));
  }

  private static List<Path> clamdConfigPaths() {
    return List.of(
        Path.of("clamav", "config", "clamd.conf"),
        Path.of("backend", "openshift.deploy.yml"));
  }

  private static Path resolve(Path path) {
    if (Files.exists(path)) {
      return path;
    }
    return Path.of("..").resolve(path);
  }
}

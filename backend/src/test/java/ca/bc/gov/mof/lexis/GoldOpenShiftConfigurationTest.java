package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class GoldOpenShiftConfigurationTest {

  private static final String GOLD_APPS = "apps.gold.devops.gov.bc.ca";
  @Test
  void deployAndCleanupJobsShouldUseConfiguredOpenShiftServer() throws IOException {
    String deploy = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));
    String scheduled = Files.readString(resolve(".github/workflows/scheduled.yml"));
    String prClose = Files.readString(resolve(".github/workflows/pr-close.yml"));

    assertThat(deploy).contains("oc_server: ${{ vars.oc_server }}");
    assertThat(scheduled).contains("oc_server: ${{ vars.oc_server }}");
    assertThat(prClose).contains("oc_server: ${{ vars.oc_server }}");
    assertThat(deploy + scheduled + prClose).doesNotContain("api.silver.devops.gov.bc.ca");
  }

  @Test
  void externalPrCloseHelperShouldOnlyPromoteImages() throws IOException {
    String workflow = Files.readString(resolve(".github/workflows/pr-close.yml"));
    String promotion = between(workflow, "  promotion:", "  cleanup-networkpolicies:");

    assertThat(promotion)
        .contains("name: Image Promotion")
        .contains("packages: backend frontend")
        .doesNotContain("cleanup:", "cleanup_name:", "oc_namespace", "oc_token", "oc_server");
  }

  @Test
  void applicationRoutesShouldUseGold() throws IOException {
    String backend = Files.readString(resolve("backend/openshift.deploy.yml"));
    String frontend = Files.readString(resolve("frontend/openshift.deploy.yml"));
    String workflows = readWorkflowFiles();

    assertThat(backend)
        .contains("value: " + GOLD_APPS)
        .doesNotContain("api.silver.devops.gov.bc.ca");
    assertThat(frontend).contains("value: " + GOLD_APPS).doesNotContain("silver.devops.gov.bc.ca");
    assertThat(workflows)
        .contains(GOLD_APPS)
        .doesNotContain("api.silver.devops.gov.bc.ca", "apps.silver.devops.gov.bc.ca");
  }

  private static String readWorkflowFiles() throws IOException {
    Path workflowDirectory = resolve(".github/workflows");
    StringBuilder result = new StringBuilder();
    try (var files = Files.list(workflowDirectory)) {
      for (Path file : files.filter(path -> path.toString().endsWith(".yml")).sorted().toList()) {
        result.append(Files.readString(file));
      }
    }
    return result.toString();
  }

  private static String between(String value, String startMarker, String endMarker) {
    int start = value.indexOf(startMarker);
    int end = value.indexOf(endMarker, start);
    assertThat(start).isNotNegative();
    assertThat(end).isGreaterThan(start);
    return value.substring(start, end);
  }

  private static Path resolve(String path) {
    Path fromRepositoryRoot = Path.of(path);
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", path);
  }
}

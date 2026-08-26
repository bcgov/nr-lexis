package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class NexcolGatewayTopologyConfigTest {

  private static final String NEXCOL_PATH = "/api/lexis/federal/submissions";
  private static final String PREVALIDATION_PATH = NEXCOL_PATH + "/prevalidation";
  private static final String TEST_SERVICE = "nr-lexis-backend-test.da5fad-test.svc";
  private static final String PROD_SERVICE = "nr-lexis-backend-prod.da5fad-prod.svc";

  @Test
  void gatewaysShouldUseTheClusterLocalBackendServices() throws IOException {
    assertClusterLocalGateway(
        "gateway/nr-lexis-nexcol-test.kong.yaml",
        TEST_SERVICE,
        "https://test.loginproxy.gov.bc.ca/auth/realms/forests");
    assertClusterLocalGateway(
        "gateway/nr-lexis-nexcol-prod.kong.yaml",
        PROD_SERVICE,
        "https://loginproxy.gov.bc.ca/auth/realms/forests");
  }

  private static void assertClusterLocalGateway(String path, String service, String issuer)
      throws IOException {
    String gateway = Files.readString(resolve(path));

    assertThat(occurrences(gateway, "host: " + service)).isEqualTo(2);
    assertThat(occurrences(gateway, "port: 8080")).isEqualTo(2);
    assertThat(occurrences(gateway, "protocol: http")).isEqualTo(2);
    assertThat(occurrences(gateway, "- " + PREVALIDATION_PATH)).isEqualTo(2);
    assertThat(gateway)
        .contains(
            "methods:\n          - POST",
            "methods:\n          - OPTIONS",
            "allowed_iss:\n            - " + issuer,
            "scope:\n            - lexis:federal-submission:submit",
            "uri_param_names: []")
        .doesNotContain(".apps.gold.devops.gov.bc.ca", "uri_param_names:\n            - jwt");
  }

  @Test
  void backendShouldOnlyAdmitTheFrontendGatewayAndMonitoring() throws IOException {
    String backend = Files.readString(resolve("backend/openshift.deploy.yml"));
    String workflow = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));

    assertThat(backend)
        .contains(
            "app: ${NAME}-frontend-${ZONE}",
            "environment: ${ZONE}\n                  name: b8840c",
            "network.openshift.io/policy-group: monitoring")
        .doesNotContain(
            "kind: Route",
            "network.openshift.io/policy-group: ingress",
            "- name: SLOT");
    assertThat(occurrences(workflow, "-p SLOT=")).isOne();
  }

  @Test
  void frontendRouteShouldHideOnlyTheNexcolMachineEndpoints() throws IOException {
    String caddy = Files.readString(resolve("frontend/Caddyfile"));
    String defaultRoute = Files.readString(resolve("frontend/openshift.route.yml"));
    String vanityRoute = Files.readString(resolve("frontend/openshift.vanity-route.yml"));
    String matcher =
        "@nexcol_api path " + NEXCOL_PATH + " " + NEXCOL_PATH + "/*";

    assertThat(defaultRoute).contains("kind: Route", "name: ${NAME}-frontend-${ZONE}");
    assertThat(vanityRoute).contains("kind: Route", "name: ${NAME}-frontend-${ZONE}");
    assertThat(caddy)
        .contains(matcher, "respond @nexcol_api 404", "reverse_proxy /api* {$BACKEND_URL}")
        .doesNotContain("@nexcol_api path /api/lexis/application-submissions");
    assertThat(caddy.indexOf(matcher)).isLessThan(caddy.indexOf("reverse_proxy /api*"));
  }

  private static int occurrences(String value, String target) {
    return value.split(java.util.regex.Pattern.quote(target), -1).length - 1;
  }

  private static Path resolve(String path) {
    Path fromRepositoryRoot = Path.of(path);
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", path);
  }
}

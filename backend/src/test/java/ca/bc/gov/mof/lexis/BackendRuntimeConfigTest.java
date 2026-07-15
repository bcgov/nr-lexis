package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class BackendRuntimeConfigTest {

  @Test
  void applicationLogLevelShouldUseTheDeploymentOverrideWithAnInfoDefault() throws IOException {
    String applicationConfig =
        Files.readString(resolve(Path.of("backend", "src", "main", "resources", "application.yml")));

    assertThat(applicationConfig)
        .contains("ca.bc.gov.mof.lexis: ${APP_LOG_LEVEL:INFO}");
  }

  @Test
  void containerShouldUseLegacyPacificWallClockForOracleTimestamps() throws IOException {
    String dockerfile = Files.readString(resolve(Path.of("backend", "Dockerfile")));

    assertThat(dockerfile).contains("-Duser.timezone=America/Vancouver");
  }

  @Test
  void containerShouldSizeHeapFromItsMemoryLimitAndAllowDeploymentOverrides() throws IOException {
    String dockerfile = Files.readString(resolve(Path.of("backend", "Dockerfile")));

    assertThat(dockerfile)
        .contains("ENV JAVA_TOOL_OPTIONS=")
        .contains("-XX:InitialRAMPercentage=20.0")
        .contains("-XX:MaxRAMPercentage=60.0")
        .doesNotContain("-Xms100m")
        .doesNotContain("-Xmx200m")
        .doesNotContain("-XX:MaxMetaspaceSize=200m");
  }

  @Test
  void healthChecksShouldSeparateLivenessFromOracleReadiness() throws IOException {
    String dockerfile = Files.readString(resolve(Path.of("backend", "Dockerfile")));
    String applicationConfig =
        Files.readString(resolve(Path.of("backend", "src", "main", "resources", "application.yml")));
    String oracleConfig =
        Files.readString(
            resolve(Path.of("backend", "src", "main", "resources", "application-oracle.yml")));

    assertThat(dockerfile).contains("/actuator/health/liveness").doesNotContain("nc -z");
    assertThat(applicationConfig)
        .contains("probes:")
        .contains("enabled: true");
    assertThat(oracleConfig).contains("include: readinessState,db");

    String deployment =
        Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));
    assertThat(deployment)
        .contains("path: /actuator/health/liveness")
        .contains("path: /actuator/health/readiness")
        .doesNotContain("tcpSocket:");
  }

  @Test
  void streamingAndPodShutdownShouldBeBounded() throws IOException {
    String applicationConfig =
        Files.readString(resolve(Path.of("backend", "src", "main", "resources", "application.yml")));
    String deployment =
        Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));

    assertThat(applicationConfig)
        .contains("timeout-per-shutdown-phase: ${LEXIS_SHUTDOWN_PHASE_TIMEOUT:60s}")
        .contains("shutdown: graceful")
        .contains("request-timeout: ${LEXIS_ASYNC_REQUEST_TIMEOUT:5m}")
        .contains("mode: force")
        .contains("thread-name-prefix: lexis-stream-")
        .contains("core-size: 2")
        .contains("max-size: 4")
        .contains("queue-capacity: 8")
        .contains("await-termination: true")
        .contains("await-termination-period: 10s");
    assertThat(deployment).contains("terminationGracePeriodSeconds: 90");
    int probeStart = deployment.indexOf("startupProbe:");
    int probeEnd = deployment.indexOf("volumeMounts:", probeStart);
    assertThat(probeStart).isNotNegative();
    assertThat(probeEnd).isGreaterThan(probeStart);
    assertThat(deployment.substring(probeStart, probeEnd))
        .containsSubsequence(
            "startupProbe:",
            "path: /actuator/health/liveness",
            "periodSeconds: 5",
            "timeoutSeconds: 3",
            "failureThreshold: 60",
            "livenessProbe:",
            "path: /actuator/health/liveness",
            "periodSeconds: 15",
            "timeoutSeconds: 3",
            "failureThreshold: 3",
            "readinessProbe:",
            "path: /actuator/health/readiness",
            "periodSeconds: 10",
            "timeoutSeconds: 5",
            "failureThreshold: 3")
        .doesNotContain("initialDelaySeconds:");
  }

  @Test
  void reportQueryTimeoutShouldBeBoundedAndDeploymentConfigurable() throws IOException {
    String applicationConfig =
        Files.readString(resolve(Path.of("backend", "src", "main", "resources", "application.yml")));
    String deployment =
        Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));
    String workflow =
        Files.readString(resolve(Path.of(".github", "workflows", "reusable-deploy.yml")));

    assertThat(applicationConfig)
        .contains("query-timeout-seconds: ${LEXIS_REPORT_QUERY_TIMEOUT_SECONDS:120}");
    assertThat(deployment)
        .contains("- name: LEXIS_REPORT_QUERY_TIMEOUT_SECONDS")
        .contains("value: ${LEXIS_REPORT_QUERY_TIMEOUT_SECONDS}");
    assertThat(workflow)
        .contains(
            "LEXIS_REPORT_QUERY_TIMEOUT_SECONDS:"
                + " ${{ vars.LEXIS_REPORT_QUERY_TIMEOUT_SECONDS || '120' }}")
        .contains(
            "-p LEXIS_REPORT_QUERY_TIMEOUT_SECONDS=\"$LEXIS_REPORT_QUERY_TIMEOUT_SECONDS\"");
  }

  @Test
  void applicantEmailCaptureShouldRemainOffUntilTheOraclePackageIsDeployed()
      throws IOException {
    String applicationConfig =
        Files.readString(resolve(Path.of("backend", "src", "main", "resources", "application.yml")));
    String deployment =
        Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));
    String workflow =
        Files.readString(resolve(Path.of(".github", "workflows", "reusable-deploy.yml")));

    assertThat(applicationConfig)
        .contains(
            "applicant-email-capture-enabled:"
                + " ${LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED:false}");
    assertThat(deployment)
        .contains("- name: LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED")
        .contains("value: ${LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED}");
    assertThat(workflow)
        .contains(
            "LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED:"
                + " ${{ vars.LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED || 'false' }}")
        .contains(
            "-p LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED="
                + "\"$LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED\"");
  }

  @Test
  void applicationShouldMountGeneratedOracleTruststoreReadOnly() throws IOException {
    String oracleConfig =
        Files.readString(
            resolve(Path.of("backend", "src", "main", "resources", "application-oracle.yml")));
    String deployment =
        Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));

    int initContainerStart = deployment.indexOf("- name: ${NAME}-backend-init");
    int applicationContainerStart =
        deployment.indexOf("- name: ${NAME}-backend\n", initContainerStart);
    int volumesStart = deployment.indexOf("          volumes:", applicationContainerStart);
    assertThat(initContainerStart).isNotNegative();
    assertThat(applicationContainerStart).isGreaterThan(initContainerStart);
    assertThat(volumesStart).isGreaterThan(applicationContainerStart);

    String initContainer = deployment.substring(initContainerStart, applicationContainerStart);
    String applicationContainer = deployment.substring(applicationContainerStart, volumesStart);
    String certificateMount = "- name: api-cert\n                  mountPath: /cert";

    assertThat(oracleConfig).contains("javax.net.ssl.trustStore: ${TRUSTSTORE_PATH:/cert/jssecacerts}");
    assertThat(initContainer)
        .contains(certificateMount)
        .doesNotContain(certificateMount + "\n                  readOnly: true");
    assertThat(applicationContainer)
        .contains(certificateMount + "\n                  readOnly: true");
  }

  @Test
  void edgeTerminatedHttpBackendShouldNotReceiveServingCertificateSecret() throws IOException {
    String applicationConfig =
        Files.readString(resolve(Path.of("backend", "src", "main", "resources", "application.yml")));
    String deployment =
        Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));

    assertThat(applicationConfig)
        .contains("server:\n  port: 8080")
        .doesNotContain("server.ssl", "key-store:");
    assertThat(deployment)
        .contains("port: 8080")
        .contains("termination: edge")
        .doesNotContain(
            "service.alpha.openshift.io/serving-cert-secret-name",
            "- name: tls-certs",
            "mountPath: /etc/tls-certs",
            "secretName: ${NAME}-backend-cert-${ZONE}");
  }

  @Test
  void applicationShouldOnlyMountRequiredWritableRuntimeStorage() throws IOException {
    String dockerfile = Files.readString(resolve(Path.of("backend", "Dockerfile")));
    String applicationConfig =
        Files.readString(resolve(Path.of("backend", "src", "main", "resources", "application.yml")));
    String deployment =
        Files.readString(resolve(Path.of("backend", "openshift.deploy.yml")));

    assertThat(dockerfile).contains("VOLUME /tmp");
    assertThat(applicationConfig)
        .contains("virtualizer-directory: ${LEXIS_REPORT_VIRTUALIZER_DIRECTORY:/tmp/lexis-jasper}");
    assertThat(deployment)
        .contains("- name: init-tmp-storage\n                  mountPath: /tmp")
        .contains("- name: tmp-storage\n                  mountPath: /tmp")
        .contains("- name: tmp-storage\n              emptyDir: {}")
        .contains("- name: init-tmp-storage\n              emptyDir: {}")
        .doesNotContain(
            "- name: log-storage",
            "- name: app-storage",
            "mountPath: /logs",
            "mountPath: /temp");
  }

  @Test
  void containerBuildContextsShouldExcludeLocalSecrets() throws IOException {
    String backendDockerIgnore =
        Files.readString(resolve(Path.of("backend", ".dockerignore")));
    String frontendDockerIgnore =
        Files.readString(resolve(Path.of("frontend", ".dockerignore")));

    assertThat(backendDockerIgnore)
        .contains("src/main/resources/application-local.yml")
        .contains("src/main/resources/cert/")
        .doesNotContain("src/main/resources/application-oracle.yml");
    assertThat(frontendDockerIgnore)
        .containsSubsequence(".env*", "!.env.example");
  }

  private static Path resolve(Path path) {
    if (Files.exists(path)) {
      return path;
    }
    return Path.of("..").resolve(path);
  }
}

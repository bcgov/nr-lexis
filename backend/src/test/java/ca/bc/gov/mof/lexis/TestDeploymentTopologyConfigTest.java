package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TestDeploymentTopologyConfigTest {

  @Test
  void testShouldUseSingleReplicaJvmLockProfile() throws IOException {
    String mergeWorkflow = Files.readString(resolve(".github/workflows/merge.yml"));
    String testDeploy = workflowJob(mergeWorkflow, "deploy-test", "tests");

    assertThat(testDeploy)
        .contains("backend_replicas: \"1\"")
        .contains("frontend_replicas: \"1\"")
        .contains("backend_cpu_request: \"500m\"")
        .contains("backend_memory_request: \"1Gi\"")
        .contains("backend_cpu_limit: \"1500m\"")
        .contains("backend_memory_limit: \"2Gi\"")
        .contains("frontend_cpu_request: \"100m\"")
        .contains("frontend_memory_request: \"128Mi\"")
        .contains("frontend_cpu_limit: \"500m\"")
        .contains("frontend_memory_limit: \"256Mi\"")
        .contains("expiry_enabled: true");
  }

  @Test
  void productionShouldRetainSingleBackendWithExpiryDisabled() throws IOException {
    String mergeWorkflow = Files.readString(resolve(".github/workflows/merge.yml"));
    String prodDeploy = workflowJob(mergeWorkflow, "deploy-prod", "monitor-prod");

    assertThat(prodDeploy)
        .contains("backend_replicas: \"1\"")
        .contains("frontend_replicas: \"3\"")
        .doesNotContain("expiry_enabled: true");
  }

  @Test
  void reusableDeploymentShouldPassResourceAndExpiryInputsToTemplates() throws IOException {
    String workflow = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));
    String backendTemplate = Files.readString(resolve("backend/openshift.deploy.yml"));
    String frontendTemplate = Files.readString(resolve("frontend/openshift.deploy.yml"));

    assertThat(workflow)
        .contains("if: ${{ inputs.backend_replicas != '1' }}")
        .contains("LEXIS edit and scheduler locks are JVM-local; backend_replicas must be 1")
        .contains("LEXIS_EXPIRY_ENABLED: ${{ inputs.expiry_enabled && 'true' || 'false' }}")
        .contains(
            "LEXIS_PERMIT_INVOICE_MODE:"
                + " ${{ vars.LEXIS_PERMIT_INVOICE_MODE || 'legacy-best-effort' }}")
        .contains("-p LEXIS_PERMIT_INVOICE_MODE=\"$LEXIS_PERMIT_INVOICE_MODE\"")
        .contains(
            "LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS:"
                + " ${{ vars.LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS || '60' }}")
        .contains(
            "-p LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS="
                + "\"$LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS\"")
        .contains(
            "LEXIS_MAIL_OVERRIDE_RECIPIENTS: ${{ secrets.LEXIS_MAIL_OVERRIDE_RECIPIENTS }}")
        .contains(
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS:"
                + " ${{ secrets.LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS }}")
        .contains("-p MIN_CPU=\"${{ inputs.backend_cpu_request }}\"")
        .contains("-p MAX_MEM=\"${{ inputs.backend_memory_limit }}\"")
        .contains("-p MIN_CPU=\"${{ inputs.frontend_cpu_request }}\"")
        .contains("-p MAX_MEM=\"${{ inputs.frontend_memory_limit }}\"");
    assertThat(backendTemplate)
        .contains("- name: MAX_REPLICAS\n    value: \"1\"")
        .contains("type: Recreate")
        .contains(
            "- name: LEXIS_PERMIT_INVOICE_MODE\n"
                + "    description: Permit invoice coordinator; legacy-best-effort preserves the legacy workflow\n"
                + "    value: legacy-best-effort")
        .contains("- name: LEXIS_PERMIT_INVOICE_MODE\n                  value: ${LEXIS_PERMIT_INVOICE_MODE}")
        .contains("- name: LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS\n    description: Requested timeout for each isolated GBMS transaction\n    value: \"60\"")
        .contains("- name: LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS\n                  value: ${LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS}")
        .contains("cpu: ${MIN_CPU}")
        .contains("memory: ${MIN_MEM}")
        .contains("cpu: ${MAX_CPU}")
        .contains("memory: ${MAX_MEM}");
    assertThat(frontendTemplate)
        .contains("cpu: ${MIN_CPU}")
        .contains("memory: ${MIN_MEM}")
        .contains("cpu: ${MAX_CPU}")
        .contains("memory: ${MAX_MEM}");
  }

  @Test
  void reusableDeploymentShouldScopeSensitiveValuesToTheirRequiredSteps() throws IOException {
    String workflow = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));
    String backendJob = workflowJob(workflow, "backend", "frontend");
    String frontendJob = workflow.substring(workflow.indexOf("  frontend:"));
    String backendJobEnv = between(backendJob, "    env:", "    steps:");
    String checkoutStep =
        between(
            backendJob,
            "      - uses: actions/checkout@",
            "      - name: Require Gold OpenShift target");
    String keycloakStep =
        between(
            backendJob,
            "      - name: Ensure Keycloak scopes and NEXCOL client",
            "      - uses: bcgov/action-deployer-openshift@");
    String backendDeployStep =
        backendJob.substring(backendJob.indexOf("      - uses: bcgov/action-deployer-openshift@"));
    String backendBeforeDeploy =
        backendJob.substring(0, backendJob.indexOf("      - uses: bcgov/action-deployer-openshift@"));
    String frontendBeforeDeploy =
        frontendJob.substring(0, frontendJob.indexOf("      - uses: bcgov/action-deployer-openshift@"));
    String frontendDeployStep =
        frontendJob.substring(frontendJob.indexOf("      - uses: bcgov/action-deployer-openshift@"));

    assertThat(backendJobEnv)
        .contains("KC_SA_CLIENT_ID: ${{ secrets.keycloak_sa_client_id }}")
        .doesNotContain(
            "DATABASE_HOST",
            "DATABASE_SERVICE_NAME",
            "DATABASE_USER",
            "DATABASE_PASSWORD",
            "KEYSTORE_SECRET",
            "LEXIS_PROD_RTM_ONLY",
            "LEXIS_EXPIRY_ENABLED",
            "LEXIS_PERMIT_INVOICE_MODE",
            "LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS",
            "LEXIS_MAIL_ENABLED",
            "LEXIS_MAIL_NON_PRODUCTION",
            "LEXIS_MAIL_FROM",
            "LEXIS_MAIL_OVERRIDE_RECIPIENTS",
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS");
    assertThat(checkoutStep)
        .contains(
            "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2")
        .doesNotContain("env:");
    assertThat(keycloakStep)
        .contains("KC_SA_CLIENT_SECRET: ${{ secrets.keycloak_sa_client_secret }}")
        .doesNotContain("DATABASE_PASSWORD", "KEYSTORE_SECRET", "LEXIS_MAIL_OVERRIDE_RECIPIENTS");
    assertThat(backendBeforeDeploy)
        .doesNotContain(
            "DATABASE_HOST",
            "DATABASE_SERVICE_NAME",
            "DATABASE_USER",
            "DATABASE_PASSWORD",
            "KEYSTORE_SECRET",
            "LEXIS_PROD_RTM_ONLY",
            "LEXIS_EXPIRY_ENABLED",
            "LEXIS_PERMIT_INVOICE_MODE",
            "LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS",
            "LEXIS_MAIL_ENABLED",
            "LEXIS_MAIL_NON_PRODUCTION",
            "LEXIS_MAIL_FROM",
            "LEXIS_MAIL_OVERRIDE_RECIPIENTS",
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS");
    assertThat(backendDeployStep)
        .contains("DATABASE_HOST: ${{ secrets.database_host }}")
        .contains("DATABASE_SERVICE_NAME: ${{ secrets.database_service_name }}")
        .contains("DATABASE_USER: ${{ secrets.database_user }}")
        .contains("DATABASE_PASSWORD: ${{ secrets.database_password }}")
        .contains("KEYSTORE_SECRET: ${{ secrets.keystore_secret }}")
        .contains("LEXIS_PROD_RTM_ONLY: ${{ secrets.lexis_prod_rtm_only || 'false' }}")
        .contains("LEXIS_EXPIRY_ENABLED: ${{ inputs.expiry_enabled && 'true' || 'false' }}")
        .contains(
            "LEXIS_PERMIT_INVOICE_MODE:"
                + " ${{ vars.LEXIS_PERMIT_INVOICE_MODE || 'legacy-best-effort' }}")
        .contains(
            "LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS:"
                + " ${{ vars.LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS || '60' }}")
        .contains("LEXIS_MAIL_ENABLED: ${{ vars.LEXIS_MAIL_ENABLED || 'false' }}")
        .contains(
            "LEXIS_MAIL_NON_PRODUCTION:"
                + " ${{ inputs.environment == 'prod' && 'false' || 'true' }}")
        .contains(
            "LEXIS_MAIL_FROM:"
                + " ${{ vars.LEXIS_MAIL_FROM || 'Provincial.Log.Export.Analyst@gov.bc.ca' }}")
        .contains("LEXIS_MAIL_OVERRIDE_RECIPIENTS: ${{ secrets.LEXIS_MAIL_OVERRIDE_RECIPIENTS }}")
        .contains(
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS:"
                + " ${{ secrets.LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS }}");
    assertThat(frontendBeforeDeploy).doesNotContain("LEXIS_PROD_RTM_ONLY");
    assertThat(frontendDeployStep)
        .contains("LEXIS_PROD_RTM_ONLY: ${{ secrets.lexis_prod_rtm_only || 'false' }}");
  }

  @Test
  void reusableDeploymentShouldBeTheOnlyDeploymentManifestSource() throws IOException {
    String workflow = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));

    assertThat(workflow)
        .containsOnlyOnce("file: backend/openshift.deploy.yml")
        .containsOnlyOnce("file: frontend/openshift.deploy.yml")
        .doesNotContain("openshift/deployment.yaml");
    assertThat(resolve("backend/openshift/deployment.yaml")).doesNotExist();
    assertThat(resolve("frontend/openshift/deployment.yaml")).doesNotExist();
  }

  @Test
  void reusedImageTagsShouldRollEveryApplicationWorkload() throws IOException {
    String workflow = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));
    String backendTemplate = Files.readString(resolve("backend/openshift.deploy.yml"));
    String frontendTemplate = Files.readString(resolve("frontend/openshift.deploy.yml"));
    String rolloutParameter =
        "-p ROLLOUT_TRIGGER=\"${{ github.run_id }}-${{ github.run_attempt }}\"";
    String rolloutAnnotation =
        "app.openshift.io/redeploy-token: ${ROLLOUT_TRIGGER}";

    assertThat(occurrences(workflow, rolloutParameter)).isEqualTo(2);
    assertThat(occurrences(backendTemplate, rolloutAnnotation)).isEqualTo(2);
    assertThat(occurrences(frontendTemplate, rolloutAnnotation)).isOne();
  }

  @Test
  void mailRecipientListsShouldOnlyBeExposedThroughTheBackendSecret() throws IOException {
    String template = Files.readString(resolve("backend/openshift.deploy.yml"));

    assertThat(template)
        .contains(
            "- name: LEXIS_MAIL_OVERRIDE_RECIPIENTS\n"
                + "                  valueFrom:\n"
                + "                    secretKeyRef:\n"
                + "                      name: ${NAME}-backend-secret-${ZONE}\n"
                + "                      key: LEXIS_MAIL_OVERRIDE_RECIPIENTS")
        .contains(
            "- name: LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS\n"
                + "                  valueFrom:\n"
                + "                    secretKeyRef:\n"
                + "                      name: ${NAME}-backend-secret-${ZONE}\n"
                + "                      key: LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS")
        .contains(
            "stringData:\n"
                + "      DATABASE_USER: ${DATABASE_USER}\n"
                + "      DATABASE_PASSWORD: ${DATABASE_PASSWORD}\n"
                + "      KEYSTORE_SECRET: ${KEYSTORE_SECRET}\n"
                + "      LEXIS_MAIL_OVERRIDE_RECIPIENTS: ${LEXIS_MAIL_OVERRIDE_RECIPIENTS}\n"
                + "      LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS:"
                + " ${LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS}")
        .doesNotContain(
            "- name: LEXIS_MAIL_OVERRIDE_RECIPIENTS\n"
                + "                  value: ${LEXIS_MAIL_OVERRIDE_RECIPIENTS}",
            "- name: LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS\n"
                + "                  value: ${LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS}");
  }

  @Test
  void frontendShouldCacheOnlyFingerprintAssets() throws IOException {
    String caddyfile = Files.readString(resolve("frontend/Caddyfile"));

    assertThat(caddyfile)
        .contains("@immutable_assets path /assets/*")
        .contains(
            "header @immutable_assets Cache-Control \"public, max-age=31536000, immutable\"")
        .contains("@dynamic_responses {\n\t\tnot path /assets/*\n\t}")
        .contains(
            "header @dynamic_responses Cache-Control"
                + " \"no-store, no-cache, must-revalidate, proxy-revalidate\"");
    assertThat(occurrences(caddyfile, "Cache-Control")).isEqualTo(2);
  }

  private static String workflowJob(String workflow, String jobName, String nextJobName) {
    int start = workflow.indexOf("  " + jobName + ":");
    int end = workflow.indexOf("  " + nextJobName + ":", start);
    assertThat(start).isNotNegative();
    assertThat(end).isGreaterThan(start);
    return workflow.substring(start, end);
  }

  private static String between(String value, String startMarker, String endMarker) {
    int start = value.indexOf(startMarker);
    int end = value.indexOf(endMarker, start);
    assertThat(start).isNotNegative();
    assertThat(end).isGreaterThan(start);
    return value.substring(start, end);
  }

  private static int occurrences(String value, String target) {
    return value.split(java.util.regex.Pattern.quote(target), -1).length - 1;
  }

  private static Path resolve(String relativePath) {
    Path fromRepositoryRoot = Path.of(relativePath);
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..").resolve(relativePath);
  }
}

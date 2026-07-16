package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TestDeploymentTopologyConfigTest {

  @Test
  void testShouldUseAutoscalingProfile() throws IOException {
    String mergeWorkflow = Files.readString(resolve(".github/workflows/merge.yml"));
    String testDeploy = workflowJob(mergeWorkflow, "deploy-test", "tests");

    assertThat(testDeploy)
        .contains("backend_min_replicas: \"2\"")
        .contains("backend_max_replicas: \"6\"")
        .contains("frontend_replicas: \"2\"")
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
  void productionShouldRetainDisabledAutoscalingConfiguration() throws IOException {
    String mergeWorkflow = Files.readString(resolve(".github/workflows/merge.yml"));
    String prodDeploy = workflowJob(mergeWorkflow, "deploy-prod", "monitor-prod");

    assertThat(prodDeploy)
        .contains("if: false")
        .contains("backend_min_replicas: \"3\"")
        .contains("backend_max_replicas: \"10\"")
        .contains("frontend_replicas: \"3\"")
        .doesNotContain("expiry_enabled: true");
  }

  @Test
  void pullRequestPreviewShouldPinOnePodAndDisableBackendLiteMode() throws IOException {
    String prWorkflow = Files.readString(resolve(".github/workflows/pr-open.yml"));
    String reusableWorkflow =
        Files.readString(resolve(".github/workflows/reusable-deploy.yml"));
    String prDeploy = workflowJob(prWorkflow, "deploys", "tests");
    String backendDeploy = workflowJob(reusableWorkflow, "backend", "frontend");

    assertThat(prDeploy)
        .contains("backend_min_replicas: \"1\"")
        .contains("backend_max_replicas: \"1\"")
        .contains("frontend_replicas: \"1\"");
    assertThat(backendDeploy)
        .contains("file: backend/openshift.deploy.yml")
        .contains("lite_mode: false");
  }

  @Test
  void federalSubmissionCreateShouldNotBeFeatureGated() throws IOException {
    String deploymentConfiguration =
        Files.readString(resolve(".github/workflows/reusable-deploy.yml"))
            + Files.readString(resolve(".github/workflows/merge.yml"))
            + Files.readString(resolve(".github/workflows/pr-open.yml"))
            + Files.readString(resolve("backend/openshift.deploy.yml"))
            + Files.readString(resolve("backend/src/main/resources/application.yml"));

    assertThat(deploymentConfiguration)
        .doesNotContain(
            "LEXIS_FEDERAL_SUBMISSION_CREATE_ENABLED",
            "federal_submission_create_enabled",
            "lexis.federal-submission.create-enabled");
  }

  @Test
  void reusableDeploymentShouldPassResourceAndExpiryInputsToTemplates() throws IOException {
    String workflow = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));
    String backendTemplate = Files.readString(resolve("backend/openshift.deploy.yml"));
    String frontendTemplate = Files.readString(resolve("frontend/openshift.deploy.yml"));

    assertThat(workflow)
        .contains("backend_min_replicas:")
        .contains("backend_max_replicas:")
        .doesNotContain("Enforce single-backend lock topology", "inputs.backend_replicas")
        .contains("-p MIN_REPLICAS=\"${{ inputs.backend_min_replicas }}\"")
        .contains("-p MAX_REPLICAS=\"${{ inputs.backend_max_replicas }}\"")
        .contains("LEXIS_EXPIRY_ENABLED: ${{ inputs.expiry_enabled && 'true' || 'false' }}")
        .contains("LEXIS_EXPIRY_CRON: ${{ vars.LEXIS_EXPIRY_CRON || '30 0 0 * * *' }}")
        .contains("LEXIS_EXPIRY_ZONE: ${{ vars.LEXIS_EXPIRY_ZONE || 'America/Vancouver' }}")
        .contains(
            "LEXIS_EXPIRY_LOCK_AT_MOST_FOR:"
                + " ${{ vars.LEXIS_EXPIRY_LOCK_AT_MOST_FOR || 'PT6H' }}")
        .contains(
            "LEXIS_EXPIRY_LOCK_AT_LEAST_FOR:"
                + " ${{ vars.LEXIS_EXPIRY_LOCK_AT_LEAST_FOR || 'PT5M' }}")
        .contains(
            "-p LEXIS_EXPIRY_LOCK_AT_MOST_FOR=\"$LEXIS_EXPIRY_LOCK_AT_MOST_FOR\"")
        .contains(
            "-p LEXIS_EXPIRY_LOCK_AT_LEAST_FOR=\"$LEXIS_EXPIRY_LOCK_AT_LEAST_FOR\"")
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
            "LEXIS_MAIL_OVERRIDE_RECIPIENTS: ${{ secrets.lexis_mail_override_recipients }}")
        .contains("LEXIS_MAIL_ENVIRONMENT: ${{ inputs.environment }}")
        .contains("-p LEXIS_MAIL_ENVIRONMENT=\"$LEXIS_MAIL_ENVIRONMENT\"")
        .contains(
            "LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED:"
                + " ${{ vars.LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED || 'false' }}")
        .contains(
            "-p LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED="
                + "\"$LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED\"")
        .contains(
            "LEXIS_MAIL_REGION_RCO_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_region_rco_recipients }}")
        .contains(
            "LEXIS_MAIL_REGION_RNI_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_region_rni_recipients }}")
        .contains(
            "LEXIS_MAIL_REGION_RSI_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_region_rsi_recipients }}")
        .contains(
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_permit_request_recipients }}")
        .contains("-p LEXIS_MAIL_REGION_RCO_RECIPIENTS=\"$LEXIS_MAIL_REGION_RCO_RECIPIENTS\"")
        .contains("-p LEXIS_MAIL_REGION_RNI_RECIPIENTS=\"$LEXIS_MAIL_REGION_RNI_RECIPIENTS\"")
        .contains("-p LEXIS_MAIL_REGION_RSI_RECIPIENTS=\"$LEXIS_MAIL_REGION_RSI_RECIPIENTS\"")
        .contains("-p MIN_CPU=\"${{ inputs.backend_cpu_request }}\"")
        .contains("-p MAX_MEM=\"${{ inputs.backend_memory_limit }}\"")
        .contains("-p MIN_CPU=\"${{ inputs.frontend_cpu_request }}\"")
        .contains("-p MAX_MEM=\"${{ inputs.frontend_memory_limit }}\"");
    assertThat(backendTemplate)
        .contains("- name: MAX_REPLICAS\n    value: \"3\"")
        .contains("- name: LEXIS_EXPIRY_LOCK_AT_MOST_FOR")
        .contains("- name: LEXIS_EXPIRY_LOCK_AT_LEAST_FOR")
        .contains("value: ${LEXIS_EXPIRY_LOCK_AT_MOST_FOR}")
        .contains("value: ${LEXIS_EXPIRY_LOCK_AT_LEAST_FOR}")
        .contains("type: RollingUpdate\n        rollingUpdate:\n          maxUnavailable: 0\n          maxSurge: 1")
        .contains("averageUtilization: 70")
        .contains("topologySpreadConstraints:")
        .contains("topologyKey: kubernetes.io/hostname")
        .contains("whenUnsatisfiable: ScheduleAnyway")
        .contains(
            "- name: LEXIS_PERMIT_INVOICE_MODE\n"
                + "    description: Permit invoice coordinator; legacy-best-effort preserves the legacy workflow\n"
                + "    value: legacy-best-effort")
        .contains("- name: LEXIS_PERMIT_INVOICE_MODE\n                  value: ${LEXIS_PERMIT_INVOICE_MODE}")
        .contains("- name: LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS\n    description: Requested timeout for each isolated GBMS transaction\n    value: \"60\"")
        .contains("- name: LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS\n                  value: ${LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS}")
        .contains(
            "- name: LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED\n"
                + "    description: Capture authenticated Business BCeID email after the Oracle contact package is deployed\n"
                + "    value: \"false\"")
        .contains(
            "- name: LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED\n"
                + "                  value: ${LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED}")
        .contains(
            "- name: LEXIS_MAIL_ENVIRONMENT\n"
                + "    description: Non-secret deployment environment label used on intercepted messages\n"
                + "    value: non-prod")
        .contains(
            "- name: LEXIS_MAIL_ENVIRONMENT\n"
                + "                  value: ${LEXIS_MAIL_ENVIRONMENT}")
        .contains(
            "- name: LEXIS_MAIL_REGION_RCO_RECIPIENTS\n"
                + "    description: Externally managed RCO distribution list recipients\n"
                + "    value: \"\"")
        .contains(
            "- name: LEXIS_MAIL_REGION_RNI_RECIPIENTS\n"
                + "    description: Externally managed RNI distribution list recipients\n"
                + "    value: \"\"")
        .contains(
            "- name: LEXIS_MAIL_REGION_RSI_RECIPIENTS\n"
                + "    description: Externally managed RSI distribution list recipients\n"
                + "    value: \"\"")
        .contains("cpu: ${MIN_CPU}")
        .contains("memory: ${MIN_MEM}")
        .contains("cpu: ${MAX_CPU}")
        .contains("memory: ${MAX_MEM}")
        .contains("ephemeral-storage: \"512Mi\"")
        .contains("ephemeral-storage: \"4Gi\"")
        .doesNotContain("SPRING_DATA_REDIS", "REDIS_PASSWORD");
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
    String backendJobHeader = backendJob.substring(0, backendJob.indexOf("    steps:"));
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
    String logoutStep =
        between(
            frontendJob,
            "      - name: Resolve frontend logout URL",
            "      - uses: bcgov/action-deployer-openshift@");

    assertThat(backendJobHeader)
        .doesNotContain(
            "keycloak_sa_client_id",
            "keycloak_sa_client_secret",
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
            "LEXIS_MAIL_REGION_RCO_RECIPIENTS",
            "LEXIS_MAIL_REGION_RNI_RECIPIENTS",
            "LEXIS_MAIL_REGION_RSI_RECIPIENTS",
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS");
    assertThat(checkoutStep)
        .contains(
            "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2")
        .doesNotContain("env:");
    assertThat(keycloakStep)
        .contains("if: ${{ inputs.environment != 'dev' }}")
        .doesNotContain("env.KC_SA_CLIENT_ID != ''")
        .contains("KC_SA_CLIENT_ID: ${{ secrets.keycloak_sa_client_id }}")
        .contains("KC_SA_CLIENT_SECRET: ${{ secrets.keycloak_sa_client_secret }}")
        .contains("NEXCOL_KEYCLOAK_CLIENT_ID: ${{ vars.NEXCOL_KEYCLOAK_CLIENT_ID }}")
        .doesNotContain(
            "DATABASE_PASSWORD",
            "KEYSTORE_SECRET",
            "LEXIS_MAIL_OVERRIDE_RECIPIENTS",
            "LEXIS_MAIL_REGION_RCO_RECIPIENTS",
            "LEXIS_MAIL_REGION_RNI_RECIPIENTS",
            "LEXIS_MAIL_REGION_RSI_RECIPIENTS",
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS");
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
            "LEXIS_MAIL_REGION_RCO_RECIPIENTS",
            "LEXIS_MAIL_REGION_RNI_RECIPIENTS",
            "LEXIS_MAIL_REGION_RSI_RECIPIENTS",
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
        .contains("LEXIS_MAIL_ENVIRONMENT: ${{ inputs.environment }}")
        .contains(
            "LEXIS_MAIL_FROM:"
                + " ${{ vars.LEXIS_MAIL_FROM || 'Provincial.Log.Export.Analyst@gov.bc.ca' }}")
        .contains(
            "LEXIS_MAIL_OVERRIDE_RECIPIENTS: ${{ secrets.lexis_mail_override_recipients }}")
        .contains(
            "LEXIS_MAIL_REGION_RCO_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_region_rco_recipients }}")
        .contains(
            "LEXIS_MAIL_REGION_RNI_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_region_rni_recipients }}")
        .contains(
            "LEXIS_MAIL_REGION_RSI_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_region_rsi_recipients }}")
        .contains(
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS:"
                + " ${{ secrets.lexis_mail_permit_request_recipients }}");
    assertThat(frontendBeforeDeploy).doesNotContain("LEXIS_PROD_RTM_ONLY");
    assertThat(frontendJob)
        .doesNotContain(
            "LEXIS_MAIL_OVERRIDE_RECIPIENTS",
            "LEXIS_MAIL_REGION_RCO_RECIPIENTS",
            "LEXIS_MAIL_REGION_RNI_RECIPIENTS",
            "LEXIS_MAIL_REGION_RSI_RECIPIENTS",
            "LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS");
    assertThat(logoutStep)
        .contains("CONFIGURED_SIGN_OUT: ${{ vars.VITE_REDIRECT_SIGN_OUT }}")
        .contains("LEXIS_SLOT: ${{ inputs.slot || inputs.target }}")
        .contains("^([0-9]|[1-4][0-9])$")
        .contains(
            "https%3A%2F%2F${REPOSITORY_NAME}-${LEXIS_SLOT}.apps.gold.devops.gov.bc.ca%2F")
        .contains("VITE_REDIRECT_SIGN_OUT is required outside DEV")
        .contains("printf 'VITE_REDIRECT_SIGN_OUT=%s\\n'");
    assertThat(frontendDeployStep)
        .contains("LEXIS_PROD_RTM_ONLY: ${{ secrets.lexis_prod_rtm_only || 'false' }}")
        .contains("-p VITE_REDIRECT_SIGN_OUT=\"$VITE_REDIRECT_SIGN_OUT\"")
        .doesNotContain("-p VITE_REDIRECT_SIGN_OUT=\"${{ vars.VITE_REDIRECT_SIGN_OUT }}\"");
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
            "- name: LEXIS_MAIL_REGION_RCO_RECIPIENTS\n"
                + "                  valueFrom:\n"
                + "                    secretKeyRef:\n"
                + "                      name: ${NAME}-backend-secret-${ZONE}\n"
                + "                      key: LEXIS_MAIL_REGION_RCO_RECIPIENTS")
        .contains(
            "- name: LEXIS_MAIL_REGION_RNI_RECIPIENTS\n"
                + "                  valueFrom:\n"
                + "                    secretKeyRef:\n"
                + "                      name: ${NAME}-backend-secret-${ZONE}\n"
                + "                      key: LEXIS_MAIL_REGION_RNI_RECIPIENTS")
        .contains(
            "- name: LEXIS_MAIL_REGION_RSI_RECIPIENTS\n"
                + "                  valueFrom:\n"
                + "                    secretKeyRef:\n"
                + "                      name: ${NAME}-backend-secret-${ZONE}\n"
                + "                      key: LEXIS_MAIL_REGION_RSI_RECIPIENTS")
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
                + "      LEXIS_MAIL_REGION_RCO_RECIPIENTS:"
                + " ${LEXIS_MAIL_REGION_RCO_RECIPIENTS}\n"
                + "      LEXIS_MAIL_REGION_RNI_RECIPIENTS:"
                + " ${LEXIS_MAIL_REGION_RNI_RECIPIENTS}\n"
                + "      LEXIS_MAIL_REGION_RSI_RECIPIENTS:"
                + " ${LEXIS_MAIL_REGION_RSI_RECIPIENTS}\n"
                + "      LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS:"
                + " ${LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS}")
        .doesNotContain(
            "- name: LEXIS_MAIL_OVERRIDE_RECIPIENTS\n"
                + "                  value: ${LEXIS_MAIL_OVERRIDE_RECIPIENTS}",
            "- name: LEXIS_MAIL_REGION_RCO_RECIPIENTS\n"
                + "                  value: ${LEXIS_MAIL_REGION_RCO_RECIPIENTS}",
            "- name: LEXIS_MAIL_REGION_RNI_RECIPIENTS\n"
                + "                  value: ${LEXIS_MAIL_REGION_RNI_RECIPIENTS}",
            "- name: LEXIS_MAIL_REGION_RSI_RECIPIENTS\n"
                + "                  value: ${LEXIS_MAIL_REGION_RSI_RECIPIENTS}",
            "- name: LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS\n"
                + "                  value: ${LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS}");
  }

  @Test
  void deploymentShouldNotRequireRedis() throws IOException {
    String template = Files.readString(resolve("backend/openshift.deploy.yml"));
    String workflow = Files.readString(resolve(".github/workflows/reusable-deploy.yml"));
    String prWorkflow = Files.readString(resolve(".github/workflows/pr-open.yml"));
    String prCloseWorkflow = Files.readString(resolve(".github/workflows/pr-close.yml"));
    String mergeWorkflow = Files.readString(resolve(".github/workflows/merge.yml"));

    assertThat(template).doesNotContain("REDIS_", "SPRING_DATA_REDIS", "-redis-${ZONE}");
    assertThat(workflow).doesNotContain("redis_password", "REDIS_", "SPRING_DATA_REDIS");
    assertThat(prWorkflow).doesNotContain("redis_password");
    assertThat(prCloseWorkflow)
        .contains("for component in backend frontend clamav redis")
        .contains("(backend|frontend|clamav|redis)");
    assertThat(mergeWorkflow).doesNotContain("redis_password");
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

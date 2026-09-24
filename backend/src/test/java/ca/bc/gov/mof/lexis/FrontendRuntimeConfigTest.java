package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class FrontendRuntimeConfigTest {

  private static final Map<String, String> VALID_AUTH_CONFIG =
      Map.of(
          "VITE_OIDC_ISSUER_URI", "https://sensitive.example.gov.bc.ca/auth/realms/standard",
          "VITE_OIDC_CLIENT_ID", "sensitive-client-id");

  @Test
  void entrypointShouldRejectBlankAuthenticationSettingsWithoutEchoingValues() throws Exception {
    Path entrypoint = resolve(Path.of("frontend", "docker-entrypoint.sh"));

    for (String missingVariable : VALID_AUTH_CONFIG.keySet()) {
      ProcessBuilder processBuilder = new ProcessBuilder("sh", entrypoint.toString());
      processBuilder.redirectErrorStream(true);
      processBuilder.environment().putAll(VALID_AUTH_CONFIG);
      processBuilder.environment().put(missingVariable, "  \t ");

      Process process = processBuilder.start();
      assertThat(process.waitFor(5, TimeUnit.SECONDS)).isTrue();
      String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);

      assertThat(process.exitValue()).isNotZero();
      assertThat(output)
          .contains(missingVariable + " is required for deployed LEXIS authentication.")
          .doesNotContain(
              VALID_AUTH_CONFIG.get("VITE_OIDC_ISSUER_URI"),
              VALID_AUTH_CONFIG.get("VITE_OIDC_CLIENT_ID"));
    }
  }

  @Test
  void deploymentShouldRequireBothInteractiveOidcSettings() throws IOException {
    String deployment = Files.readString(resolve(Path.of("frontend", "openshift.deploy.yml")));

    assertThat(deployment)
        .contains("  - name: VITE_OIDC_ISSUER_URI\n"
            + "    description: BC Gov SSO issuer for interactive users\n"
            + "    required: true")
        .contains("  - name: VITE_OIDC_CLIENT_ID\n"
            + "    description: LEXIS public browser client in the same SSO environment\n"
            + "    required: true")
        .doesNotContain("VITE_USER_POOLS", "VITE_COGNITO", "VITE_LOGOUT", "VITE_ZONE");
  }

  @Test
  void localCaddyProfileShouldReceiveTheDocumentedRuntimeAuthenticationConfig()
      throws IOException {
    String compose = Files.readString(resolve(Path.of("docker-compose.yml")));

    assertThat(compose)
        .contains("  caddy:\n")
        .contains("    env_file:\n      - ./frontend/.env\n");
  }

  @Test
  void deployedSmokeShouldRequireUsableLoginButtons() throws IOException {
    String smoke =
        Files.readString(resolve(Path.of("frontend", "e2e", "smoke.spec.ts")));

    assertThat(smoke)
        .contains("const idirLogin = page.getByRole('button', { name: /log in with idir/i })")
        .contains(
            "const businessBceidLogin = page.getByRole('button', { name: /log in with business bceid/i })")
        .contains("await expect(idirLogin).toBeEnabled()")
        .contains("await expect(businessBceidLogin).toBeEnabled()");
  }

  private static Path resolve(Path path) {
    if (Files.exists(path)) {
      return path;
    }
    return Path.of("..").resolve(path);
  }
}

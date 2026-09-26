package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * bcgov/action-deployer-openshift publishes the processed template to later workflow steps. oc
 * escapes some characters in that JSON, which the runner's secret masking does not recognise, so
 * each deploy job masks the escaped form of its template secrets before the deployer runs.
 */
class DeployTemplateSecretMaskingTest {

  private static final String DEPLOYER = "bcgov/action-deployer-openshift@";
  private static final String MASK_STEP = "Mask template secrets";
  private static final Pattern SECRET_REFERENCE = Pattern.compile("secrets\\.([A-Za-z0-9_]+)");
  private static final String BACKSLASH = "\\";

  @Test
  @SuppressWarnings("unchecked")
  void everySecretPassedToTheDeployerShouldBeMaskedBeforeItRuns() throws IOException {
    Map<String, Object> workflow =
        new Yaml().load(Files.readString(resolve(".github/workflows/reusable-deploy.yml")));
    Map<String, Map<String, Object>> jobs = (Map<String, Map<String, Object>>) workflow.get("jobs");
    List<String> checkedJobs = new ArrayList<>();

    for (Map.Entry<String, Map<String, Object>> job : jobs.entrySet()) {
      List<Map<String, Object>> steps =
          (List<Map<String, Object>>) job.getValue().getOrDefault("steps", List.of());
      int firstDeployer = -1;
      int maskStep = -1;
      Set<String> deployerSecrets = new TreeSet<>();
      for (int index = 0; index < steps.size(); index++) {
        Map<String, Object> step = steps.get(index);
        if (MASK_STEP.equals(step.get("name")) && maskStep < 0) {
          maskStep = index;
        }
        if (String.valueOf(step.get("uses")).startsWith(DEPLOYER)) {
          firstDeployer = firstDeployer < 0 ? index : firstDeployer;
          // Template values reach oc through the step environment and the parameters input.
          deployerSecrets.addAll(secretsIn(step.get("env")));
          Map<String, Object> with = (Map<String, Object>) step.getOrDefault("with", Map.of());
          deployerSecrets.addAll(secretsIn(with.get("parameters")));
        }
      }
      if (firstDeployer < 0) {
        continue;
      }
      checkedJobs.add(job.getKey());

      assertThat(maskStep).as(job.getKey() + " mask step").isBetween(0, firstDeployer - 1);
      Map<String, Object> maskEnvironment =
          (Map<String, Object>) steps.get(maskStep).getOrDefault("env", Map.of());
      assertThat(maskEnvironment.keySet()).allMatch(name -> name.startsWith("MASK_"));
      assertThat(secretsIn(maskEnvironment))
          .as(job.getKey() + " secrets masked before the deployer")
          .containsAll(deployerSecrets);
      assertThat(steps.get(maskStep).get("run"))
          .isEqualTo("bash ./.github/scripts/mask-template-secrets.sh");
    }

    assertThat(checkedJobs).containsExactly("backend", "frontend");
  }

  @Test
  void maskScriptShouldRegisterTheEscapedFormOfSecretsTheRunnerMisses()
      throws IOException, InterruptedException {
    Path script = resolve(".github/scripts/mask-template-secrets.sh").toAbsolutePath();
    ProcessBuilder processBuilder =
        new ProcessBuilder("bash", script.toString()).redirectErrorStream(true);
    Map<String, String> environment = processBuilder.environment();
    environment.keySet().removeIf(name -> name.startsWith("MASK_"));
    environment.put("MASK_MARKUP", "a<b>&c\"d\\e");
    environment.put("MASK_PEM", "-----BEGIN KEY-----\nabc+/=\n-----END KEY-----\n");
    environment.put("MASK_PERCENT", "x&%0Ay");
    environment.put("MASK_PLAIN", "plain-value");
    environment.put("MASK_EMPTY", "");
    environment.put("UNMASKED_MARKUP", "<not-a-template-secret>");

    Process process = processBuilder.start();
    boolean completed = process.waitFor(30, TimeUnit.SECONDS);
    String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);

    assertThat(completed).as(output).isTrue();
    assertThat(process.exitValue()).as(output).isZero();
    // Expected values follow oc's Go JSON escaping; values without escapes are already masked.
    assertThat(output.lines().toList())
        .containsExactlyInAnyOrder(
            "::add-mask::a" + unicode("3c") + "b" + unicode("3e") + unicode("26") + "c"
                + BACKSLASH + "\"d" + BACKSLASH + BACKSLASH + "e",
            "::add-mask::-----BEGIN KEY-----" + BACKSLASH + "nabc+/=" + BACKSLASH
                + "n-----END KEY-----" + BACKSLASH + "n",
            "::add-mask::x" + unicode("26") + "%250Ay");
  }

  private static Set<String> secretsIn(Object value) {
    Set<String> secrets = new TreeSet<>();
    if (value instanceof Map<?, ?> map) {
      map.values().forEach(entry -> secrets.addAll(secretsIn(entry)));
    } else if (value != null) {
      Matcher matcher = SECRET_REFERENCE.matcher(String.valueOf(value));
      while (matcher.find()) {
        secrets.add(matcher.group(1));
      }
    }
    return secrets;
  }

  /** Builds a JSON unicode escape without writing one into this source file. */
  private static String unicode(String lowByteHex) {
    return BACKSLASH + "u00" + lowByteHex;
  }

  private static Path resolve(String relativePath) {
    Path fromRepositoryRoot = Path.of(relativePath);
    if (Files.exists(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..").resolve(relativePath);
  }
}

package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class PublicRepositoryHygieneTest {

  private static final String PUBLIC_REPOSITORY_WARNING =
      "This is a public repository. Do not include JWTs, credentials, secrets, private information or LEXIS business data, or unredacted logs or screenshots. Use an approved private channel for sensitive material.";

  @Test
  void pullRequestAttestationsShouldRequireExplicitConfirmation() throws IOException {
    String template = read(".github/pull_request_template.md");
    List<String> checklistItems =
        template.lines().filter(PublicRepositoryHygieneTest::isChecklistItem).toList();

    assertThat(checklistItems)
        .isNotEmpty()
        .allMatch(line -> line.startsWith("- [ ] "));
  }

  @Test
  void diagnosticTemplatesShouldWarnAgainstPublicSensitiveDataDisclosure() throws IOException {
    assertThat(
            List.of(
                read(".github/ISSUE_TEMPLATE/bug.md"),
                read(".github/ISSUE_TEMPLATE/question.md"),
                read(".github/ISSUE_TEMPLATE/ux.md"),
                read(".github/pull_request_template.md")))
        .allMatch(template -> template.contains(PUBLIC_REPOSITORY_WARNING));
  }

  private static boolean isChecklistItem(String line) {
    return line.startsWith("- [") && line.length() > 5 && line.charAt(4) == ']';
  }

  private static String read(String relativePath) throws IOException {
    Path path = Path.of(relativePath);
    if (Files.exists(path)) {
      return Files.readString(path);
    }
    return Files.readString(Path.of("..").resolve(relativePath));
  }
}

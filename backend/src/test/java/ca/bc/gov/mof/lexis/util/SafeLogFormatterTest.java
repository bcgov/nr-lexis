package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SafeLogFormatterTest {

  @Test
  void controlSafeShouldRemoveLogControlsAndBoundLength() {
    String safe = SafeLogFormatter.controlSafe("  accepted\r\nforged=true\u2028" + "x".repeat(100));

    assertThat(safe)
        .startsWith("accepted__forged=true_x")
        .hasSize(80)
        .doesNotContain("\r", "\n", "\u2028");
  }

  @Test
  void fingerprintShouldBeStableTruncatedSha256WithoutRawValue() {
    String key = "private-idempotency-key\r\nforged=true";

    assertThat(SafeLogFormatter.fingerprint(key))
        .isEqualTo("sha256:f00e83cd31dc9f9a286ac9d1")
        .doesNotContain(key)
        .hasSize(31);
    assertThat(SafeLogFormatter.fingerprint(key + "-different"))
        .isNotEqualTo(SafeLogFormatter.fingerprint(key));
  }

  @Test
  void truncatedSha256ShouldAcceptOnlyCompleteSha256Hex() {
    String sha256 = "ABCDEF0123456789".repeat(4);

    assertThat(SafeLogFormatter.truncatedSha256(sha256))
        .isEqualTo("sha256:abcdef0123456789abcdef01");
    assertThat(SafeLogFormatter.truncatedSha256("not-a-sha256")).isEqualTo("-");
    assertThat(SafeLogFormatter.truncatedSha256(null)).isEqualTo("-");
  }
}

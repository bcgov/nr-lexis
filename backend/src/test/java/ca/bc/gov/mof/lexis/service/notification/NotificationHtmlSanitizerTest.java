package ca.bc.gov.mof.lexis.service.notification;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class NotificationHtmlSanitizerTest {

  private final NotificationHtmlSanitizer sanitizer = new NotificationHtmlSanitizer();

  @Test
  void sanitizeShouldRetainSupportedFormattingAndRemoveUnsafeMarkup() {
    String sanitized =
        sanitizer.sanitize(
            "<p><strong>Important</strong> <a href=\"https://www2.gov.bc.ca\""
                + " onclick=\"alert(1)\">details</a></p>"
                + "<script>alert(1)</script><img src=\"https://example.test/image.png\">");

    assertThat(sanitized)
        .contains("<strong>Important</strong>")
        .contains("href=\"https://www2.gov.bc.ca\"")
        .doesNotContain("script")
        .doesNotContain("onclick")
        .doesNotContain("img");
  }

  @Test
  void sanitizeShouldStripUnsafeLinkProtocols() {
    String sanitized = sanitizer.sanitize("<p><a href=\"javascript:alert(1)\">Unsafe</a></p>");

    assertThat(sanitized).contains("Unsafe").doesNotContain("javascript:").doesNotContain("href=");
  }

  @Test
  void sanitizePlainTextShouldRemoveMarkupBeforeStorage() {
    String sanitized =
        sanitizer.sanitizePlainText("<strong>Service</strong><script>alert(1)</script> update");

    assertThat(sanitized).isEqualTo("Service update");
  }
}

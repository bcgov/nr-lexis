package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TextUtilsTest {

  @Test
  void trimToNullShouldReturnNullForNullOrBlankInput() {
    assertThat(TextUtils.trimToNull(null)).isNull();
    assertThat(TextUtils.trimToNull("")).isNull();
    assertThat(TextUtils.trimToNull("   ")).isNull();
  }

  @Test
  void trimToNullShouldReturnTrimmedText() {
    assertThat(TextUtils.trimToNull("  value  ")).isEqualTo("value");
  }

  @Test
  void firstNonBlankShouldReturnTrimmedPrimaryText() {
    assertThat(TextUtils.firstNonBlank("  value  ", "fallback")).isEqualTo("value");
  }

  @Test
  void firstNonBlankShouldReturnFallbackWhenPrimaryIsBlank() {
    assertThat(TextUtils.firstNonBlank("  ", "fallback")).isEqualTo("fallback");
  }

  @Test
  void defaultSystemUserShouldReturnTrimmedUserId() {
    assertThat(TextUtils.defaultSystemUser("  user-id  ")).isEqualTo("user-id");
  }

  @Test
  void defaultSystemUserShouldReturnSystemWhenUserIdIsBlank() {
    assertThat(TextUtils.defaultSystemUser("  ")).isEqualTo("system");
  }
}

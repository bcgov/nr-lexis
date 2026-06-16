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
}

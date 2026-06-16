package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ValueUtilsTest {

  @Test
  void firstNonNullShouldReturnPrimaryValueWhenPresent() {
    assertThat(ValueUtils.firstNonNull("value", "fallback")).isEqualTo("value");
  }

  @Test
  void firstNonNullShouldReturnFallbackWhenPrimaryValueIsNull() {
    assertThat(ValueUtils.firstNonNull(null, "fallback")).isEqualTo("fallback");
  }

  @Test
  void firstNonNullShouldAllowNullFallback() {
    assertThat(ValueUtils.<String>firstNonNull(null, null)).isNull();
  }
}

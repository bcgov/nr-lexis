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

  @Test
  void coalesceDoubleShouldReturnValueWhenPresent() {
    assertThat(ValueUtils.coalesce(12.5d, 0.0d)).isEqualTo(12.5d);
  }

  @Test
  void coalesceDoubleShouldReturnFallbackWhenValueIsNull() {
    assertThat(ValueUtils.coalesce((Double) null, 1.5d)).isEqualTo(1.5d);
  }

  @Test
  void coalesceLongShouldReturnValueWhenPresent() {
    assertThat(ValueUtils.coalesce(12L, 0L)).isEqualTo(12L);
  }

  @Test
  void coalesceLongShouldReturnFallbackWhenValueIsNull() {
    assertThat(ValueUtils.coalesce((Long) null, 7L)).isEqualTo(7L);
  }
}

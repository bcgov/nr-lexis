package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class CollectionUtilsTest {

  @Test
  void safeListShouldReturnEmptyListForNullInput() {
    assertThat(CollectionUtils.safeList(null)).isEmpty();
  }

  @Test
  void safeListShouldReturnInputListWhenProvided() {
    List<String> input = List.of("one", "two");

    assertThat(CollectionUtils.safeList(input)).isSameAs(input);
  }

  @Test
  void positiveDistinctLongsShouldReturnEmptyListForNullInput() {
    assertThat(CollectionUtils.positiveDistinctLongs(null)).isEmpty();
  }

  @Test
  void positiveDistinctLongsShouldDropInvalidAndDuplicateValues() {
    assertThat(CollectionUtils.positiveDistinctLongs(Arrays.asList(3L, null, 0L, -1L, 3L, 7L)))
        .containsExactly(3L, 7L);
  }
}

package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

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
}

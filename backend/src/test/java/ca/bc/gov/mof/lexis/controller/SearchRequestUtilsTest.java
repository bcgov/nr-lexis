package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class SearchRequestUtilsTest {

  @Test
  void parseSearchDateShouldReturnNullForBlankInput() {
    assertThat(SearchRequestUtils.parseSearchDate(null)).isNull();
    assertThat(SearchRequestUtils.parseSearchDate("  ")).isNull();
  }

  @Test
  void parseSearchDateShouldParseIsoAndLegacyDates() {
    assertThat(SearchRequestUtils.parseSearchDate("2026-06-15"))
        .isEqualTo(LocalDate.of(2026, 6, 15));
    assertThat(SearchRequestUtils.parseSearchDate(" 06/15/2026 "))
        .isEqualTo(LocalDate.of(2026, 6, 15));
  }

  @Test
  void parseSearchDateShouldRejectUnsupportedFormats() {
    assertThatThrownBy(() -> SearchRequestUtils.parseSearchDate("15/06/2026"))
        .isInstanceOf(ResponseStatusException.class)
        .extracting("statusCode", "reason")
        .containsExactly(
            HttpStatus.BAD_REQUEST,
            "Invalid date value '15/06/2026'. Use yyyy-MM-dd or MM/dd/yyyy.");
  }
}

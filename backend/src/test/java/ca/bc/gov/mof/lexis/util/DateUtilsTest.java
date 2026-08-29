package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class DateUtilsTest {

  @Test
  void parseIsoOrLegacyDateShouldReturnNullForBlankInput() {
    assertThat(DateUtils.parseIsoOrLegacyDate(null)).isNull();
    assertThat(DateUtils.parseIsoOrLegacyDate("  ")).isNull();
  }

  @Test
  void parseIsoOrLegacyDateShouldParseIsoAndLegacyDates() {
    assertThat(DateUtils.parseIsoOrLegacyDate("2026-06-15"))
        .isEqualTo(LocalDate.of(2026, 6, 15));
    assertThat(DateUtils.parseIsoOrLegacyDate(" 06/15/2026 "))
        .isEqualTo(LocalDate.of(2026, 6, 15));
  }

  @Test
  void parseIsoOrLegacyDateShouldRejectImpossibleLegacyDates() {
    assertThat(DateUtils.parseIsoOrLegacyDate("02/30/2024")).isNull();
    assertThat(DateUtils.parseIsoOrLegacyDate("02/29/2023")).isNull();
    assertThat(DateUtils.parseIsoOrLegacyDate("02/29/2024"))
        .isEqualTo(LocalDate.of(2024, 2, 29));
  }

  @Test
  void parseIsoOrLegacyDateShouldReturnNullForUnsupportedFormats() {
    assertThat(DateUtils.parseIsoOrLegacyDate("15/06/2026")).isNull();
  }
}

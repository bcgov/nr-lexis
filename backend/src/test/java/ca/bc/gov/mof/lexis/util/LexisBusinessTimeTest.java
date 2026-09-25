package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class LexisBusinessTimeTest {

  @Test
  void businessZoneShouldRemainVancouverAcrossUtcDateBoundary() {
    Instant utcMorning = Instant.parse("2026-01-01T07:30:00Z");

    assertThat(LocalDate.ofInstant(utcMorning, LexisBusinessTime.ZONE))
        .isEqualTo(LocalDate.of(2025, 12, 31));
  }

  @ParameterizedTest
  @CsvSource({
    "2026-01-15T12:00:00Z, -08:00",
    "2026-11-01T08:59:59Z, -07:00",
    "2026-11-01T09:00:00Z, -07:00",
    "2027-01-15T12:00:00Z, -07:00"
  })
  void businessZoneShouldPreserveHistoryAndStopFallingBack(String timestamp, String offset) {
    assertThat(LexisBusinessTime.ZONE.getRules().getOffset(Instant.parse(timestamp)))
        .isEqualTo(ZoneOffset.of(offset));
  }

  @ParameterizedTest
  @CsvSource({
    "2026-12-01T06:59:59Z, 2026-11-30",
    "2026-12-01T07:00:00Z, 2026-12-01",
    "2027-01-01T07:00:00Z, 2027-01-01"
  })
  void winterBusinessDateShouldAdvanceAtSevenUtc(String timestamp, String expectedDate) {
    assertThat(LocalDate.ofInstant(Instant.parse(timestamp), LexisBusinessTime.ZONE))
        .isEqualTo(LocalDate.parse(expectedDate));
  }
}

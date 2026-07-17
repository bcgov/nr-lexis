package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class LexisBusinessTimeTest {

  @Test
  void businessZoneShouldRemainVancouverAcrossUtcDateBoundary() {
    Instant utcMorning = Instant.parse("2026-01-01T07:30:00Z");

    assertThat(LocalDate.ofInstant(utcMorning, LexisBusinessTime.ZONE))
        .isEqualTo(LocalDate.of(2025, 12, 31));
  }
}

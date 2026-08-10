package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class RtmEmsLogAmvDateUtilsTest {

  @Test
  void shouldAcceptSupportedMonthFormats() {
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("202607"))
        .isEqualTo(LocalDate.of(2026, 7, 1));
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("2026-07"))
        .isEqualTo(LocalDate.of(2026, 7, 1));
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("2026-07-01"))
        .isEqualTo(LocalDate.of(2026, 7, 1));
  }

  @Test
  void shouldNormalizeDayLevelDatesAndRejectUnsupportedFormats() {
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("2026-07-10"))
        .isEqualTo(LocalDate.of(2026, 7, 1));
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("07/01/2026")).isNull();
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("not-a-date")).isNull();
  }

  @Test
  void shouldAcceptOnlyExplicitMonthStartDatesForScreenUploads() {
    assertThat(RtmEmsLogAmvDateUtils.parseMonthStartDate("2026-07-01"))
        .isEqualTo(LocalDate.of(2026, 7, 1));
    assertThat(RtmEmsLogAmvDateUtils.parseMonthStartDate("2026-07-10")).isNull();
    assertThat(RtmEmsLogAmvDateUtils.parseMonthStartDate("2026-07")).isNull();
  }

  @Test
  void shouldRecognizeOnlyTheImmediatelyUpcomingBusinessMonth() {
    Clock clock =
        Clock.fixed(Instant.parse("2026-06-15T19:00:00Z"), LexisBusinessTime.ZONE);

    assertThat(RtmEmsLogAmvDateUtils.isNextMonth(LocalDate.of(2026, 7, 1), clock)).isTrue();
    assertThat(RtmEmsLogAmvDateUtils.isNextMonth(LocalDate.of(2026, 6, 1), clock)).isFalse();
    assertThat(RtmEmsLogAmvDateUtils.isNextMonth(LocalDate.of(2026, 8, 1), clock)).isFalse();
  }
}

package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;

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
  void shouldRejectDayLevelAndLegacyDateFormats() {
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("2026-07-10")).isNull();
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("07/01/2026")).isNull();
    assertThat(RtmEmsLogAmvDateUtils.parseRetrievalDate("not-a-date")).isNull();
  }
}

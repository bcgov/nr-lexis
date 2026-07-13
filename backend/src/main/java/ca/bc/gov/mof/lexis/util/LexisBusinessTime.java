package ca.bc.gov.mof.lexis.util;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/** Canonical business-calendar time for LEXIS date-only rules. */
public final class LexisBusinessTime {

  public static final ZoneId ZONE = ZoneId.of("America/Vancouver");

  private LexisBusinessTime() {}

  public static Clock systemClock() {
    return Clock.system(ZONE);
  }

  public static LocalDate today() {
    return LocalDate.now(systemClock());
  }
}

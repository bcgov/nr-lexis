package ca.bc.gov.mof.lexis.service.rtm;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public final class RtmEmsLogAmvDateUtils {

  private static final DateTimeFormatter MONTH_WITHOUT_DAY_FORMATTER =
      DateTimeFormatter.ofPattern("uuuuMM");
  private static final DateTimeFormatter MONTH_WITHOUT_DAY_DASHED_FORMATTER =
      DateTimeFormatter.ofPattern("uuuu-MM");

  private RtmEmsLogAmvDateUtils() {}

  public static LocalDate parseRetrievalDate(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }

    try {
      return YearMonth.parse(normalized, MONTH_WITHOUT_DAY_FORMATTER).atDay(1);
    } catch (DateTimeParseException ignored) {
      // Fall through to dashed format.
    }

    try {
      return YearMonth.parse(normalized, MONTH_WITHOUT_DAY_DASHED_FORMATTER).atDay(1);
    } catch (DateTimeParseException ignored) {
      // Fall through to the explicit month-start ISO date.
    }

    try {
      return LocalDate.parse(normalized, DateTimeFormatter.ISO_LOCAL_DATE).withDayOfMonth(1);
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  public static LocalDate parseMonthStartDate(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }

    try {
      LocalDate parsed = LocalDate.parse(normalized, DateTimeFormatter.ISO_LOCAL_DATE);
      return isFirstOfMonth(parsed) ? parsed : null;
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  public static boolean isNextMonth(LocalDate value, Clock clock) {
    return value != null && YearMonth.from(value).equals(YearMonth.now(clock).plusMonths(1));
  }

  public static boolean isFirstOfMonth(LocalDate value) {
    return value != null && value.getDayOfMonth() == 1;
  }
}

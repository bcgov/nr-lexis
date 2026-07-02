package ca.bc.gov.mof.lexis.service.rtm;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public final class RtmEmsLogAmvDateUtils {

  private static final DateTimeFormatter MONTH_WITHOUT_DAY_FORMATTER =
      DateTimeFormatter.ofPattern("yyyyMM");
  private static final DateTimeFormatter MONTH_WITHOUT_DAY_DASHED_FORMATTER =
      DateTimeFormatter.ofPattern("yyyy-MM");

  private RtmEmsLogAmvDateUtils() {}

  public static LocalDate parseRetrievalDate(String value) {
    LocalDate parsed = parseIsoOrLegacyDate(value);
    if (parsed != null) {
      return parsed;
    }

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
      return null;
    }
  }
}

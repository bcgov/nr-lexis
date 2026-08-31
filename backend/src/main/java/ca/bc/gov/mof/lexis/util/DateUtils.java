package ca.bc.gov.mof.lexis.util;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;

public final class DateUtils {

  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/uuuu").withResolverStyle(ResolverStyle.STRICT);

  private DateUtils() {}

  // INTENTIONAL_LEGACY_DIVERGENCE(STRICT_DATE_INPUT_VALIDATION): java.time parsing deliberately
  // rejects impossible calendar dates rather than applying legacy SimpleDateFormat normalization.
  public static LocalDate parseIsoOrLegacyDate(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }

    try {
      return LocalDate.parse(normalized);
    } catch (DateTimeParseException ignored) {
      // Fall through to legacy parser.
    }

    try {
      return LocalDate.parse(normalized, LEGACY_DATE_FORMATTER);
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }
}

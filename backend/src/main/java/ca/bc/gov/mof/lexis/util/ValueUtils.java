package ca.bc.gov.mof.lexis.util;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

public final class ValueUtils {

  private ValueUtils() {}

  public static <T> T firstNonNull(T value, T fallback) {
    return value == null ? fallback : value;
  }

  public static double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  public static long coalesce(Long value, long fallback) {
    return value == null ? fallback : value;
  }

  public static Long positiveOrNull(Long value) {
    return value == null || value <= 0 ? null : value;
  }

  public static Long parsePositiveLong(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  public static Long parseNonNegativeLong(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed >= 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  public static Double parseDouble(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      return Double.parseDouble(normalized);
    } catch (NumberFormatException ex) {
      return null;
    }
  }
}

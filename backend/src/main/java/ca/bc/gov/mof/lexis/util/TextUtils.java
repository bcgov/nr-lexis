package ca.bc.gov.mof.lexis.util;

public final class TextUtils {

  private TextUtils() {}

  public static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  public static String firstNonBlank(String value, String fallback) {
    String normalized = trimToNull(value);
    return normalized == null ? fallback : normalized;
  }

  public static String firstTrimmedNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      String normalized = trimToNull(value);
      if (normalized != null) {
        return normalized;
      }
    }
    return null;
  }

  public static String defaultSystemUser(String userId) {
    String normalized = trimToNull(userId);
    return normalized == null ? "system" : normalized;
  }
}

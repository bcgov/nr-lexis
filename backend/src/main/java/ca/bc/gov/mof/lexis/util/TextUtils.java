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
}

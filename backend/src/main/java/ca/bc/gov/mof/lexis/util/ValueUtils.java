package ca.bc.gov.mof.lexis.util;

public final class ValueUtils {

  private ValueUtils() {}

  public static <T> T firstNonNull(T value, T fallback) {
    return value == null ? fallback : value;
  }
}

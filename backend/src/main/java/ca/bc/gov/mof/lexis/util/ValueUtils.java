package ca.bc.gov.mof.lexis.util;

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
}

package ca.bc.gov.mof.lexis.util;

import java.util.List;

public final class CollectionUtils {

  private CollectionUtils() {}

  public static <T> List<T> safeList(List<T> input) {
    return input == null ? List.of() : input;
  }

  public static List<Long> positiveDistinctLongs(List<Long> input) {
    return safeList(input).stream().filter(value -> value != null && value > 0).distinct().toList();
  }
}

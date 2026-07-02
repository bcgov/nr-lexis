package ca.bc.gov.mof.lexis.service.report;

import java.util.Map;

final class ReportParameterUtils {

  private ReportParameterUtils() {}

  static String first(Map<String, String> parameters, String... keys) {
    for (String key : keys) {
      if (parameters.containsKey(key)) {
        return parameters.get(key);
      }
    }
    return null;
  }

  static String firstNonBlank(Map<String, String> parameters, String... keys) {
    for (String key : keys) {
      String value = parameters.get(key);
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return null;
  }
}

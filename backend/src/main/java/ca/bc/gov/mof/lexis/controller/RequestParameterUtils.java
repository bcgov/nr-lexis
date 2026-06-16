package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import org.springframework.util.MultiValueMap;

final class RequestParameterUtils {

  private RequestParameterUtils() {}

  static String first(MultiValueMap<String, String> parameters, String... names) {
    if (parameters == null || names == null) {
      return null;
    }
    for (String name : names) {
      if (name == null) {
        continue;
      }
      String value = trimToNull(parameters.getFirst(name));
      if (value != null) {
        return value;
      }
    }
    return null;
  }
}

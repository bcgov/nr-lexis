package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class SearchRequestUtils {

  private SearchRequestUtils() {}

  static LocalDate parseSearchDate(String input) {
    String value = trimToNull(input);
    if (value == null) {
      return null;
    }

    LocalDate parsed = parseIsoOrLegacyDate(value);
    if (parsed == null) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST,
          "Invalid date value '" + value + "'. Use yyyy-MM-dd or MM/dd/yyyy.");
    }
    return parsed;
  }

  static String firstPresent(String primary, String fallback) {
    if (primary != null && !primary.isBlank()) {
      return primary;
    }
    return fallback;
  }
}

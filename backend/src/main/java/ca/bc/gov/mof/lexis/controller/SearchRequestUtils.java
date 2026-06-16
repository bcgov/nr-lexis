package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
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

  static List<Long> parseApplicationNumbers(String applications) {
    if (applications == null || applications.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "`applications` must not be empty");
    }

    try {
      return Arrays.stream(applications.split(","))
          .map(String::trim)
          .filter(value -> !value.isEmpty())
          .map(Long::valueOf)
          .toList();
    } catch (NumberFormatException ex) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "`applications` must be a comma-separated numeric list", ex);
    }
  }

  static String firstPresent(String primary, String fallback) {
    if (primary != null && !primary.isBlank()) {
      return primary;
    }
    return fallback;
  }
}

package ca.bc.gov.mof.lexis.controller;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class SearchRequestUtils {

  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private SearchRequestUtils() {}

  static LocalDate parseSearchDate(String input) {
    if (input == null || input.trim().isEmpty()) {
      return null;
    }

    String value = input.trim();
    try {
      return LocalDate.parse(value);
    } catch (DateTimeParseException ignored) {
      // Fallback for legacy date format.
    }

    try {
      return LocalDate.parse(value, LEGACY_DATE_FORMATTER);
    } catch (DateTimeParseException ex) {
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST,
          "Invalid date value '" + value + "'. Use yyyy-MM-dd or MM/dd/yyyy.",
          ex);
    }
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
}

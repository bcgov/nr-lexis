package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.util.MultiValueMap;

final class RequestParameterUtils {

  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");

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

  static Long parsePositiveLong(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      long parsed = Long.parseLong(rawValue.trim());
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  static List<Long> parsePositiveLongs(MultiValueMap<String, String> parameters, String... names) {
    if (parameters == null || names == null) {
      return List.of();
    }

    List<String> rawValues = new ArrayList<>();
    for (String name : names) {
      if (name != null) {
        rawValues.addAll(parameters.getOrDefault(name, List.of()));
      }
    }

    return rawValues.stream()
        .filter(value -> value != null)
        .flatMap(value -> List.of(value.split(",")).stream())
        .map(String::trim)
        .filter(value -> !value.isBlank())
        .map(RequestParameterUtils::parsePositiveLong)
        .filter(value -> value != null && value > 0)
        .distinct()
        .toList();
  }

  static Long parseNonNegativeLong(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      long parsed = Long.parseLong(rawValue.trim());
      return parsed >= 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  static Double parseDouble(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      return Double.parseDouble(rawValue.trim());
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  static LocalDate parseDate(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    String normalized = rawValue.trim();
    try {
      return LocalDate.parse(normalized);
    } catch (DateTimeParseException ignored) {
      try {
        return LocalDate.parse(normalized, LEGACY_DATE_FORMATTER);
      } catch (DateTimeParseException ex) {
        return null;
      }
    }
  }

  static String sanitizeFileName(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    String normalized = rawValue.trim();
    int slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    if (slashIndex >= 0 && slashIndex < normalized.length() - 1) {
      normalized = normalized.substring(slashIndex + 1);
    }
    return normalized;
  }
}

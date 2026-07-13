package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.util.ValueUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

final class RequestParameterUtils {

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final TypeReference<Map<String, Object>> JSON_OBJECT_TYPE = new TypeReference<>() {};

  private RequestParameterUtils() {}

  static MultiValueMap<String, String> fromRequest(HttpServletRequest request) {
    LinkedMultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    if (request == null) {
      return parameters;
    }

    request.getParameterMap()
        .forEach((key, values) -> {
          if (values == null) {
            return;
          }
          for (String value : values) {
            parameters.add(key, value);
          }
        });

    if (!isJsonRequest(request)) {
      return parameters;
    }

    try {
      parameters.addAll(fromJsonBody(OBJECT_MAPPER.readValue(request.getInputStream(), JSON_OBJECT_TYPE)));
    } catch (IOException ex) {
      // Fall through with query/form parameters only.
    }
    return parameters;
  }

  static MultiValueMap<String, String> fromJsonBody(Map<String, ?> payload) {
    LinkedMultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    if (payload == null) {
      return parameters;
    }

    payload.forEach((key, value) -> appendJsonValue(parameters, key, value));
    return parameters;
  }

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

  /** Returns a trimmed value while preserving an explicitly supplied blank as an empty string. */
  static String firstPresent(MultiValueMap<String, String> parameters, String... names) {
    if (parameters == null || names == null) {
      return null;
    }
    for (String name : names) {
      if (name == null || !parameters.containsKey(name)) {
        continue;
      }
      String value = parameters.getFirst(name);
      return value == null ? "" : value.trim();
    }
    return null;
  }

  private static boolean isJsonRequest(HttpServletRequest request) {
    String contentType = request.getContentType();
    return contentType != null
        && contentType.toLowerCase(Locale.ROOT).contains(MediaType.APPLICATION_JSON_VALUE);
  }

  private static void appendJsonValue(
      LinkedMultiValueMap<String, String> parameters, String key, Object value) {
    if (key == null || value == null) {
      return;
    }
    if (value instanceof Collection<?> collection) {
      collection.forEach(item -> appendJsonValue(parameters, key, item));
      return;
    }
    parameters.add(key, String.valueOf(value));
  }

  static Long parsePositiveLong(String rawValue) {
    return ValueUtils.parsePositiveLong(rawValue);
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
    return ValueUtils.parseNonNegativeLong(rawValue);
  }

  static Double parseDouble(String rawValue) {
    return ValueUtils.parseDouble(rawValue);
  }

  static LocalDate parseDate(String rawValue) {
    return parseIsoOrLegacyDate(rawValue);
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

package ca.bc.gov.mof.lexis.service.report;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Normalizes and validates report request values before authorization or report generation. */
public final class LexisReportRequestNormalizer {

  private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
  private static final Pattern LEGACY_DATE = Pattern.compile("\\d{2}/\\d{2}/\\d{4}");
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/uuuu").withResolverStyle(ResolverStyle.STRICT);
  private static final List<DateRange> DATE_RANGES =
      List.of(
          new DateRange("fromDate", "toDate"),
          new DateRange("listingFromDate", "listingToDate"),
          new DateRange("withdrawnFromDate", "withdrawnToDate"),
          new DateRange("withdrawalFromDate", "withdrawalToDate"));

  private LexisReportRequestNormalizer() {}

  public static LexisReportRequestDto normalize(LexisReportRequestDto request) {
    if (request == null) {
      return new LexisReportRequestDto(Map.of(), LexisReportFormat.PDF.name());
    }

    Map<String, String> normalizedParameters = normalizeParameters(request.parameters());
    String normalizedFormat = LexisReportFormat.fromNullable(request.format()).name();
    return new LexisReportRequestDto(normalizedParameters, normalizedFormat);
  }

  public static String normalizeExplicitFormat(String format) {
    if (format == null || format.isBlank()) {
      return null;
    }
    return LexisReportFormat.fromNullable(format).name();
  }

  private static Map<String, String> normalizeParameters(Map<String, String> parameters) {
    if (parameters == null || parameters.isEmpty()) {
      return Map.of();
    }

    Map<String, String> normalized = new LinkedHashMap<>();
    parameters.forEach(
        (name, value) -> {
          if (name == null || name.isBlank()) {
            throw new LexisReportValidationException(
                "Report parameter names must not be blank.");
          }
          if (value == null) {
            throw new LexisReportValidationException(
                "Report parameter '" + name + "' must not be null.");
          }
          normalized.put(name, value.trim());
        });

    DATE_RANGES.forEach(range -> normalizeAndValidateDateRange(normalized, range));
    return Map.copyOf(normalized);
  }

  private static void normalizeAndValidateDateRange(
      Map<String, String> parameters, DateRange range) {
    LocalDate fromDate = normalizeDate(parameters, range.fromParameter());
    LocalDate toDate = normalizeDate(parameters, range.toParameter());
    if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
      throw new LexisReportValidationException(
          "Report date range '"
              + range.fromParameter()
              + "' to '"
              + range.toParameter()
              + "' must not be reversed.");
    }
  }

  private static LocalDate normalizeDate(Map<String, String> parameters, String name) {
    if (!parameters.containsKey(name)) {
      return null;
    }

    String value = parameters.get(name);
    if (value.isBlank()) {
      return null;
    }

    LocalDate parsed = parseDate(value);
    if (parsed == null) {
      throw new LexisReportValidationException(
          "Report date '" + name + "' must use yyyy-MM-dd or MM/dd/yyyy.");
    }
    parameters.put(name, parsed.toString());
    return parsed;
  }

  private static LocalDate parseDate(String value) {
    try {
      if (ISO_DATE.matcher(value).matches()) {
        return LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE);
      }
      if (LEGACY_DATE.matcher(value).matches()) {
        return LocalDate.parse(value, LEGACY_DATE_FORMATTER);
      }
    } catch (DateTimeParseException ignored) {
      // The caller reports one public-safe validation message for every invalid date.
    }
    return null;
  }

  private record DateRange(String fromParameter, String toParameter) {}
}

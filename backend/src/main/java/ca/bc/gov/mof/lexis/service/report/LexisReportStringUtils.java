package ca.bc.gov.mof.lexis.service.report;

public final class LexisReportStringUtils {

  private LexisReportStringUtils() {}

  public static String chomp(String value, String separator) {
    if (value == null || value.isEmpty() || separator == null || separator.isEmpty()) {
      return value;
    }
    return value.endsWith(separator)
        ? value.substring(0, value.length() - separator.length())
        : value;
  }

  public static String chop(String value) {
    if (value == null || value.isEmpty()) {
      return value;
    }
    if (value.endsWith("\r\n")) {
      return value.substring(0, value.length() - 2);
    }
    return value.substring(0, value.length() - 1);
  }
}

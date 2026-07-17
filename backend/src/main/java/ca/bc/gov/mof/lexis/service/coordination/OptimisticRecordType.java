package ca.bc.gov.mof.lexis.service.coordination;

import java.util.Locale;

public enum OptimisticRecordType {
  APPLICATION,
  EXEMPTION,
  PERMIT,
  OFFER;

  public String normalizeIdentifier(String identifier) {
    if (identifier == null || identifier.isBlank()) {
      throw new IllegalArgumentException("A record identifier is required.");
    }
    String normalized = identifier.trim();
    if (this == EXEMPTION) {
      return normalized.toUpperCase(Locale.ROOT);
    }
    try {
      long number = Long.parseLong(normalized);
      if (number < 1) {
        throw new IllegalArgumentException("A positive record identifier is required.");
      }
      return Long.toString(number);
    } catch (NumberFormatException exception) {
      throw new IllegalArgumentException("A numeric record identifier is required.", exception);
    }
  }
}

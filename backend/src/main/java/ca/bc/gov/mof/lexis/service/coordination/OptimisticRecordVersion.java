package ca.bc.gov.mof.lexis.service.coordination;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;

public record OptimisticRecordVersion(
    OptimisticRecordType recordType,
    String recordId,
    Instant savedAt,
    String updatedBy,
    String fingerprint) {

  private static final String TOKEN_PREFIX = "v1";

  public OptimisticRecordVersion {
    Objects.requireNonNull(recordType, "recordType");
    recordId = recordType.normalizeIdentifier(recordId);
    if (fingerprint == null || fingerprint.isBlank()) {
      throw new IllegalArgumentException("A record fingerprint is required.");
    }
    fingerprint = fingerprint.trim().toLowerCase(java.util.Locale.ROOT);
  }

  public String token() {
    String encodedId =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(recordId.getBytes(StandardCharsets.UTF_8));
    long savedAtMillis = savedAt == null ? 0L : savedAt.toEpochMilli();
    return String.join(
        ".",
        TOKEN_PREFIX,
        recordType.name(),
        encodedId,
        Long.toString(savedAtMillis),
        fingerprint);
  }

  public static ExpectedRecordVersion parse(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      throw new IllegalArgumentException("A record version is required.");
    }
    String token = stripQuotes(rawToken.trim());
    String[] parts = token.split("\\.", -1);
    if (parts.length != 5 || !TOKEN_PREFIX.equals(parts[0])) {
      throw new IllegalArgumentException("The record version is invalid.");
    }
    try {
      OptimisticRecordType recordType = OptimisticRecordType.valueOf(parts[1]);
      String recordId =
          new String(Base64.getUrlDecoder().decode(parts[2]), StandardCharsets.UTF_8);
      long savedAtMillis = Long.parseLong(parts[3]);
      if (parts[4].isBlank()) {
        throw new IllegalArgumentException("The record version is invalid.");
      }
      return new ExpectedRecordVersion(
          recordType,
          recordType.normalizeIdentifier(recordId),
          savedAtMillis == 0L ? null : Instant.ofEpochMilli(savedAtMillis),
          parts[4].toLowerCase(java.util.Locale.ROOT),
          token);
    } catch (IllegalArgumentException exception) {
      throw new IllegalArgumentException("The record version is invalid.", exception);
    }
  }

  private static String stripQuotes(String token) {
    String unwrapped = token.startsWith("W/") ? token.substring(2).trim() : token;
    if (unwrapped.length() >= 2
        && unwrapped.charAt(0) == '"'
        && unwrapped.charAt(unwrapped.length() - 1) == '"') {
      return unwrapped.substring(1, unwrapped.length() - 1);
    }
    return unwrapped;
  }

  public record ExpectedRecordVersion(
      OptimisticRecordType recordType,
      String recordId,
      Instant savedAt,
      String fingerprint,
      String token) {}
}

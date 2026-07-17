package ca.bc.gov.mof.lexis.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/** Formats bounded, control-safe log fields without exposing correlation values verbatim. */
public final class SafeLogFormatter {

  private static final String MISSING_VALUE = "-";
  private static final int MAX_SAFE_VALUE_LENGTH = 80;
  private static final int FINGERPRINT_BYTES = 12;
  private static final int SHA_256_HEX_LENGTH = 64;
  private static final int FINGERPRINT_HEX_LENGTH = FINGERPRINT_BYTES * 2;

  private SafeLogFormatter() {}

  /** Use for bounded, non-sensitive workflow values; sensitive values must be fingerprinted. */
  public static String controlSafe(String value) {
    if (value == null || value.isBlank()) {
      return MISSING_VALUE;
    }

    String normalized = value.strip();
    StringBuilder safe = new StringBuilder(Math.min(normalized.length(), MAX_SAFE_VALUE_LENGTH));
    for (int index = 0;
        index < normalized.length() && safe.length() < MAX_SAFE_VALUE_LENGTH;
        index++) {
      char character = normalized.charAt(index);
      safe.append(isLogControl(character) ? '_' : character);
    }
    return safe.isEmpty() ? MISSING_VALUE : safe.toString();
  }

  public static String fingerprint(String value) {
    if (value == null || value.isBlank()) {
      return MISSING_VALUE;
    }
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return "sha256:" + HexFormat.of().formatHex(digest, 0, FINGERPRINT_BYTES);
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 is unavailable.", ex);
    }
  }

  public static String truncatedSha256(String sha256Hex) {
    if (sha256Hex == null) {
      return MISSING_VALUE;
    }
    String normalized = sha256Hex.strip().toLowerCase(Locale.ROOT);
    if (normalized.length() != SHA_256_HEX_LENGTH
        || !normalized.chars().allMatch(SafeLogFormatter::isLowercaseHex)) {
      return MISSING_VALUE;
    }
    return "sha256:" + normalized.substring(0, FINGERPRINT_HEX_LENGTH);
  }

  public static String exceptionType(Throwable throwable) {
    if (throwable == null) {
      return MISSING_VALUE;
    }
    String simpleName = throwable.getClass().getSimpleName();
    return controlSafe(simpleName.isBlank() ? throwable.getClass().getName() : simpleName);
  }

  private static boolean isLogControl(char character) {
    return Character.isISOControl(character) || character == '\u2028' || character == '\u2029';
  }

  private static boolean isLowercaseHex(int character) {
    return (character >= '0' && character <= '9') || (character >= 'a' && character <= 'f');
  }
}

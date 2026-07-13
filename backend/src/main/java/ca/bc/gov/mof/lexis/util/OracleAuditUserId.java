package ca.bc.gov.mof.lexis.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Encodes authenticated principals for legacy Oracle audit columns limited to 30 ASCII bytes. */
public final class OracleAuditUserId {

  static final int MAX_BYTES = 30;
  private static final int HASH_BYTES = 6;
  private static final int HASH_CHARACTERS = HASH_BYTES * 2;
  private static final char HASH_SEPARATOR = '~';
  private static final int PREFIX_CHARACTERS = MAX_BYTES - HASH_CHARACTERS - 1;

  private OracleAuditUserId() {}

  /**
   * Returns a trimmed Oracle-safe audit identity, or {@code null} when the value is absent.
   *
   * <p>Printable ASCII identities that already fit the legacy column are preserved. Other values
   * retain a readable ASCII prefix and receive a 48-bit SHA-256-derived suffix calculated from the
   * complete trimmed identity.
   */
  public static String encode(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    if (isPrintableAscii(normalized) && normalized.length() <= MAX_BYTES) {
      return normalized;
    }

    String prefix = readablePrefix(normalized);
    String suffix = hashSuffix(normalized);
    return prefix + HASH_SEPARATOR + suffix;
  }

  private static String readablePrefix(String value) {
    StringBuilder prefix = new StringBuilder(PREFIX_CHARACTERS);
    boolean previousReplacement = false;
    for (int offset = 0; offset < value.length() && prefix.length() < PREFIX_CHARACTERS; ) {
      int codePoint = value.codePointAt(offset);
      offset += Character.charCount(codePoint);
      if (isReadableIdentityCharacter(codePoint)) {
        prefix.append((char) codePoint);
        previousReplacement = false;
      } else if (!previousReplacement) {
        prefix.append('_');
        previousReplacement = true;
      }
    }
    return prefix.isEmpty() ? "user" : prefix.toString();
  }

  private static boolean isPrintableAscii(String value) {
    return value.chars().allMatch(character -> character >= 0x20 && character <= 0x7e);
  }

  private static boolean isReadableIdentityCharacter(int character) {
    return character >= 'A' && character <= 'Z'
        || character >= 'a' && character <= 'z'
        || character >= '0' && character <= '9'
        || character == '\\'
        || character == '-'
        || character == '_'
        || character == '.'
        || character == '@';
  }

  private static String hashSuffix(String value) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest, 0, HASH_BYTES);
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("The required SHA-256 digest is unavailable.", exception);
    }
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }
}

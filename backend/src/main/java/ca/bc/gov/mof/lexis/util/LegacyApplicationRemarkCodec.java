package ca.bc.gov.mof.lexis.util;

import java.util.regex.Pattern;

/** Keeps application remarks compatible with legacy's escaped-text Oracle storage. */
public final class LegacyApplicationRemarkCodec {

  public static final int MAX_STORAGE_LENGTH = 254;
  private static final Pattern LEGACY_ENTITY = Pattern.compile("&(amp|lt|gt);");

  private LegacyApplicationRemarkCodec() {}

  public static String encode(String plainText) {
    return plainText == null
        ? null
        : plainText.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  public static String decode(String storedText) {
    if (storedText == null) {
      return null;
    }
    // Decode one layer only, so an entered literal "&amp;" survives a save/read round trip.
    // This returns plain text; consumers must continue rendering it as text, never as HTML.
    return LEGACY_ENTITY.matcher(storedText)
        .replaceAll(
            match -> switch (match.group(1)) {
              case "amp" -> "&";
              case "lt" -> "<";
              default -> ">";
            });
  }

  public static boolean fitsStorage(String plainText, int maximumLength) {
    return plainText == null || encode(plainText).length() <= maximumLength;
  }
}

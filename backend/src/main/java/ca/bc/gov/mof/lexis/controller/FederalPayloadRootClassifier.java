package ca.bc.gov.mof.lexis.controller;

import java.nio.charset.StandardCharsets;

final class FederalPayloadRootClassifier {

  private static final int DEFAULT_MAX_XML_ROOT_INSPECTION_BYTES = 16 * 1024;

  private FederalPayloadRootClassifier() {}

  static String classify(byte[] payload) {
    return classify(payload, DEFAULT_MAX_XML_ROOT_INSPECTION_BYTES);
  }

  static String classify(byte[] payload, int maxBytes) {
    if (payload == null || payload.length == 0) {
      return null;
    }
    int length = Math.min(payload.length, Math.max(1, maxBytes));
    return classify(new String(payload, 0, length, StandardCharsets.UTF_8));
  }

  static String classify(String text) {
    String rootName = firstXmlStartElementName(text);
    if (rootName == null) {
      return null;
    }
    if ("doctype".equals(rootName)) {
      return "doctype";
    }
    String localName = localName(rootName);
    if ("LexisSubmission".equals(localName)) {
      return "lexis-submission";
    }
    if ("ESFSubmission".equals(localName)) {
      return classifyEsfSubmission(text);
    }
    if ("Envelope".equals(localName)) {
      return classifySoapEnvelope(text);
    }
    return "unknown";
  }

  private static String classifySoapEnvelope(String text) {
    if (containsStartElement(text, "ESFSubmission")) {
      return "soap-envelope:" + classifyEsfSubmission(text);
    }
    if (containsEscapedStartElement(text, "ESFSubmission")) {
      return "soap-envelope:escaped-esf-submission";
    }
    if (containsStartElement(text, "LexisSubmission")) {
      return "soap-envelope:lexis-submission";
    }
    if (containsEscapedStartElement(text, "LexisSubmission")) {
      return "soap-envelope:escaped-lexis-submission";
    }
    return "soap-envelope";
  }

  private static String classifyEsfSubmission(String text) {
    String submissionContent = submissionContent(text);
    if (submissionContent == null) {
      return "esf-submission";
    }
    String trimmed = trimToNull(submissionContent);
    if (trimmed == null) {
      return "esf-submission";
    }
    if (startsWithLexisSubmission(trimmed)) {
      return "esf-submission:lexis-child";
    }
    if (startsWithCdataLexisSubmission(trimmed)) {
      return "esf-submission:cdata-lexis";
    }
    if (startsWithEscapedLexisSubmission(trimmed)) {
      return "esf-submission:escaped-lexis";
    }
    return "esf-submission";
  }

  private static String submissionContent(String text) {
    if (text == null) {
      return null;
    }
    ElementStart start = findStartElement(text, "submissionContent", 0, true);
    if (start == null || start.selfClosing()) {
      return null;
    }
    int endStart = findEndElementStart(text, "submissionContent", start.endExclusive(), true);
    return endStart >= 0 ? text.substring(start.endExclusive(), endStart) : null;
  }

  private static boolean startsWithLexisSubmission(String text) {
    return "LexisSubmission".equals(localName(firstXmlStartElementName(text)));
  }

  private static boolean containsStartElement(String text, String localName) {
    return text != null && findStartElement(text, localName, 0, false) != null;
  }

  private static boolean containsEscapedStartElement(String text, String localName) {
    if (text == null) {
      return false;
    }
    int offset = 0;
    while (offset < text.length()) {
      int start = indexOfIgnoreCase(text, "&lt;", offset);
      if (start < 0) {
        return false;
      }
      int nameStart = start + 4;
      if (nameStart < text.length() && text.charAt(nameStart) == '/') {
        offset = nameStart + 1;
        continue;
      }
      int nameEnd = xmlNameEnd(text, nameStart);
      if (nameEnd > nameStart
          && localNameMatches(text.substring(nameStart, nameEnd), localName, true)) {
        return true;
      }
      offset = Math.max(nameStart + 1, nameEnd);
    }
    return false;
  }

  private static boolean startsWithCdataLexisSubmission(String text) {
    if (!text.startsWith("<![CDATA[")) {
      return false;
    }
    int end = text.indexOf("]]>", 9);
    String cdata = end < 0 ? text.substring(9) : text.substring(9, end);
    return startsWithLexisSubmission(trimToNull(cdata));
  }

  private static boolean startsWithEscapedLexisSubmission(String text) {
    String unescaped = unescapeLeadingXmlEntities(text);
    return startsWithLexisSubmission(unescaped);
  }

  private static String unescapeLeadingXmlEntities(String text) {
    if (text == null) {
      return null;
    }
    return text
        .replace("&lt;", "<")
        .replace("&LT;", "<")
        .replace("&gt;", ">")
        .replace("&GT;", ">")
        .replace("&quot;", "\"")
        .replace("&QUOT;", "\"")
        .replace("&apos;", "'")
        .replace("&APOS;", "'")
        .replace("&amp;", "&")
        .replace("&AMP;", "&");
  }

  private static String firstXmlStartElementName(String text) {
    if (text == null || text.isBlank()) {
      return null;
    }
    int offset = 0;
    while (offset < text.length()) {
      int start = text.indexOf('<', offset);
      if (start < 0 || start == text.length() - 1) {
        return null;
      }
      if (text.startsWith("<?", start)) {
        offset = skipXmlDeclaration(text, start);
        continue;
      }
      if (text.startsWith("<!--", start)) {
        offset = skipXmlComment(text, start);
        continue;
      }
      if (text.startsWith("<!", start)) {
        return "doctype";
      }
      if (text.charAt(start + 1) == '/') {
        return null;
      }
      int nameStart = start + 1;
      int nameEnd = nameStart;
      while (nameEnd < text.length()) {
        char value = text.charAt(nameEnd);
        if (Character.isWhitespace(value) || value == '>' || value == '/') {
          break;
        }
        nameEnd++;
      }
      return nameEnd > nameStart ? text.substring(nameStart, nameEnd) : null;
    }
    return null;
  }

  private static int skipXmlDeclaration(String text, int start) {
    int end = text.indexOf("?>", start + 2);
    return end < 0 ? text.length() : end + 2;
  }

  private static int skipXmlComment(String text, int start) {
    int end = text.indexOf("-->", start + 4);
    return end < 0 ? text.length() : end + 3;
  }

  private static ElementStart findStartElement(
      String text, String expectedLocalName, int fromIndex, boolean ignoreCase) {
    int offset = Math.max(0, fromIndex);
    while (offset < text.length()) {
      int start = text.indexOf('<', offset);
      if (start < 0 || start == text.length() - 1) {
        return null;
      }
      char marker = text.charAt(start + 1);
      if (marker == '/' || marker == '!' || marker == '?') {
        offset = start + 2;
        continue;
      }

      int nameStart = start + 1;
      int nameEnd = xmlNameEnd(text, nameStart);
      if (nameEnd == nameStart) {
        offset = nameStart + 1;
        continue;
      }

      int tagEnd = text.indexOf('>', nameEnd);
      if (localNameMatches(text.substring(nameStart, nameEnd), expectedLocalName, ignoreCase)) {
        if (tagEnd < 0) {
          return null;
        }
        return new ElementStart(tagEnd + 1, isSelfClosingElement(text, nameEnd, tagEnd));
      }
      offset = tagEnd >= 0 ? tagEnd + 1 : nameEnd;
    }
    return null;
  }

  private static int findEndElementStart(
      String text, String expectedLocalName, int fromIndex, boolean ignoreCase) {
    int offset = Math.max(0, fromIndex);
    while (offset < text.length()) {
      int start = text.indexOf("</", offset);
      if (start < 0) {
        return -1;
      }
      int nameStart = start + 2;
      int nameEnd = xmlNameEnd(text, nameStart);
      if (nameEnd > nameStart
          && localNameMatches(text.substring(nameStart, nameEnd), expectedLocalName, ignoreCase)) {
        return start;
      }
      offset = Math.max(nameStart + 1, nameEnd);
    }
    return -1;
  }

  private static int xmlNameEnd(String text, int start) {
    int offset = start;
    while (offset < text.length() && isXmlNameCharacter(text.charAt(offset))) {
      offset++;
    }
    return offset;
  }

  private static boolean isXmlNameCharacter(char value) {
    return Character.isLetterOrDigit(value)
        || value == '_'
        || value == '-'
        || value == '.'
        || value == ':';
  }

  private static boolean isSelfClosingElement(String text, int nameEnd, int tagEnd) {
    int offset = tagEnd - 1;
    while (offset >= nameEnd && Character.isWhitespace(text.charAt(offset))) {
      offset--;
    }
    return offset >= nameEnd && text.charAt(offset) == '/';
  }

  private static boolean localNameMatches(
      String xmlName, String expectedLocalName, boolean ignoreCase) {
    String actualLocalName = localName(xmlName);
    if (actualLocalName == null) {
      return false;
    }
    return ignoreCase
        ? actualLocalName.equalsIgnoreCase(expectedLocalName)
        : actualLocalName.equals(expectedLocalName);
  }

  private static int indexOfIgnoreCase(String text, String token, int fromIndex) {
    int max = text.length() - token.length();
    for (int offset = Math.max(0, fromIndex); offset <= max; offset++) {
      if (text.regionMatches(true, offset, token, 0, token.length())) {
        return offset;
      }
    }
    return -1;
  }

  private static String localName(String xmlName) {
    String normalized = trimToNull(xmlName);
    if (normalized == null) {
      return null;
    }
    int prefixSeparator = normalized.indexOf(':');
    return prefixSeparator >= 0 ? normalized.substring(prefixSeparator + 1) : normalized;
  }

  private static String trimToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private record ElementStart(int endExclusive, boolean selfClosing) {}
}

package ca.bc.gov.mof.lexis.controller;

import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class FederalPayloadRootClassifier {

  private static final int DEFAULT_MAX_XML_ROOT_INSPECTION_BYTES = 16 * 1024;
  private static final Pattern SUBMISSION_CONTENT_PATTERN =
      Pattern.compile(
          "<(?:[A-Za-z_][\\w.-]*:)?submissionContent\\b[^>]*>(.*?)</(?:[A-Za-z_][\\w.-]*:)?submissionContent>",
          Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

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
    Matcher matcher = SUBMISSION_CONTENT_PATTERN.matcher(text);
    return matcher.find() ? matcher.group(1) : null;
  }

  private static boolean startsWithLexisSubmission(String text) {
    return "LexisSubmission".equals(localName(firstXmlStartElementName(text)));
  }

  private static boolean containsStartElement(String text, String localName) {
    return text != null
        && Pattern.compile("<(?:[A-Za-z_][\\w.-]*:)?" + localName + "\\b").matcher(text).find();
  }

  private static boolean containsEscapedStartElement(String text, String localName) {
    return text != null
        && Pattern.compile("&lt;(?:[A-Za-z_][\\w.-]*:)?" + localName + "\\b", Pattern.CASE_INSENSITIVE)
            .matcher(text)
            .find();
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
}

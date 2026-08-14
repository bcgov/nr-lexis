package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import org.springframework.security.core.Authentication;

final class RtmEmsLogAmvAuditActor {

  private static final int MAX_LENGTH = 100;

  private RtmEmsLogAmvAuditActor() {}

  static String resolve(
      LexisPrincipalService principalService, Authentication authentication) {
    try {
      return normalize(principalService.resolvePrincipalName(authentication));
    } catch (RuntimeException exception) {
      return null;
    }
  }

  private static String normalize(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }

    String normalized = value.strip();
    StringBuilder safe = new StringBuilder(Math.min(normalized.length(), MAX_LENGTH));
    for (int index = 0; index < normalized.length() && safe.length() < MAX_LENGTH; index++) {
      char current = normalized.charAt(index);
      safe.append(
          isAsciiLetterOrDigit(current)
                  || current == '.'
                  || current == '-'
                  || current == '_'
                  || current == '@'
                  || current == '\\'
                  || current == ':'
              ? current
              : '_');
    }
    return safe.isEmpty() ? null : safe.toString();
  }

  private static boolean isAsciiLetterOrDigit(char value) {
    return (value >= 'a' && value <= 'z')
        || (value >= 'A' && value <= 'Z')
        || (value >= '0' && value <= '9');
  }
}

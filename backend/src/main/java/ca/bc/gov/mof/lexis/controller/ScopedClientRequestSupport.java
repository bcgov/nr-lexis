package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import org.springframework.security.core.Authentication;

final class ScopedClientRequestSupport {

  private ScopedClientRequestSupport() {}

  static String currentForestClientNumber(
      LexisSessionService sessionService, Authentication authentication) {
    if (sessionService == null) {
      return null;
    }
    String clientNumber = sessionService.resolveForestClientNumber(authentication);
    if (clientNumber == null || clientNumber.isBlank()) {
      return null;
    }
    return clientNumber.trim();
  }

  static boolean matchesScopedClient(String scopedClientNumber, String... candidateClientNumbers) {
    if (scopedClientNumber == null || scopedClientNumber.isBlank()) {
      return true;
    }
    for (String candidate : candidateClientNumbers) {
      if (candidate != null && scopedClientNumber.trim().equals(candidate.trim())) {
        return true;
      }
    }
    return false;
  }
}

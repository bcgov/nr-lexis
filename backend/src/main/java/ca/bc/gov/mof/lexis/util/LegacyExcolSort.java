package ca.bc.gov.mof.lexis.util;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.util.List;
import java.util.Optional;

/**
 * Legacy LEXIS species/end-use sort: the EXCOL code shown for an application. The review queue,
 * application details and permit screens all derive it the same way, so the rule lives here once.
 */
public final class LegacyExcolSort {

  private static final String PRODUCT_TYPE_UNMANUFACTURED = "T";

  private LegacyExcolSort() {}

  /**
   * SQL LIKE pattern for EXCOL codes covering the given number of species plus the end use, for
   * example {@code __/__/__} for two species.
   */
  public static String candidatePattern(int speciesCount) {
    return speciesCount < 1 ? null : "__/".repeat(speciesCount) + "__";
  }

  /**
   * Picks the sort code the way legacy LEXIS did: a single candidate wins outright; otherwise the
   * first candidate that contains every species code and, unless the product is unmanufactured
   * timber (which has no end use), the first end-use code.
   */
  public static Optional<String> select(
      String productTypeCode,
      List<String> speciesCodes,
      String firstEndUseCode,
      List<String> candidates) {
    if (candidates == null || candidates.isEmpty()) {
      return Optional.empty();
    }
    if (candidates.size() == 1) {
      return Optional.ofNullable(trimToNull(candidates.get(0)));
    }
    boolean unmanufactured =
        PRODUCT_TYPE_UNMANUFACTURED.equalsIgnoreCase(trimToNull(productTypeCode));
    String endUseCode = trimToNull(firstEndUseCode);
    for (String rawCandidate : candidates) {
      String candidate = trimToNull(rawCandidate);
      if (candidate != null
          && containsEverySpecies(candidate, speciesCodes)
          && (unmanufactured || (endUseCode != null && candidate.contains(endUseCode)))) {
        return Optional.of(candidate);
      }
    }
    return Optional.empty();
  }

  private static boolean containsEverySpecies(String candidate, List<String> speciesCodes) {
    for (String rawSpeciesCode : speciesCodes) {
      String speciesCode = trimToNull(rawSpeciesCode);
      if (speciesCode == null || !candidate.contains(speciesCode)) {
        return false;
      }
    }
    return true;
  }
}

package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | LegacyExcolSort")
class LegacyExcolSortTest {

  @Test
  void candidatePatternCoversEachSpeciesAndTheEndUse() {
    assertThat(LegacyExcolSort.candidatePattern(1)).isEqualTo("__/__");
    assertThat(LegacyExcolSort.candidatePattern(2)).isEqualTo("__/__/__");
    assertThat(LegacyExcolSort.candidatePattern(0)).isNull();
  }

  @Test
  void candidatePatternMatchesExactCodesAndDoubleEndUses() {
    assertThat(LegacyExcolSort.matchesCandidatePattern("HE/BA/PL", 2)).isTrue();
    assertThat(LegacyExcolSort.matchesCandidatePattern("CE/UT SH", 1)).isTrue();
    assertThat(LegacyExcolSort.matchesCandidatePattern("FI/PL (LG)", 1)).isTrue();
    assertThat(LegacyExcolSort.matchesCandidatePattern("HE/BA/SP/CS", 2)).isFalse();
    assertThat(LegacyExcolSort.matchesCandidatePattern("HE/PL", 2)).isFalse();
    assertThat(LegacyExcolSort.matchesCandidatePattern(null, 1)).isFalse();
    assertThat(LegacyExcolSort.matchesCandidatePattern("HE/PL", 0)).isFalse();
  }

  @Test
  void singleCandidateWinsOutright() {
    assertThat(LegacyExcolSort.select("H", List.of("CE"), "LU", List.of(" FI/SA ")))
        .contains("FI/SA");
  }

  @Test
  void picksTheFirstCandidateWithEverySpeciesAndTheFirstEndUse() {
    assertThat(
            LegacyExcolSort.select(
                "H",
                List.of("FI", "HE"),
                "SA",
                List.of("FI/CE/SA", "FI/HE/LU", "FI/HE/SA", "HE/FI/SA")))
        .contains("FI/HE/SA");
  }

  @Test
  void unmanufacturedTimberIgnoresTheEndUse() {
    assertThat(
            LegacyExcolSort.select(
                "t", List.of("FI"), "SA", List.of("CE/LU", "FI/LU")))
        .contains("FI/LU");
  }

  @Test
  void missingSpeciesEndUseOrMatchesYieldNoSort() {
    assertThat(LegacyExcolSort.select("H", List.of("FI"), null, List.of("FI/SA", "FI/LU")))
        .isEmpty();
    assertThat(
            LegacyExcolSort.select(
                "H", Arrays.asList("FI", null), "SA", List.of("FI/SA", "FI/LU")))
        .isEmpty();
    assertThat(LegacyExcolSort.select("H", List.of("FI"), "SA", List.of())).isEmpty();
  }
}

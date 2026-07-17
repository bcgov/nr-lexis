package ca.bc.gov.mof.lexis.service;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.service.ScaleDomainValidator.ScaleValues;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class ScaleDomainValidatorTest {

  @Test
  void numericValidationShouldRejectNonFiniteAndLegacyMaximumOverruns() {
    assertThat(
            ScaleDomainValidator.validateNumericValues(
                ScaleDomainValidator.MAX_SCALE_PIECES + 1, Double.NaN, false))
        .containsExactly(
            "The scale pieces must be less than 999999999.",
            "The scale volume must be greater than or equal to 0.");

    assertThat(
            ScaleDomainValidator.validateNumericValues(
                1L, ScaleDomainValidator.MAX_SCALE_VOLUME.doubleValue() + 0.1d, true))
        .containsExactly("The scale volume must be less than 99999.9.");
  }

  @Test
  void aggregateValidationShouldUseDecimalSafeTotalsAndCaseInsensitiveCombinations() {
    List<ScaleValues> scales =
        List.of(
            new ScaleValues("TM-1", "HE", "A", 40L, 0.1d),
            new ScaleValues("TM-2", "FI", "B", 50L, 0.2d));

    assertThat(
            ScaleDomainValidator.containsCombination(
                scales, new ScaleValues(" tm-1 ", "he", "a", 1L, 0.1d)))
        .isTrue();
    assertThat(ScaleDomainValidator.totalPieces(scales)).isEqualTo(90L);
    assertThat(ScaleDomainValidator.totalVolume(scales)).isEqualByComparingTo(new BigDecimal("0.3"));
    assertThat(ScaleDomainValidator.exceedsPieces(scales, 11L, 100L)).isTrue();
    assertThat(ScaleDomainValidator.exceedsVolume(scales, 0.1d, 0.4d)).isFalse();
  }
}

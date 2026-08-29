package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class InvoiceStorageConstraintsTest {

  @Test
  void shouldAllowOracleScaleRoundingWhenTheRoundedAmountFits() {
    assertThat(InvoiceStorageConstraints.isValidInvoiceAmount(new BigDecimal("9999999.994")))
        .isTrue();
    assertThat(
            InvoiceStorageConstraints.isValidInvoiceConversionRate(
                new BigDecimal("9.999994")))
        .isTrue();
    assertThat(InvoiceStorageConstraints.isValidInvoiceAmount(new BigDecimal("0.001")))
        .isTrue();
  }

  @Test
  void shouldRejectValuesThatOverflowAfterOracleScaleRounding() {
    assertThat(InvoiceStorageConstraints.isValidInvoiceAmount(new BigDecimal("9999999.995")))
        .isFalse();
    assertThat(
            InvoiceStorageConstraints.isValidInvoiceConversionRate(
                new BigDecimal("9.999995")))
        .isFalse();
  }

  @Test
  void shouldRejectExtremePositiveExponentsWithoutAttemptingScaleConversion() {
    BigDecimal extremeValue = new BigDecimal("1E+2147483647");

    assertThat(InvoiceStorageConstraints.isValidInvoiceAmount(extremeValue)).isFalse();
    assertThat(InvoiceStorageConstraints.isValidInvoiceConversionRate(extremeValue)).isFalse();
  }

  @Test
  void shouldSafelyRoundExtremeSmallPositiveValuesToZero() {
    BigDecimal extremeValue = new BigDecimal("1E-2147483647");

    assertThat(InvoiceStorageConstraints.isValidInvoiceAmount(extremeValue)).isTrue();
    assertThat(InvoiceStorageConstraints.roundInvoiceAmountForStorage(extremeValue))
        .isEqualByComparingTo("0.00");
  }

  @Test
  void shouldRoundAcceptedValuesToTheirOracleColumnScales() {
    assertThat(
            InvoiceStorageConstraints.roundInvoiceAmountForStorage(
                new BigDecimal("9999999.994")))
        .isEqualByComparingTo("9999999.99");
    assertThat(
            InvoiceStorageConstraints.roundInvoiceConversionRateForStorage(
                new BigDecimal("1.000001")))
        .isEqualByComparingTo("1.00000");
    assertThat(
            InvoiceStorageConstraints.roundInvoiceAmountForStorage(
                new BigDecimal("12.001")))
        .isEqualByComparingTo("12.00");
  }
}

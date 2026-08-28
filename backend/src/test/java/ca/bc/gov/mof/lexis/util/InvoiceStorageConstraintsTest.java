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
}

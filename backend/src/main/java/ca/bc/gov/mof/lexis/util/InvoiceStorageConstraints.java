package ca.bc.gov.mof.lexis.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class InvoiceStorageConstraints {

  public static final int INVOICE_NUMBER_MAX_LENGTH = 9;
  public static final int INVOICE_AMOUNT_PRECISION = 9;
  public static final int INVOICE_AMOUNT_SCALE = 2;
  public static final int INVOICE_CONVERSION_RATE_PRECISION = 6;
  public static final int INVOICE_CONVERSION_RATE_SCALE = 5;

  private InvoiceStorageConstraints() {}

  public static boolean isValidInvoiceNumber(String value) {
    return value != null
        && !value.isBlank()
        && value.length() <= INVOICE_NUMBER_MAX_LENGTH
        && value.chars().allMatch(character -> character >= 0x20 && character <= 0x7e);
  }

  public static boolean isValidInvoiceAmount(BigDecimal value) {
    return isPositiveOracleNumber(value, INVOICE_AMOUNT_PRECISION, INVOICE_AMOUNT_SCALE);
  }

  public static boolean isValidInvoiceConversionRate(BigDecimal value) {
    return isPositiveOracleNumber(
        value, INVOICE_CONVERSION_RATE_PRECISION, INVOICE_CONVERSION_RATE_SCALE);
  }

  private static boolean isPositiveOracleNumber(BigDecimal value, int precision, int scale) {
    if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
      return false;
    }
    BigDecimal rounded = value.setScale(scale, RoundingMode.HALF_UP);
    BigDecimal maximum =
        BigDecimal.TEN.pow(precision - scale).subtract(BigDecimal.ONE.movePointLeft(scale));
    return rounded.compareTo(maximum) <= 0;
  }
}

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

  public static BigDecimal roundInvoiceAmountForStorage(BigDecimal value) {
    return roundForStorage(value, INVOICE_AMOUNT_SCALE);
  }

  public static BigDecimal roundInvoiceConversionRateForStorage(BigDecimal value) {
    return roundForStorage(value, INVOICE_CONVERSION_RATE_SCALE);
  }

  private static boolean isPositiveOracleNumber(BigDecimal value, int precision, int scale) {
    if (value == null || value.signum() <= 0) {
      return false;
    }
    long integerDigits = (long) value.precision() - value.scale();
    int maximumIntegerDigits = precision - scale;
    if (integerDigits > maximumIntegerDigits) {
      return false;
    }
    if (integerDigits < maximumIntegerDigits
        && (value.scale() <= scale || integerDigits < -(long) scale)) {
      return true;
    }

    BigDecimal rounded;
    try {
      rounded = roundForStorage(value, scale);
    } catch (ArithmeticException exception) {
      return false;
    }
    if (integerDigits < maximumIntegerDigits) {
      return true;
    }
    BigDecimal maximum =
        BigDecimal.TEN.pow(maximumIntegerDigits).subtract(BigDecimal.ONE.movePointLeft(scale));
    return rounded.compareTo(maximum) <= 0;
  }

  private static BigDecimal roundForStorage(BigDecimal value, int scale) {
    if (value == null) {
      return null;
    }
    long integerDigits = (long) value.precision() - value.scale();
    if (value.signum() == 0 || integerDigits < -(long) scale) {
      return BigDecimal.ZERO.setScale(scale);
    }
    return value.setScale(scale, RoundingMode.HALF_UP);
  }
}

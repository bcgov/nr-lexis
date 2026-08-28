package ca.bc.gov.mof.lexis.util;

import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

public final class LegacyOfferVolume {

  private LegacyOfferVolume() {}

  public static String formatForDisplay(double value) {
    DecimalFormat formatter =
        new DecimalFormat("0.0", DecimalFormatSymbols.getInstance(Locale.ROOT));
    formatter.setRoundingMode(RoundingMode.HALF_EVEN);
    return formatter.format(value);
  }

  public static double roundForDisplay(double value) {
    return Double.parseDouble(formatForDisplay(value));
  }
}

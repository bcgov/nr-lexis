package ca.bc.gov.mof.lexis.service.rtm;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

final class RtmEmsLogAmvValueValidator {

  private static final BigDecimal MAX_AMV_VALUE = new BigDecimal("9999.99");
  private static final int MAX_AMV_VALUE_SCALE = 2;

  private RtmEmsLogAmvValueValidator() {}

  static List<String> validate(BigDecimal value) {
    List<String> errors = new ArrayList<>();
    if (value == null) {
      errors.add("New value is required.");
      return errors;
    }

    if (value.signum() < 0) {
      errors.add("New value must be greater than or equal to zero.");
    }
    if (value.scale() > MAX_AMV_VALUE_SCALE) {
      errors.add("New value must have no more than 2 decimal places.");
    }
    if (value.compareTo(MAX_AMV_VALUE) > 0) {
      errors.add("New value must not exceed 9999.99.");
    }
    return errors;
  }
}

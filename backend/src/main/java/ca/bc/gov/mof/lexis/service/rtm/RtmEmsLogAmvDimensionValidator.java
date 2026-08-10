package ca.bc.gov.mof.lexis.service.rtm;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Authoritative API validation for the physical EMS_LOG_AMV key dimensions. */
final class RtmEmsLogAmvDimensionValidator {

  static final LocalDate EXPANDED_GRADE_START = LocalDate.of(2006, 4, 1);
  static final Set<String> SUPPORTED_GRADES =
      Set.of(
          "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
          "U", "W", "X", "Y", "Z", "1", "2", "3", "4", "5", "6", "BLANK");
  static final Set<String> MODERN_GRID_GRADES =
      Set.of(
          "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
          "U", "X", "Y", "Z", "1", "2", "3", "4", "5", "6", "BLANK");
  private static final Set<String> EXPANDED_GRADES = Set.of("W", "Z", "1", "2");

  private RtmEmsLogAmvDimensionValidator() {}

  static List<String> validate(
      String species, String grade, String growthIndicator, LocalDate effectiveDate) {
    List<String> errors = new ArrayList<>();

    String normalizedSpecies = normalize(species);
    if (normalizedSpecies == null) {
      errors.add("Species is required.");
    } else if (!normalizedSpecies.matches("[A-Z0-9]{2}")) {
      errors.add("Species must be exactly two alphanumeric characters.");
    }

    String normalizedGrade = normalize(grade);
    if (normalizedGrade == null) {
      errors.add("Grade is required.");
    } else if (!SUPPORTED_GRADES.contains(normalizedGrade)) {
      errors.add("Grade is not supported by the RTM AMV contract.");
    } else if (effectiveDate != null
        && effectiveDate.isBefore(EXPANDED_GRADE_START)
        && EXPANDED_GRADES.contains(normalizedGrade)) {
      errors.add("Grade %s is not available before April 2006.".formatted(normalizedGrade));
    }

    String normalizedGrowth = normalize(growthIndicator);
    if (normalizedGrowth == null) {
      errors.add("Growth indicator is required.");
    } else if (!Set.of("O", "S").contains(normalizedGrowth)) {
      errors.add("Growth indicator must be O or S.");
    }

    return List.copyOf(errors);
  }

  static List<String> validateModernGrid(String species, String grade, String growthIndicator) {
    List<String> errors = new ArrayList<>(validate(species, grade, growthIndicator, null));
    String normalizedGrade = normalize(grade);
    if (normalizedGrade != null && !MODERN_GRID_GRADES.contains(normalizedGrade)) {
      errors.add("Grade is not supported by the modern RTM AMV grid.");
    }
    return List.copyOf(errors);
  }

  static String normalize(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }
}

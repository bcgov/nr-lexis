package ca.bc.gov.mof.lexis.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** Shared, source-independent validation for application and permit scale mutations. */
public final class ScaleDomainValidator {

  public static final long MAX_SCALE_PIECES = 999_999_999L;
  public static final BigDecimal MAX_SCALE_VOLUME = new BigDecimal("99999.9");

  private ScaleDomainValidator() {}

  public static List<String> validateNumericValues(
      Long pieces, Double volume, boolean requirePositive) {
    return validateNumericValues(pieces, volume, requirePositive, MAX_SCALE_PIECES);
  }

  public static List<String> validateNumericValues(
      Long pieces, Double volume, boolean requirePositive, long maximumPieces) {
    List<String> errors = new ArrayList<>();
    long minimumPieces = requirePositive ? 1L : 0L;
    double minimumVolume = requirePositive ? Double.MIN_VALUE : 0.0d;

    if (pieces == null || pieces < minimumPieces) {
      errors.add(
          requirePositive
              ? "A valid pieces count is required."
              : "The scale pieces must be greater than or equal to 0.");
    } else if (pieces > maximumPieces) {
      errors.add(
          maximumPieces == MAX_SCALE_PIECES
              ? "The scale pieces must be less than 999999999."
              : "The scale pieces must be less than or equal to " + maximumPieces + ".");
    }

    if (volume == null || !Double.isFinite(volume) || volume < minimumVolume) {
      errors.add(
          requirePositive
              ? "A valid scale volume is required."
              : "The scale volume must be greater than or equal to 0.");
    } else if (BigDecimal.valueOf(volume).compareTo(MAX_SCALE_VOLUME) > 0) {
      errors.add("The scale volume must be less than 99999.9.");
    }
    return errors;
  }

  public static boolean containsCombination(
      Collection<ScaleValues> existingScales, ScaleValues candidate) {
    if (existingScales == null || candidate == null) {
      return false;
    }
    return existingScales.stream().anyMatch(existing -> sameCombination(existing, candidate));
  }

  public static long totalPieces(Collection<ScaleValues> scales) {
    if (scales == null) {
      return 0L;
    }
    return scales.stream()
        .map(ScaleValues::pieces)
        .filter(value -> value != null)
        .mapToLong(Long::longValue)
        .sum();
  }

  public static BigDecimal totalVolume(Collection<ScaleValues> scales) {
    if (scales == null) {
      return BigDecimal.ZERO;
    }
    return scales.stream()
        .map(ScaleValues::volume)
        .filter(value -> value != null && Double.isFinite(value))
        .map(BigDecimal::valueOf)
        .reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  public static boolean exceedsPieces(
      Collection<ScaleValues> existingScales, Long candidatePieces, Long limit) {
    if (candidatePieces == null || limit == null) {
      return true;
    }
    try {
      return Math.addExact(totalPieces(existingScales), candidatePieces) > limit;
    } catch (ArithmeticException ex) {
      return true;
    }
  }

  public static boolean exceedsVolume(
      Collection<ScaleValues> existingScales, Double candidateVolume, Double limit) {
    if (candidateVolume == null
        || !Double.isFinite(candidateVolume)
        || limit == null
        || !Double.isFinite(limit)) {
      return true;
    }
    return totalVolume(existingScales)
            .add(BigDecimal.valueOf(candidateVolume))
            .compareTo(BigDecimal.valueOf(limit))
        > 0;
  }

  private static boolean sameCombination(ScaleValues left, ScaleValues right) {
    return equalsCode(left.timberMark(), right.timberMark())
        && equalsCode(left.speciesCode(), right.speciesCode())
        && equalsCode(left.gradeCode(), right.gradeCode());
  }

  private static boolean equalsCode(String left, String right) {
    if (left == null || right == null) {
      return left == null && right == null;
    }
    return left.trim().equalsIgnoreCase(right.trim());
  }

  public record ScaleValues(
      String timberMark, String speciesCode, String gradeCode, Long pieces, Double volume) {}
}

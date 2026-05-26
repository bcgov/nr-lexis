package ca.bc.gov.mof.lexis.repository.permit;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PermitRpcRepository extends OracleRepositorySupport {

  private static final String FIND_SCALE_DETAIL_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PKG(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PRM(?,?)";

  private static final String FIND_SPECIES_CODE = LEXIS_CODES_PACKAGE + "FIND_SPECIES_CODE(?,?)";
  private static final String FIND_GRADE_CODE = LEXIS_CODES_PACKAGE + "FIND_GRADE_CODE(?,?)";
  private static final String FIND_GROWTH_TYPE_CODE = LEXIS_CODES_PACKAGE + "FIND_GROWTH_TYPE_CODE(?,?)";

  public PermitRpcRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<PermitScaleDetailRow> findScaleDetailsByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PERMIT,
        cs -> cs.setString(1, permitNumber.toString()),
        2,
        rs ->
            new PermitScaleDetailRow(
                getString(rs, "EXPORT_SCALE_DETAIL_ID"),
                getString(rs, "TIMBER_MARK"),
                getString(rs, "EXPORT_SPECIES_CODE"),
                getString(rs, "EXPORT_GRADE_CODE"),
                coalesce(getDouble(rs, "SPECIES_GRADE_VOLUME"), 0.0d),
                coalesce(getLong(rs, "PIECES_COUNT"), 0L),
                getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "CASCADE_SPLIT_CODE"),
                getString(rs, "EWB"),
                getString(rs, "FIL"),
                getString(rs, "MF")));
  }

  public List<PermitScaleDetailRow> findScaleDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PACKAGE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PermitScaleDetailRow(
                getString(rs, "EXPORT_SCALE_DETAIL_ID"),
                getString(rs, "TIMBER_MARK"),
                getString(rs, "EXPORT_SPECIES_CODE"),
                getString(rs, "EXPORT_GRADE_CODE"),
                coalesce(getDouble(rs, "SPECIES_GRADE_VOLUME"), 0.0d),
                coalesce(getLong(rs, "PIECES_COUNT"), 0L),
                getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "CASCADE_SPLIT_CODE"),
                getString(rs, "EWB"),
                getString(rs, "FIL"),
                getString(rs, "MF")));
  }

  public Optional<String> findSpeciesDescription(String speciesCode) {
    return findCodeDescription(FIND_SPECIES_CODE, speciesCode);
  }

  public Optional<String> findGradeDescription(String gradeCode) {
    return findCodeDescription(FIND_GRADE_CODE, gradeCode);
  }

  public Optional<String> findGrowthTypeDescription(String growthTypeCode) {
    return findCodeDescription(FIND_GROWTH_TYPE_CODE, growthTypeCode);
  }

  private Optional<String> findCodeDescription(String procedureSignature, String code) {
    String normalized = trim(code);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
            procedureSignature,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(rs.getString(2)))
        .filter(value -> value != null && !value.isBlank());
  }

  private double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  private long coalesce(Long value, long fallback) {
    return value == null ? fallback : value;
  }

  public record PermitScaleDetailRow(
      String exportScaleDetailId,
      String timberMark,
      String exportSpeciesCode,
      String exportGradeCode,
      double speciesGradeVolume,
      long piecesCount,
      String exportPermitDetailNumber,
      String packageNumber,
      String cascadeSplitCode,
      String ewb,
      String fil,
      String mf) {}
}

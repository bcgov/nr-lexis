package ca.bc.gov.mof.lexis.repository.permit;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PermitRpcRepository extends OracleRepositorySupport {

  private static final String FIND_SCALE_DETAIL_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PKG(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PRM(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_ID(?,?)";
  private static final String FIND_EXEMPTION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTION_BY_NUMBER(?,?)";
  private static final String IS_APP_UNMANU = LEXIS_GROUP_5_PACKAGE + "IS_APP_UMANU(?,?)";
  private static final String GET_POLICY_FACTOR = LEXIS_GROUP_5_PACKAGE + "GET_POLICY_FACTOR(?,?,?)";

  private static final String FIND_SPECIES_CODE = LEXIS_CODES_PACKAGE + "FIND_SPECIES_CODE(?,?)";
  private static final String FIND_GRADE_CODE = LEXIS_CODES_PACKAGE + "FIND_GRADE_CODE(?,?)";
  private static final String FIND_GROWTH_TYPE_CODE = LEXIS_CODES_PACKAGE + "FIND_GROWTH_TYPE_CODE(?,?)";
  private static final String FIND_RATE_BY_EXEMPTION = LEXIS_CODES_PACKAGE + "FIND_RATE_BY_EXEMPTION(?,?)";
  private static final String FIND_LOG_AMV_BY_SCALE = LEXIS_CODES_PACKAGE + "FIND_LOG_AMV(?,?)";

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
                getLong(rs, "APPLICATION_NUMBER"),
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
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "CASCADE_SPLIT_CODE"),
                getString(rs, "EWB"),
                getString(rs, "FIL"),
                getString(rs, "MF")));
  }

  public Optional<PermitPolicyContextRow> findPermitPolicyContextByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PERMIT_DETAIL_BY_ID,
        cs -> cs.setString(1, permitNumber.toString()),
        2,
        rs ->
            new PermitPolicyContextRow(
                getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getLong(rs, "ORG_UNIT_NO"),
                getLocalDate(rs, "APPLICATION_DATE"),
                getString(rs, "EXEMPTION_NUMBER"),
                getString(rs, "EXPORT_COUNTRY_CODE"),
                coalesce(getDouble(rs, "OVERRIDE_FEE"), 0.0d)));
  }

  public Optional<String> findExemptionTypeCode(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
            FIND_EXEMPTION_BY_NUMBER,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(rs.getString("EXPORT_EXEMPTION_TYPE_CODE")))
        .filter(value -> value != null && !value.isBlank());
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

  public Optional<BigDecimal> findFixedExemptionRate(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_RATE_BY_EXEMPTION,
        cs -> cs.setString(1, normalized),
        2,
        rs -> {
          Double rate = getDouble(rs, "FIXED_EXEMPTION_RATE");
          if (rate == null) {
            return null;
          }
          return BigDecimal.valueOf(rate);
        });
  }

  public BigDecimal findFeePolicyPercentIncrease(LocalDate applicationDate, Long orgUnitNo) {
    if (applicationDate == null || orgUnitNo == null || orgUnitNo < 1) {
      return BigDecimal.ZERO;
    }

    return queryCursorSingle(
            GET_POLICY_FACTOR,
            cs -> {
              cs.setDate(1, java.sql.Date.valueOf(applicationDate));
              cs.setLong(2, orgUnitNo);
            },
            3,
            rs -> {
              String percent = trim(rs.getString("PERCENT_INCREASE"));
              if (percent == null) {
                return BigDecimal.ZERO;
              }
              try {
                return new BigDecimal(percent);
              } catch (NumberFormatException ex) {
                return BigDecimal.ZERO;
              }
            })
        .orElse(BigDecimal.ZERO);
  }

  public Optional<BigDecimal> findAverageMarketValueByScaleId(String scaleDetailId) {
    String normalized = trim(scaleDetailId);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_LOG_AMV_BY_SCALE,
        cs -> cs.setString(1, normalized),
        2,
        rs -> {
          Double amv = getDouble(rs, "AVERAGE_MARKET_PRICE");
          if (amv == null) {
            return null;
          }
          return BigDecimal.valueOf(amv);
        });
  }

  public boolean isApplicationUnmanufactured(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }

    String call = "{ call " + IS_APP_UNMANU + " }";
    try {
      Long count =
          jdbcTemplate.execute(
              call,
              (CallableStatementCallback<Long>)
                  cs -> {
                    cs.setString(1, applicationNumber.toString());
                    cs.registerOutParameter(2, Types.REF_CURSOR);
                    cs.execute();
                    try (var rs = (java.sql.ResultSet) cs.getObject(2)) {
                      if (rs == null || !rs.next()) {
                        return 0L;
                      }
                      Long resultsCount = getLong(rs, "RESULTS_COUNT");
                      return resultsCount == null ? 0L : resultsCount;
                    }
                  });
      return count != null && count > 0;
    } catch (DataAccessException ex) {
      logger.warn("Oracle procedure call failed [{}]: {}", IS_APP_UNMANU, ex.getMessage());
      return false;
    }
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
      Long applicationNumber,
      String exportPermitDetailNumber,
      String packageNumber,
      String cascadeSplitCode,
      String ewb,
      String fil,
      String mf) {}

  public record PermitPolicyContextRow(
      Long permitNumber,
      Long orgUnitNo,
      LocalDate applicationDate,
      String exemptionNumber,
      String exportCountryCode,
      double overrideFee) {}
}

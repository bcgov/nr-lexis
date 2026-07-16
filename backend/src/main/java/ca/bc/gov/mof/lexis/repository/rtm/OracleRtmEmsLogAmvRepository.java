package ca.bc.gov.mof.lexis.repository.rtm;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class OracleRtmEmsLogAmvRepository extends OracleRepositorySupport {

  private static final String INSERT_PROCEDURE =
      "RTM_EMS_LOG_AMV_INSERT(?,?,?,?,?,?)";
  private static final String UPDATE_PROCEDURE =
      "RTM_EMS_LOG_AMV_UPDATE(?,?,?,?,?,?,?)";
  private static final String SELECT_PROCEDURE =
      "RTM_EMS_LOG_AMV_SELECT(?,?,?,?,?,?)";
  private static final String BLANK_GRADE_SENTINEL = "BLANK";

  public OracleRtmEmsLogAmvRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<RtmEmsLogAmvRowDto> find(
      String species,
      String growthIndicator,
      LocalDate retrievalDate,
      LocalDate updateDate) {
    List<RtmEmsLogAmvRowDto> rows = executeFind(species, growthIndicator, retrievalDate, updateDate);
    if (rows.isEmpty() && updateDate != null && updateDate.equals(retrievalDate)) {
      return executeFind(species, growthIndicator, retrievalDate, null);
    }
    return rows;
  }

  /**
   * Loads the current table state when the caller has not supplied both of the legacy procedure
   * filters. RTM_EMS_LOG_AMV_SELECT requires exact species and growth-code values, so passing
   * null for either filter cannot produce a usable matrix.
   *
   * An empty list is a successful query with no values for the requested date. Failure to read
   * both the public synonym and the THE schema table is surfaced as an authoritative data-source
   * outage.
   */
  public List<RtmEmsLogAmvRowDto> findEffectiveDateRows(
      String species, String growthIndicator, LocalDate effectiveDate) {
    if (effectiveDate == null) {
      return List.of();
    }

    try {
      return queryEffectiveDateRows("EMS_LOG_AMV", species, growthIndicator, effectiveDate);
    } catch (DataAccessException synonymFailure) {
      try {
        return queryEffectiveDateRows(
            "THE.EMS_LOG_AMV", species, growthIndicator, effectiveDate);
      } catch (DataAccessException schemaFailure) {
        throw authoritativeReadFailure(
            "find_effective_date", synonymFailure, schemaFailure);
      }
    }
  }

  public List<RtmEmsLogAmvRowDto> findLatestEffectiveDateRowsBefore(LocalDate effectiveDate) {
    if (effectiveDate == null) {
      return List.of();
    }

    try {
      return queryLatestEffectiveDateRowsBefore("EMS_LOG_AMV", effectiveDate);
    } catch (DataAccessException synonymFailure) {
      try {
        return queryLatestEffectiveDateRowsBefore("THE.EMS_LOG_AMV", effectiveDate);
      } catch (DataAccessException schemaFailure) {
        throw authoritativeReadFailure(
            "find_latest_effective_date", synonymFailure, schemaFailure);
      }
    }
  }

  public boolean existsExact(
      String species,
      String grade,
      String growthIndicator,
      LocalDate effectiveDate) {
    if (effectiveDate == null) {
      return false;
    }

    try {
      return exactlyOne(
          countExact("EMS_LOG_AMV", species, grade, growthIndicator, effectiveDate));
    } catch (DataAccessException synonymFailure) {
      try {
        return exactlyOne(
            countExact("THE.EMS_LOG_AMV", species, grade, growthIndicator, effectiveDate));
      } catch (DataAccessException schemaFailure) {
        throw authoritativeReadFailure(
            "verify_row_existence", synonymFailure, schemaFailure);
      }
    }
  }

  public boolean hasExactValue(
      String species,
      String grade,
      String growthIndicator,
      LocalDate effectiveDate,
      BigDecimal expectedValue) {
    if (effectiveDate == null || expectedValue == null) {
      return false;
    }

    try {
      return hasExactValue(
          "EMS_LOG_AMV", species, grade, growthIndicator, effectiveDate, expectedValue);
    } catch (DataAccessException synonymFailure) {
      try {
        return hasExactValue(
            "THE.EMS_LOG_AMV", species, grade, growthIndicator, effectiveDate, expectedValue);
      } catch (DataAccessException schemaFailure) {
        throw authoritativeReadFailure("verify_saved_value", synonymFailure, schemaFailure);
      }
    }
  }

  private Integer countExact(
      String tableName,
      String species,
      String grade,
      String growthIndicator,
      LocalDate effectiveDate) {
    return jdbcTemplate.queryForObject(
        """
        SELECT COUNT(*)
        FROM %s
        WHERE SPECIES = UPPER(?)
          AND GRADE = UPPER(?)
          AND GROWTH_TYPE_ST = UPPER(?)
          AND EFFECTIVE_DATE = ?
        """.formatted(tableName),
        Integer.class,
        trim(species),
        gradeForOracle(grade),
        trim(growthIndicator),
        java.sql.Date.valueOf(effectiveDate));
  }

  private Boolean hasExactValue(
      String tableName,
      String species,
      String grade,
      String growthIndicator,
      LocalDate effectiveDate,
      BigDecimal expectedValue) {
    List<BigDecimal> values =
        jdbcTemplate.queryForList(
            """
            SELECT AVG_MARKET_PRICE
            FROM %s
            WHERE SPECIES = UPPER(?)
              AND GRADE = UPPER(?)
              AND GROWTH_TYPE_ST = UPPER(?)
              AND EFFECTIVE_DATE = ?
            """.formatted(tableName),
            BigDecimal.class,
            trim(species),
            gradeForOracle(grade),
            trim(growthIndicator),
            java.sql.Date.valueOf(effectiveDate));
    return values != null
        && values.size() == 1
        && values.get(0) != null
        && values.get(0).compareTo(expectedValue) == 0;
  }

  private boolean exactlyOne(Integer count) {
    return count != null && count == 1;
  }

  private DataAccessResourceFailureException authoritativeReadFailure(
      String operation, RuntimeException synonymFailure, RuntimeException schemaFailure) {
    logger.warn(
        "event=lexis_rtm_amv operation={} outcome=database_unavailable failureType={}",
        operation,
        exceptionType(schemaFailure));
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException(
            "Authoritative RTM AMV data is temporarily unavailable.",
            synonymFailure);
    failure.addSuppressed(schemaFailure);
    return failure;
  }

  private List<RtmEmsLogAmvRowDto> queryEffectiveDateRows(
      String tableName, String species, String growthIndicator, LocalDate effectiveDate) {
    StringBuilder query =
        new StringBuilder(
            """
            SELECT SPECIES,
                   DECODE(GRADE, ' ', 'BLANK', GRADE),
                   GROWTH_TYPE_ST,
                   EFFECTIVE_DATE,
                   EFFECTIVE_DATE,
                   AVG_MARKET_PRICE,
                   AVG_MARKET_PRICE
            FROM %s
            WHERE EFFECTIVE_DATE >= ?
              AND EFFECTIVE_DATE < ?
            """.formatted(tableName));
    List<Object> parameters = new ArrayList<>();
    parameters.add(java.sql.Date.valueOf(effectiveDate));
    parameters.add(java.sql.Date.valueOf(effectiveDate.plusDays(1)));

    String normalizedSpecies = trim(species);
    if (normalizedSpecies != null) {
      query.append(" AND SPECIES = UPPER(?)");
      parameters.add(normalizedSpecies);
    }

    String normalizedGrowthIndicator = trim(growthIndicator);
    if (normalizedGrowthIndicator != null) {
      query.append(" AND GROWTH_TYPE_ST = UPPER(?)");
      parameters.add(normalizedGrowthIndicator);
    }

    query.append(" ORDER BY GRADE, SPECIES, GROWTH_TYPE_ST");
    return jdbcTemplate.query(
        query.toString(),
        (rs, rowNumber) ->
            new RtmEmsLogAmvRowDto(
                getString(rs, 1),
                getString(rs, 2),
                getString(rs, 3),
                formatDateValue(toLocalDate(rs.getDate(4))),
                formatDateValue(toLocalDate(rs.getDate(5))),
                asBigDecimal(rs, 6),
                asBigDecimal(rs, 7),
                "0"),
        parameters.toArray());
  }

  private List<RtmEmsLogAmvRowDto> queryLatestEffectiveDateRowsBefore(
      String tableName, LocalDate effectiveDate) {
    String query =
        """
        WITH RANKED_VALUES AS (
          SELECT SPECIES,
                 GRADE,
                 GROWTH_TYPE_ST,
                 EFFECTIVE_DATE,
                 AVG_MARKET_PRICE,
                 ROW_NUMBER() OVER (
                   PARTITION BY SPECIES, GRADE, GROWTH_TYPE_ST
                   ORDER BY EFFECTIVE_DATE DESC
                 ) AS VALUE_RANK
          FROM %s
          WHERE EFFECTIVE_DATE < ?
        )
        SELECT SPECIES,
               DECODE(GRADE, ' ', 'BLANK', GRADE),
               GROWTH_TYPE_ST,
               EFFECTIVE_DATE,
               EFFECTIVE_DATE,
               AVG_MARKET_PRICE,
               AVG_MARKET_PRICE
        FROM RANKED_VALUES
        WHERE VALUE_RANK = 1
        ORDER BY GRADE, SPECIES, GROWTH_TYPE_ST
        """.formatted(tableName);

    return jdbcTemplate.query(
        query,
        (rs, rowNumber) ->
            new RtmEmsLogAmvRowDto(
                getString(rs, 1),
                getString(rs, 2),
                getString(rs, 3),
                formatDateValue(toLocalDate(rs.getDate(4))),
                formatDateValue(toLocalDate(rs.getDate(5))),
                asBigDecimal(rs, 6),
                asBigDecimal(rs, 7),
                "0"),
        java.sql.Date.valueOf(effectiveDate));
  }

  private List<RtmEmsLogAmvRowDto> executeFind(
      String species,
      String growthIndicator,
      LocalDate retrievalDate,
      LocalDate updateDate) {
    try {
      String call = "{ call " + SELECT_PROCEDURE + " }";
      List<RtmEmsLogAmvRowDto> rows =
          jdbcTemplate.execute(
              call,
              (CallableStatement cs) -> {
                cs.registerOutParameter(1, Types.VARCHAR);
                cs.registerOutParameter(2, Types.REF_CURSOR);
                cs.setString(3, trim(species));
                cs.setString(4, trim(growthIndicator));
                bindDateOrNull(cs, 5, retrievalDate);
                bindDateOrNull(cs, 6, updateDate);
                cs.execute();

                String returnCode = trim(cs.getString(1));

                try (ResultSet rs = (ResultSet) cs.getObject(2)) {
                  return mapResults(rs, returnCode);
                }
              });
      if (rows == null) {
        throw new DataAccessResourceFailureException(
            "The RTM AMV procedure returned no result contract.");
      }
      return rows;
    } catch (RuntimeException ex) {
      throw procedureFailure("find", ex);
    }
  }

  public String insert(
      String species,
      String grade,
      String growthIndicator,
      LocalDate retrievalDate,
      BigDecimal newValue) {
    String call = "{ call " + INSERT_PROCEDURE + " }";
    return executeMutation("insert", call, (cs) -> {
      cs.registerOutParameter(1, Types.VARCHAR);
      cs.setString(2, trim(species));
      cs.setString(3, gradeForOracle(grade));
      cs.setString(4, trim(growthIndicator));
      bindDateOrNull(cs, 5, retrievalDate);
      if (newValue == null) {
        cs.setNull(6, Types.NUMERIC);
      } else {
        cs.setBigDecimal(6, newValue);
      }
    });
  }

  public String update(
      String species,
      String grade,
      String growthIndicator,
      LocalDate retrievalDate,
      LocalDate updateDate,
      BigDecimal newValue) {
    String call = "{ call " + UPDATE_PROCEDURE + " }";
    return executeMutation("update", call, (cs) -> {
      cs.registerOutParameter(1, Types.VARCHAR);
      cs.setString(2, trim(species));
      cs.setString(3, gradeForOracle(grade));
      cs.setString(4, trim(growthIndicator));
      bindDateOrNull(cs, 5, retrievalDate);
      bindDateOrNull(cs, 6, updateDate);
      if (newValue == null) {
        cs.setNull(7, Types.NUMERIC);
      } else {
        cs.setBigDecimal(7, newValue);
      }
    });
  }

  private String executeMutation(String operation, String call, ProcedureCallback callback) {
    try {
      return jdbcTemplate.execute(
          call,
          (CallableStatementCallback<String>) (CallableStatement cs) -> {
            callback.accept(cs);
            cs.execute();
            return trim(cs.getString(1));
          });
    } catch (RuntimeException ex) {
      throw procedureFailure(operation, ex);
    }
  }

  private DataAccessResourceFailureException procedureFailure(
      String operation, RuntimeException cause) {
    logger.warn(
        "event=lexis_rtm_amv operation={} outcome=database_unavailable failureType={}",
        operation,
        exceptionType(cause));
    return new DataAccessResourceFailureException(
        "The RTM AMV database operation is temporarily unavailable.", cause);
  }

  private interface ProcedureCallback {
    void accept(java.sql.CallableStatement cs) throws SQLException;
  }

  private void bindDateOrNull(CallableStatement cs, int index, LocalDate value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.DATE);
    } else {
      cs.setDate(index, java.sql.Date.valueOf(value));
    }
  }

  private BigDecimal asBigDecimal(ResultSet rs, int index) throws SQLException {
    return rs.getBigDecimal(index);
  }

  private List<RtmEmsLogAmvRowDto> mapResults(ResultSet rs, String returnCode) throws SQLException {
    List<RtmEmsLogAmvRowDto> rows = new ArrayList<>();
    if (rs == null) {
      throw new SQLException("RTM AMV procedure did not return its required cursor.");
    }

    while (rs.next()) {
      rows.add(
          new RtmEmsLogAmvRowDto(
              getString(rs, 1),
              gradeForApi(rs.getString(2)),
              getString(rs, 3),
              formatDateValue(toLocalDate(rs.getDate(4))),
              formatDateValue(toLocalDate(rs.getDate(5))),
              asBigDecimal(rs, 6),
              asBigDecimal(rs, 7),
              returnCode));
    }

    return rows;
  }

  private String getString(ResultSet rs, int index) throws SQLException {
    String value = rs.getString(index);
    return value == null ? null : value.trim();
  }

  private String gradeForOracle(String grade) {
    String normalizedGrade = trim(grade);
    return BLANK_GRADE_SENTINEL.equalsIgnoreCase(normalizedGrade) ? " " : normalizedGrade;
  }

  private String gradeForApi(String grade) {
    if (grade == null) {
      return null;
    }
    String normalizedGrade = grade.trim();
    return normalizedGrade.isEmpty() ? BLANK_GRADE_SENTINEL : normalizedGrade;
  }

  private String formatDateValue(LocalDate value) {
    return value == null ? null : value.toString();
  }
}

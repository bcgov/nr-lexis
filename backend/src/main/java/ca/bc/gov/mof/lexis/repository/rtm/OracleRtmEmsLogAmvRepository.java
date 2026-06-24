package ca.bc.gov.mof.lexis.repository.rtm;

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

  public OracleRtmEmsLogAmvRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<RtmEmsLogAmvRowDto> find(
      String species,
      String growthIndicator,
      LocalDate retrievalDate,
      LocalDate updateDate) {
    try {
      String call = "{ call " + SELECT_PROCEDURE + " }";
      return jdbcTemplate.execute(
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
    } catch (Exception ex) {
      logger.warn("RTM AMV select failed: {}", ex.getMessage());
      return List.of();
    }
  }

  public String insert(
      String species,
      String grade,
      String growthIndicator,
      LocalDate retrievalDate,
      BigDecimal newValue) {
    String call = "{ call " + INSERT_PROCEDURE + " }";
    return executeMutation(call, (cs) -> {
      cs.registerOutParameter(1, Types.VARCHAR);
      cs.setString(2, trim(species));
      cs.setString(3, trim(grade));
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
    return executeMutation(call, (cs) -> {
      cs.registerOutParameter(1, Types.VARCHAR);
      cs.setString(2, trim(species));
      cs.setString(3, trim(grade));
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

  private String executeMutation(
      String call,
      ProcedureCallback callback) {
    try {
      return jdbcTemplate.execute(
          call,
          (CallableStatementCallback<String>) (CallableStatement cs) -> {
            callback.accept(cs);
            cs.execute();
            return trim(cs.getString(1));
          });
    } catch (Exception ex) {
      logger.warn("RTM AMV procedure execution failed [{}]: {}", call, ex.getMessage());
      return "EXCEPTION";
    }
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

  private BigDecimal asBigDecimal(ResultSet rs, int index) {
    try {
      return rs.getBigDecimal(index);
    } catch (SQLException ex) {
      return null;
    }
  }

  private List<RtmEmsLogAmvRowDto> mapResults(ResultSet rs, String returnCode) {
    List<RtmEmsLogAmvRowDto> rows = new ArrayList<>();
    if (rs == null) {
      return rows;
    }

    try {
      while (rs.next()) {
        rows.add(
            new RtmEmsLogAmvRowDto(
                getString(rs, 1),
                getString(rs, 2),
                getString(rs, 3),
                formatDateValue(toLocalDate(rs.getDate(4))),
                formatDateValue(toLocalDate(rs.getDate(5))),
                asBigDecimal(rs, 6),
                asBigDecimal(rs, 7),
                returnCode));
      }
    } catch (SQLException ignored) {
      // Let method return accumulated rows when cursor read fails.
    }

    return rows;
  }

  private String getString(ResultSet rs, int index) {
    try {
      String value = rs.getString(index);
      return value == null ? null : value.trim();
    } catch (SQLException ex) {
      return null;
    }
  }

  private String formatDateValue(LocalDate value) {
    return value == null ? null : value.toString();
  }
}

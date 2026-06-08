package ca.bc.gov.mof.lexis.repository.admin;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class LexisAdminPolicyRepository extends OracleRepositorySupport {

  private static final String FIND_FEE_POLICIES =
      LEXIS_GROUP_12_PACKAGE + "FIND_ALL_FEE_POLICIES(?,?,?)";
  private static final String FIND_FEE_POLICY_BY_ID =
      LEXIS_GROUP_12_PACKAGE + "FIND_FEE_POLICY_BY_ID(?,?)";
  private static final String FIND_FEE_POLICY = LEXIS_GROUP_12_PACKAGE + "FIND_FEE_POLICY(?,?,?)";
  private static final String UPDATE_FEE_POLICY = LEXIS_GROUP_12_PACKAGE + "UPDATE_FEE_POLICY(?,?,?,?,?)";
  private static final String INSERT_FEE_POLICY = LEXIS_GROUP_12_PACKAGE + "INSERT_FEE_POLICY(?,?,?,?,?)";
  private static final String DELETE_FEE_POLICY = LEXIS_GROUP_12_PACKAGE + "DELETE_FEE_POLICY(?)";
  private static final String COUNT_FEE_POLICIES = LEXIS_GROUP_12_PACKAGE + "COUNT_FEE_POLICIES(?)";

  private static final String FIND_FIL_POLICIES =
      LEXIS_GROUP_12_PACKAGE + "FIND_ALL_FIL_POLICIES(?,?,?)";
  private static final String FIND_FIL_POLICY_BY_ID =
      LEXIS_GROUP_12_PACKAGE + "FIND_FIL_POLICY_BY_ID(?,?)";
  private static final String FIND_FIL_POLICY = LEXIS_GROUP_12_PACKAGE + "FIND_FIL_POLICY(?,?)";
  private static final String UPDATE_FIL_POLICY = LEXIS_GROUP_12_PACKAGE + "UPDATE_FIL_POLICY(?,?,?,?)";
  private static final String INSERT_FIL_POLICY = LEXIS_GROUP_12_PACKAGE + "INSERT_FIL_POLICY(?,?,?,?)";
  private static final String DELETE_FIL_POLICY = LEXIS_GROUP_12_PACKAGE + "DELETE_FIL_POLICY(?)";
  private static final String COUNT_FIL_POLICIES = LEXIS_GROUP_12_PACKAGE + "COUNT_FIL_POLICIES(?)";

  private static final String FIND_ORG_UNIT_BY_NUMBER =
      LEXIS_CODES_PACKAGE + "FIND_ORG_UNIT_BY_NUMBER(?,?)";

  public LexisAdminPolicyRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<FeePolicyRow> findFeePolicies(String sortOrder, int page) {
    String normalizedSort = trim(sortOrder);
    String effectiveSort = normalizedSort == null ? "effective_date desc" : normalizedSort;
    int normalizedPage = Math.max(0, page);

    return queryCursorProcedure(
        FIND_FEE_POLICIES,
        cs -> {
          cs.setString(1, effectiveSort);
          cs.setInt(2, normalizedPage);
        },
        3,
        this::mapFeePolicyRow);
  }

  public Optional<FeePolicyRow> findFeePolicyById(Long feePolicyId) {
    if (feePolicyId == null || feePolicyId < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_FEE_POLICY_BY_ID,
        cs -> cs.setLong(1, feePolicyId),
        2,
        this::mapFeePolicyRow);
  }

  public Optional<FeePolicyRow> findFeePolicy(LocalDate effectiveDate, Long orgUnitNo) {
    if (effectiveDate == null || orgUnitNo == null || orgUnitNo < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_FEE_POLICY,
        cs -> {
          cs.setTimestamp(1, toTimestamp(effectiveDate));
          cs.setLong(2, orgUnitNo);
        },
        3,
        this::mapFeePolicyRow);
  }

  public Optional<FeePolicyRow> insertFeePolicy(
      LocalDate effectiveDate, Long orgUnitNo, Integer percentIncrease, String entryUserId) {
    if (effectiveDate == null || orgUnitNo == null || orgUnitNo < 1 || percentIncrease == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        INSERT_FEE_POLICY,
        cs -> {
          cs.setTimestamp(1, toTimestamp(effectiveDate));
          cs.setLong(2, orgUnitNo);
          cs.setInt(3, percentIncrease);
          cs.setString(4, auditUserOrDefault(entryUserId));
        },
        5,
        this::mapFeePolicyRow);
  }

  public boolean updateFeePolicy(
      Long feePolicyId,
      LocalDate effectiveDate,
      Long orgUnitNo,
      Integer percentIncrease,
      String updateUserId) {
    if (feePolicyId == null
        || feePolicyId < 1
        || effectiveDate == null
        || orgUnitNo == null
        || orgUnitNo < 1
        || percentIncrease == null) {
      return false;
    }

    return executeProcedure(
        UPDATE_FEE_POLICY,
        cs -> {
          cs.setLong(1, feePolicyId);
          cs.setTimestamp(2, toTimestamp(effectiveDate));
          cs.setLong(3, orgUnitNo);
          cs.setInt(4, percentIncrease);
          cs.setString(5, auditUserOrDefault(updateUserId));
        });
  }

  public boolean deleteFeePolicy(Long feePolicyId) {
    if (feePolicyId == null || feePolicyId < 1) {
      return false;
    }
    return executeProcedure(DELETE_FEE_POLICY, cs -> cs.setLong(1, feePolicyId));
  }

  public long countFeePolicies() {
    return queryCursorProcedure(COUNT_FEE_POLICIES, null, 1, rs -> Integer.valueOf(1)).size();
  }

  public List<FilPolicyRow> findFilPolicies(String sortOrder, int page) {
    String normalizedSort = trim(sortOrder);
    String effectiveSort = normalizedSort == null ? "effective_date desc" : normalizedSort;
    int normalizedPage = Math.max(0, page);

    return queryCursorProcedure(
        FIND_FIL_POLICIES,
        cs -> {
          cs.setString(1, effectiveSort);
          cs.setInt(2, normalizedPage);
        },
        3,
        this::mapFilPolicyRow);
  }

  public Optional<FilPolicyRow> findFilPolicyById(Long filPolicyId) {
    if (filPolicyId == null || filPolicyId < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_FIL_POLICY_BY_ID,
        cs -> cs.setLong(1, filPolicyId),
        2,
        this::mapFilPolicyRow);
  }

  public Optional<FilPolicyRow> findFilPolicy(LocalDate effectiveDate) {
    if (effectiveDate == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_FIL_POLICY,
        cs -> cs.setTimestamp(1, toTimestamp(effectiveDate)),
        2,
        this::mapFilPolicyRow);
  }

  public Optional<FilPolicyRow> insertFilPolicy(
      LocalDate effectiveDate, Integer filPercent, String entryUserId) {
    if (effectiveDate == null || filPercent == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        INSERT_FIL_POLICY,
        cs -> {
          cs.setTimestamp(1, toTimestamp(effectiveDate));
          cs.setInt(2, filPercent);
          cs.setString(3, auditUserOrDefault(entryUserId));
        },
        4,
        this::mapFilPolicyRow);
  }

  public boolean updateFilPolicy(
      Long filPolicyId, LocalDate effectiveDate, Integer filPercent, String updateUserId) {
    if (filPolicyId == null || filPolicyId < 1 || effectiveDate == null || filPercent == null) {
      return false;
    }

    return executeProcedure(
        UPDATE_FIL_POLICY,
        cs -> {
          cs.setLong(1, filPolicyId);
          cs.setTimestamp(2, toTimestamp(effectiveDate));
          cs.setInt(3, filPercent);
          cs.setString(4, auditUserOrDefault(updateUserId));
        });
  }

  public boolean deleteFilPolicy(Long filPolicyId) {
    if (filPolicyId == null || filPolicyId < 1) {
      return false;
    }
    return executeProcedure(DELETE_FIL_POLICY, cs -> cs.setLong(1, filPolicyId));
  }

  public long countFilPolicies() {
    return queryCursorProcedure(COUNT_FIL_POLICIES, null, 1, rs -> Integer.valueOf(1)).size();
  }

  public Optional<OrgUnitRow> findOrgUnitByNumber(Long orgUnitNo) {
    if (orgUnitNo == null || orgUnitNo < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_ORG_UNIT_BY_NUMBER,
        cs -> cs.setLong(1, orgUnitNo),
        2,
        rs ->
            new OrgUnitRow(
                defaultLong(getLong(rs, "ORG_UNIT_NO"), orgUnitNo),
                defaultString(getString(rs, "ORG_UNIT_CODE")),
                defaultString(getString(rs, "ORG_UNIT_NAME"))));
  }

  private FeePolicyRow mapFeePolicyRow(java.sql.ResultSet rs) {
    return new FeePolicyRow(
        defaultLong(getLong(rs, "LEXIS_FEE_POLICY_ID"), 0L),
        getLocalDate(rs, "EFFECTIVE_DATE"),
        defaultLong(getLong(rs, "ORG_UNIT_NO"), 0L),
        defaultLong(getLong(rs, "PERCENT_INCREASE"), 0L),
        defaultString(getString(rs, "ENTRY_USERID")),
        getLocalDate(rs, "ENTRY_TIMESTAMP"),
        defaultString(getString(rs, "UPDATE_USERID")),
        getLocalDate(rs, "UPDATE_TIMESTAMP"));
  }

  private FilPolicyRow mapFilPolicyRow(java.sql.ResultSet rs) {
    return new FilPolicyRow(
        defaultLong(getLong(rs, "FEE_IN_LIEU_PERCENT_ID"), 0L),
        getLocalDate(rs, "EFFECTIVE_DATE"),
        defaultLong(getLong(rs, "FEE_IN_LIEU_PERCENT"), 0L),
        defaultString(getString(rs, "ENTRY_USERID")),
        getLocalDate(rs, "ENTRY_TIMESTAMP"),
        defaultString(getString(rs, "UPDATE_USERID")),
        getLocalDate(rs, "UPDATE_TIMESTAMP"));
  }

  private Timestamp toTimestamp(LocalDate value) {
    return value == null ? null : Timestamp.valueOf(value.atStartOfDay());
  }

  private long defaultLong(Long value, long fallback) {
    return value == null ? fallback : value;
  }

  private String defaultString(String value) {
    return value == null ? "" : value;
  }

  public record FeePolicyRow(
      long feePolicyId,
      LocalDate effectiveDate,
      long orgUnitNo,
      long percentIncrease,
      String entryUserId,
      LocalDate entryTimestamp,
      String updateUserId,
      LocalDate updateTimestamp) {}

  public record FilPolicyRow(
      long filPolicyId,
      LocalDate effectiveDate,
      long filPercent,
      String entryUserId,
      LocalDate entryTimestamp,
      String updateUserId,
      LocalDate updateTimestamp) {}

  public record OrgUnitRow(long orgUnitNo, String orgUnitCode, String orgUnitName) {}
}

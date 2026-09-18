package ca.bc.gov.mof.lexis.repository.admin;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ORG_UNIT_BY_NUMBER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository.FeePolicyRow;
import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository.FilPolicyRow;
import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository.OrgUnitRow;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | LexisAdminPolicyRepository")
class LexisAdminPolicyRepositoryTest {

  @Test
  void orgUnitLookupShouldRejectInvalidInputsWithoutQuerying() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    LexisAdminPolicyRepository repository = new LexisAdminPolicyRepository(jdbcTemplate);

    assertThat(repository.findOrgUnitByNumber(null)).isEmpty();
    assertThat(repository.findOrgUnitByNumber(0L)).isEmpty();
    assertThat(repository.findOrgUnitByNumber(-1L)).isEmpty();
    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitLookupShouldBindNumberAndUseTheFirstTrimmedRow() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L, 1904L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("ORG_UNIT_CODE")).thenReturn(" RCB ", "RKB");
    when(resultSet.getString("ORG_UNIT_NAME")).thenReturn(" Cariboo ", "Kootenay");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenAnswer(
            invocation -> {
              RowMapper<OrgUnitRow> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    LexisAdminPolicyRepository repository = new LexisAdminPolicyRepository(jdbcTemplate);

    assertThat(repository.findOrgUnitByNumber(1903L))
        .contains(new OrgUnitRow(1903L, "RCB", "Cariboo"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitLookupShouldDefaultNullNumberAndBlankDisplayValues() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(0L);
    when(resultSet.wasNull()).thenReturn(true);
    when(resultSet.getString("ORG_UNIT_CODE")).thenReturn(" ");
    when(resultSet.getString("ORG_UNIT_NAME")).thenReturn(null);
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenAnswer(
            invocation -> {
              RowMapper<OrgUnitRow> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    LexisAdminPolicyRepository repository = new LexisAdminPolicyRepository(jdbcTemplate);

    assertThat(repository.findOrgUnitByNumber(1903L)).contains(new OrgUnitRow(1903L, "", ""));
  }

  @ParameterizedTest
  @ValueSource(strings = {"ORG_UNIT_NO", "ORG_UNIT_CODE", "ORG_UNIT_NAME"})
  @SuppressWarnings("unchecked")
  void orgUnitLookupShouldPreserveOptionalColumnFailureDefaults(String column) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    SQLException failure = new SQLException("Invalid column name");
    if (column.equals("ORG_UNIT_NO")) {
      when(resultSet.getLong(column)).thenThrow(failure);
    } else {
      when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L);
      when(resultSet.wasNull()).thenReturn(false);
      when(resultSet.getString(column)).thenThrow(failure);
    }
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenAnswer(
            invocation -> {
              RowMapper<OrgUnitRow> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    LexisAdminPolicyRepository repository = new LexisAdminPolicyRepository(jdbcTemplate);

    assertThat(repository.findOrgUnitByNumber(1903L)).contains(new OrgUnitRow(1903L, "", ""));
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitLookupShouldDistinguishAbsentRowsFromQueryFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenReturn(List.of())
        .thenThrow(failure);
    LexisAdminPolicyRepository repository = new LexisAdminPolicyRepository(jdbcTemplate);

    assertThat(repository.findOrgUnitByNumber(1903L)).isEmpty();
    assertThatThrownBy(() -> repository.findOrgUnitByNumber(1903L)).isSameAs(failure);
  }

  @Test
  void feePolicyInsertShouldRequireMatchingReturnedValues() {
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    StubLexisAdminPolicyRepository repository = new StubLexisAdminPolicyRepository();
    FeePolicyRow matching =
        new FeePolicyRow(10L, effectiveDate, 1903L, 12L, "admin", null, "", null);
    repository.singleResult = Optional.of(matching);

    assertThat(repository.insertFeePolicy(effectiveDate, 1903L, 12, "idir\\admin"))
        .contains(matching);

    repository.singleResult =
        Optional.of(
            new FeePolicyRow(10L, effectiveDate, 1904L, 12L, "admin", null, "", null));
    assertThat(repository.insertFeePolicy(effectiveDate, 1903L, 12, "idir\\admin"))
        .isEmpty();
  }

  @Test
  void feeInLieuInsertShouldRequireMatchingReturnedValues() {
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    StubLexisAdminPolicyRepository repository = new StubLexisAdminPolicyRepository();
    FilPolicyRow matching =
        new FilPolicyRow(20L, effectiveDate, 15L, "admin", null, "", null);
    repository.singleResult = Optional.of(matching);

    assertThat(repository.insertFilPolicy(effectiveDate, 15, "idir\\admin"))
        .contains(matching);

    repository.singleResult =
        Optional.of(new FilPolicyRow(20L, effectiveDate, 16L, "admin", null, "", null));
    assertThat(repository.insertFilPolicy(effectiveDate, 15, "idir\\admin"))
        .isEmpty();
  }

  @Test
  void validPolicyUpdatesAndDeletesShouldReportSuccess() {
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    StubLexisAdminPolicyRepository repository = new StubLexisAdminPolicyRepository();

    assertThat(repository.updateFeePolicy(1L, effectiveDate, 1903L, 10, "idir\\admin"))
        .isTrue();
    assertThat(repository.deleteFeePolicy(1L)).isTrue();
    assertThat(repository.updateFilPolicy(2L, effectiveDate, 15, "idir\\admin"))
        .isTrue();
    assertThat(repository.deleteFilPolicy(2L)).isTrue();
    assertThat(repository.executions).isEqualTo(4);
  }

  @Test
  void feePolicyMutationsShouldPropagateOracleFailure() {
    LexisAdminPolicyRepository repository = new FailingLexisAdminPolicyRepository();
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);

    assertOracleFailure(
        () -> repository.insertFeePolicy(effectiveDate, 1903L, 10, "idir\\admin"));
    assertOracleFailure(
        () -> repository.updateFeePolicy(1L, effectiveDate, 1903L, 10, "idir\\admin"));
    assertOracleFailure(() -> repository.deleteFeePolicy(1L));
  }

  @Test
  void feeInLieuPolicyMutationsShouldPropagateOracleFailure() {
    LexisAdminPolicyRepository repository = new FailingLexisAdminPolicyRepository();
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);

    assertOracleFailure(() -> repository.insertFilPolicy(effectiveDate, 10, "idir\\admin"));
    assertOracleFailure(
        () -> repository.updateFilPolicy(1L, effectiveDate, 10, "idir\\admin"));
    assertOracleFailure(() -> repository.deleteFilPolicy(1L));
  }

  @Test
  void policyBusinessKeyLookupsShouldPropagateOracleFailure() {
    LexisAdminPolicyRepository repository = new FailingLexisAdminPolicyRepository();
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);

    assertOracleFailure(() -> repository.findFeePolicy(effectiveDate, 1903L));
    assertOracleFailure(() -> repository.findFilPolicy(effectiveDate));
  }

  @Test
  void policyReadModelsShouldPropagateOracleFailure() {
    LexisAdminPolicyRepository repository = new FailingLexisAdminPolicyRepository();

    assertOracleFailure(() -> repository.findFeePolicies("effective_date desc", 0));
    assertOracleFailure(() -> repository.findFeePolicyById(1L));
    assertOracleFailure(repository::countFeePolicies);
    assertOracleFailure(() -> repository.findFilPolicies("effective_date desc", 0));
    assertOracleFailure(() -> repository.findFilPolicyById(1L));
    assertOracleFailure(repository::countFilPolicies);
  }

  @Test
  void policyCountsShouldUseTheNumberOfRowsReturnedByLegacyProcedures() {
    LexisAdminPolicyRepository repository = new PolicyCountLexisAdminPolicyRepository();

    assertThat(repository.countFeePolicies()).isEqualTo(3L);
    assertThat(repository.countFilPolicies()).isEqualTo(2L);
  }

  private static void assertOracleFailure(Runnable mutation) {
    assertThatThrownBy(mutation::run)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private static final class FailingLexisAdminPolicyRepository
      extends LexisAdminPolicyRepository {
    FailingLexisAdminPolicyRepository() {
      super(null);
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }
  }

  private static final class PolicyCountLexisAdminPolicyRepository
      extends LexisAdminPolicyRepository {
    private PolicyCountLexisAdminPolicyRepository() {
      super(null);
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      List<Long> policyIds =
          procedureSignature.contains("COUNT_FEE_POLICIES")
              ? List.of(5L, 14L, 22L)
              : List.of(1L, 9L);
      return (List<T>) policyIds;
    }
  }

  private static final class StubLexisAdminPolicyRepository
      extends LexisAdminPolicyRepository {

    private Optional<?> singleResult = Optional.empty();
    private int executions;

    private StubLexisAdminPolicyRepository() {
      super(null);
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return (Optional<T>) singleResult;
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      executions++;
    }
  }
}

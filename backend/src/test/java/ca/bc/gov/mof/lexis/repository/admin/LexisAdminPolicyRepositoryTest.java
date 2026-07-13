package ca.bc.gov.mof.lexis.repository.admin;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.CallableStatement;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

@DisplayName("Unit Test | LexisAdminPolicyRepository")
class LexisAdminPolicyRepositoryTest {

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
    assertOracleFailure(() -> repository.findOrgUnitByNumber(1903L));
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
}

package ca.bc.gov.mof.lexis.repository.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository.FeePolicyRow;
import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository.FilPolicyRow;
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

package ca.bc.gov.mof.lexis.repository.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository.ClientLocationRow;
import java.sql.CallableStatement;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

class ClientLookupRepositoryTest {

  @Test
  void requiredClientLocationShouldPreserveSuccessAndEmptyResults() {
    ClientLocationRow location =
        new ClientLocationRow(
            "00077881",
            "01",
            "Primary",
            "Example Forestry",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "applicant@example.com");
    StubRequiredClientLookupRepository repository =
        new StubRequiredClientLookupRepository(Optional.of(location));

    assertThat(repository.findLocationByClientNumberCodeRequired(" 00077881 ", " 01 "))
        .contains(location);

    repository.result = Optional.empty();
    assertThat(repository.findLocationByClientNumberCodeRequired("00077881", "01"))
        .isEmpty();
  }

  @Test
  void requiredClientLocationShouldPropagateOracleFailure() {
    ClientLookupRepository repository =
        new StubRequiredClientLookupRepository(Optional.empty()) {
          @Override
          protected <T> Optional<T> queryCursorSingleRequired(
              String procedureSignature,
              SqlConsumer<CallableStatement> binder,
              int cursorOutIndex,
              SqlRowMapper<T> rowMapper) {
            throw new DataAccessResourceFailureException(
                "Oracle client lookup unavailable");
          }
        };

    assertThatThrownBy(
            () -> repository.findLocationByClientNumberCodeRequired("00077881", "01"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void clientDetailShouldPropagateOracleFailure() {
    ClientLookupRepository repository = new FailingClientLookupRepository();

    assertThatThrownBy(() -> repository.findLocationByClientNumberCode("00077881", "00"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void clientLocationsShouldPropagateOracleFailure() {
    ClientLookupRepository repository = new FailingClientLookupRepository();

    assertThatThrownBy(() -> repository.findLocationsByClientNumber("00077881"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void clientContactsShouldPropagateOracleFailure() {
    ClientLookupRepository repository = new FailingClientLookupRepository();

    assertThatThrownBy(
            () -> repository.findContactsByClientNumberCode("00077881", "00"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  private static final class FailingClientLookupRepository extends ClientLookupRepository {

    private FailingClientLookupRepository() {
      super(mock(JdbcTemplate.class));
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException("Oracle client lookup unavailable");
    }
  }

  private static class StubRequiredClientLookupRepository extends ClientLookupRepository {

    private Optional<?> result;

    private StubRequiredClientLookupRepository(Optional<?> result) {
      super(mock(JdbcTemplate.class));
      this.result = result;
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return (Optional<T>) result;
    }
  }
}

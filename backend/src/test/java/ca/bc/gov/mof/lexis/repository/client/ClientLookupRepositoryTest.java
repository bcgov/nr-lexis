package ca.bc.gov.mof.lexis.repository.client;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.sql.CallableStatement;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

class ClientLookupRepositoryTest {

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
}

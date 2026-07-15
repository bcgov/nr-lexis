package ca.bc.gov.mof.lexis.repository.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import ca.bc.gov.mof.lexis.repository.application.ApplicationNotificationContactRepository.InsertContactRecord;
import ca.bc.gov.mof.lexis.repository.application.ApplicationNotificationContactRepository.NotificationContactRow;
import java.sql.CallableStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ApplicationNotificationContactRepositoryTest {

  @Test
  void findShouldUseFullyQualifiedFailClosedPackageCall() throws SQLException {
    TestRepository repository = new TestRepository();

    Optional<NotificationContactRow> result =
        repository.findForCurrentOwner(1000456L, "00011111", "02");

    assertThat(result).contains(repository.row);
    assertThat(repository.signature)
        .isEqualTo("THE.LEXIS_NOTIFY_CONTACTS.FIND_APPL_NOTIFY_CONTACT(?,?,?,?)");
    assertThat(repository.cursorIndex).isEqualTo(4);
    assertThat(repository.failClosed).isTrue();
    verify(repository.statement).setLong(1, 1000456L);
    verify(repository.statement).setString(2, "00011111");
    verify(repository.statement).setString(3, "02");
  }

  @Test
  void invalidFindIdentityShouldNotInvokeOracle() {
    TestRepository repository = new TestRepository();

    assertThat(repository.findForCurrentOwner(null, "00011111", "02")).isEmpty();
    assertThat(repository.findForCurrentOwner(0L, "00011111", "02")).isEmpty();
    assertThat(repository.findForCurrentOwner(1000456L, null, "02")).isEmpty();
    assertThat(repository.findForCurrentOwner(1000456L, "00011111", null)).isEmpty();
    assertThat(repository.signature).isNull();
  }

  @Test
  void insertShouldBindCaptureMetadataWithoutCommitting() throws SQLException {
    TestRepository repository = new TestRepository();
    InsertContactRecord record =
        new InsertContactRecord(
            1000456L,
            "submitter@example.com",
            "AUTHENTICATED_USER",
            Boolean.FALSE,
            "BCEIDBUSINESS",
            "identity-1",
            "00011111",
            "02",
            "bceid\\submitter");

    Optional<NotificationContactRow> result = repository.insert(record);

    assertThat(result).contains(repository.row);
    assertThat(repository.signature)
        .isEqualTo("THE.LEXIS_NOTIFY_CONTACTS.INSERT_APPL_NOTIFY_CONTACT(?,?,?,?,?,?,?,?,?,?)");
    assertThat(repository.cursorIndex).isEqualTo(10);
    assertThat(repository.required).isTrue();
    verify(repository.statement).setLong(1, 1000456L);
    verify(repository.statement).setString(2, "submitter@example.com");
    verify(repository.statement).setString(3, "AUTHENTICATED_USER");
    verify(repository.statement).setString(4, "N");
    verify(repository.statement).setString(5, "BCEIDBUSINESS");
    verify(repository.statement).setString(6, "identity-1");
    verify(repository.statement).setString(7, "00011111");
    verify(repository.statement).setString(8, "02");
    verify(repository.statement).setString(9, "bceid\\submitter");
  }

  @Test
  void insertShouldPreserveUnknownVerificationAsNull() throws SQLException {
    TestRepository repository = new TestRepository();

    repository.insert(
        new InsertContactRecord(
            1000456L,
            "submitter@example.com",
            "AUTHENTICATED_USER",
            null,
            "BCEIDBUSINESS",
            "identity-1",
            "00011111",
            "02",
            "bceid\\submitter"));

    verify(repository.statement).setNull(4, Types.VARCHAR);
  }

  private static final class TestRepository extends ApplicationNotificationContactRepository {

    private final NotificationContactRow row =
        new NotificationContactRow(
            1000456L,
            "submitter@example.com",
            "AUTHENTICATED_USER",
            Boolean.FALSE,
            "BCEIDBUSINESS",
            "identity-1",
            "00011111",
            "02",
            "bceid\\submitter",
            Instant.parse("2026-07-14T18:00:00Z"));
    private String signature;
    private int cursorIndex;
    private boolean failClosed;
    private boolean required;
    private CallableStatement statement;

    private TestRepository() {
      super(mock(JdbcTemplate.class));
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Optional<T> queryCursorSingleFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      signature = procedureSignature;
      cursorIndex = cursorOutIndex;
      failClosed = true;
      bind(binder);
      return Optional.of((T) row);
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      signature = procedureSignature;
      cursorIndex = cursorOutIndex;
      required = true;
      bind(binder);
      return Optional.of((T) row);
    }

    private void bind(SqlConsumer<CallableStatement> binder) {
      statement = mock(CallableStatement.class);
      try {
        binder.accept(statement);
      } catch (SQLException exception) {
        throw new AssertionError(exception);
      }
    }
  }
}

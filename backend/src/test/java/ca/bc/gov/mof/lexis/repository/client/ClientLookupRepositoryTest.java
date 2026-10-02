package ca.bc.gov.mof.lexis.repository.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository.ClientLocationRow;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

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
            "applicant@example.com",
            null);
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
          protected <T> List<T> queryDirectRequired(
              String sql, SqlRowMapper<T> rowMapper, Object... bindValues) {
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
  @SuppressWarnings("unchecked")
  void clientDetailShouldReadLocationClientAndAcronymInOneBoundQuery() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("CLIENT_NUMBER")).thenReturn("00001086");
    when(resultSet.getString("CLIENT_LOCN_CODE")).thenReturn("00");
    when(resultSet.getString("COMPANY_NAME")).thenReturn(" TOLKO INDUSTRIES ");
    when(resultSet.getString("EMAIL_ADDRESS")).thenReturn("applicant@example.com");
    when(resultSet.getString("CLIENT_ACRONYM")).thenReturn(" TOLKOL ");
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("00001086"), eq("00")))
        .thenAnswer(
            invocation ->
                List.of(invocation.getArgument(1, RowMapper.class).mapRow(resultSet, 0)));
    ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

    ClientLocationRow expected =
        new ClientLocationRow(
            "00001086",
            "00",
            null,
            "TOLKO INDUSTRIES",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "applicant@example.com",
            "TOLKOL");
    assertThat(repository.findLocationByClientNumberCode(" 00001086 ", " 00 ")).contains(expected);
    assertThat(repository.findLocationByClientNumberCodeRequired("00001086", "00"))
        .contains(expected);

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate, times(2))
        .query(sql.capture(), any(RowMapper.class), eq("00001086"), eq("00"));
    assertThat(sql.getValue())
        .doesNotContain("FIND_CLIENT_LOCATION")
        .contains("FROM THE.CLIENT_LOCATION L")
        .contains("LEFT JOIN THE.V_CLIENT_PUBLIC FC ON FC.CLIENT_NUMBER = L.CLIENT_NUMBER")
        .contains("SELECT MIN(CA.CLIENT_ACRONYM)")
        .contains("WHERE CA.CLIENT_NUMBER = L.CLIENT_NUMBER")
        .doesNotContain("LEFT JOIN THE.CLIENT_ACRONYM")
        .contains("WHERE L.CLIENT_NUMBER = ?")
        .contains("AND L.CLIENT_LOCN_CODE = ?");
  }

  @Test
  @SuppressWarnings("unchecked")
  void clientDetailShouldReturnOneLocationWithDeterministicAcronym() {
    EmbeddedDatabase database =
        new EmbeddedDatabaseBuilder()
            .generateUniqueName(true)
            .setType(EmbeddedDatabaseType.H2)
            .build();
    try {
      JdbcTemplate jdbcTemplate = spy(new JdbcTemplate(database));
      jdbcTemplate.execute("CREATE SCHEMA THE");
      jdbcTemplate.execute(
          """
          CREATE TABLE THE.CLIENT_LOCATION (
            CLIENT_NUMBER VARCHAR(8), CLIENT_LOCN_CODE VARCHAR(2),
            CLIENT_LOCN_NAME VARCHAR(80), ADDRESS_1 VARCHAR(80), ADDRESS_2 VARCHAR(80),
            ADDRESS_3 VARCHAR(80), CITY VARCHAR(80), PROVINCE VARCHAR(80),
            POSTAL_CODE VARCHAR(20), COUNTRY VARCHAR(80), BUSINESS_PHONE VARCHAR(20),
            FAX_NUMBER VARCHAR(20), EMAIL_ADDRESS VARCHAR(100),
            PRIMARY KEY (CLIENT_NUMBER, CLIENT_LOCN_CODE)
          )
          """);
      jdbcTemplate.execute(
          """
          CREATE TABLE THE.V_CLIENT_PUBLIC (
            CLIENT_NUMBER VARCHAR(8) PRIMARY KEY, CLIENT_NAME VARCHAR(100)
          )
          """);
      jdbcTemplate.execute(
          """
          CREATE TABLE THE.CLIENT_ACRONYM (
            CLIENT_NUMBER VARCHAR(8), CLIENT_ACRONYM VARCHAR(20)
          )
          """);
      jdbcTemplate.execute(
          """
          INSERT INTO THE.CLIENT_LOCATION (CLIENT_NUMBER, CLIENT_LOCN_CODE, CLIENT_LOCN_NAME)
          VALUES ('00001086', '00', 'Primary'), ('00001086', '01', 'Secondary'),
                 ('00001087', '00', 'Without acronym')
          """);
      jdbcTemplate.execute(
          """
          INSERT INTO THE.V_CLIENT_PUBLIC VALUES
          ('00001086', 'Example Forestry'), ('00001087', 'Other Forestry')
          """);
      jdbcTemplate.execute(
          """
          INSERT INTO THE.CLIENT_ACRONYM VALUES
          ('00001086', 'ZETA'), ('00001086', 'ALPHA'), ('00001086', 'BETA'),
          ('00001088', 'AAAA')
          """);
      ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

      Optional<ClientLocationRow> location =
          repository.findLocationByClientNumberCode("00001086", "00");
      Optional<ClientLocationRow> requiredLocation =
          repository.findLocationByClientNumberCodeRequired("00001086", "00");

      ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
      verify(jdbcTemplate, times(2))
          .query(sql.capture(), any(RowMapper.class), eq("00001086"), eq("00"));
      assertThat(jdbcTemplate.queryForList(sql.getValue(), "00001086", "00")).hasSize(1);
      assertThat(location)
          .hasValueSatisfying(
              row -> {
                assertThat(row.clientLocationCode()).isEqualTo("00");
                assertThat(row.clientLocationName()).isEqualTo("Primary");
                assertThat(row.companyName()).isEqualTo("Example Forestry");
                assertThat(row.clientAcronym()).isEqualTo("ALPHA");
              });
      assertThat(requiredLocation).isEqualTo(location);
      assertThat(repository.findLocationByClientNumberCode("00001087", "00"))
          .hasValueSatisfying(row -> assertThat(row.clientAcronym()).isNull());
      assertThat(repository.findLocationByClientNumberCodeRequired("00001087", "00"))
          .hasValueSatisfying(row -> assertThat(row.clientAcronym()).isNull());
    } finally {
      database.shutdown();
    }
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

  @Test
  @SuppressWarnings("unchecked")
  void clientSuggestionsShouldUseBoundScopedFederalCappedQuery() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    PreparedStatement statement = mock(PreparedStatement.class);
    when(jdbcTemplate.query(
            anyString(), any(PreparedStatementSetter.class), any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              invocation.getArgument(1, PreparedStatementSetter.class).setValues(statement);
              return List.of();
            });
    ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

    assertThat(repository.findClientSuggestions(" Acme%_\\ ", true, " 00077881 ")).isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sql.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sql.getValue())
        .contains("FROM THE.V_CLIENT_PUBLIC FC")
        .doesNotContain("THE.FOREST_CLIENT")
        .contains("FROM THE.CLIENT_ACRONYM CA")
        .contains("FROM THE.EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("COALESCE(")
        .contains("AND (? IS NULL OR FC.CLIENT_NUMBER = ?)")
        .contains("EEA.EXPORT_JURISDICTION_CODE = 'F'")
        .contains("UPPER(CA.CLIENT_ACRONYM) = UPPER(?)")
        .contains("ORDER BY MATCH_RANK, UPPER(FC.CLIENT_NAME), FC.CLIENT_NUMBER")
        .endsWith("WHERE ROWNUM <= 15\n");
    verify(statement).setInt(1, 0);
    verify(statement).setString(2, "Acme\\%\\_\\\\");
    verify(statement).setInt(3, 0);
    verify(statement).setString(4, "Acme%_\\");
    verify(statement).setInt(5, 0);
    verify(statement).setString(6, "Acme%_\\");
    verify(statement).setInt(7, 0);
    verify(statement).setString(8, "Acme\\%\\_\\\\");
    verify(statement).setString(9, "Acme\\%\\_\\\\");
    verify(statement).setString(10, "00077881");
    verify(statement).setString(11, "00077881");
    verify(statement).setInt(12, 1);
  }

  @Test
  @SuppressWarnings("unchecked")
  void clientSuggestionsShouldUseExactPaddedNumericSearch() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    PreparedStatement statement = mock(PreparedStatement.class);
    when(jdbcTemplate.query(
            anyString(), any(PreparedStatementSetter.class), any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              invocation.getArgument(1, PreparedStatementSetter.class).setValues(statement);
              return List.of();
            });
    ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

    assertThat(repository.findClientSuggestions("77881", false, null)).isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sql.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sql.getValue()).contains("FC.CLIENT_NUMBER = LPAD(?, 8, '0')");
    verify(statement).setInt(1, 1);
    verify(statement).setInt(3, 1);
    verify(statement).setString(4, "77881");
    verify(statement).setInt(5, 1);
    verify(statement).setString(6, "77881");
    verify(statement).setInt(7, 1);
    verify(statement).setString(10, null);
    verify(statement).setString(11, null);
    verify(statement).setInt(12, 0);
  }

  @Test
  void clientSuggestionsShouldSkipBlankShortOverlongAndOversizedNumericTerms() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

    for (String term : List.of(" ", "ab", "1".repeat(9), "x".repeat(61))) {
      assertThat(repository.findClientSuggestions(term, false, null)).isEmpty();
    }
    assertThat(repository.findClientSuggestions(null, false, null)).isEmpty();

    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  @SuppressWarnings("unchecked")
  void clientSuggestionsShouldMapDirectQueryRows() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("CLIENT_NUMBER")).thenReturn(" 00077881 ");
    when(resultSet.getString("COMPANY_NAME")).thenReturn(" Acme Forestry ");
    when(resultSet.getString("CLIENT_ACRONYM")).thenReturn(" ACME ");
    when(jdbcTemplate.query(
            anyString(), any(PreparedStatementSetter.class), any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              RowMapper<?> rowMapper = invocation.getArgument(2, RowMapper.class);
              return List.of(rowMapper.mapRow(resultSet, 0));
            });
    ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

    assertThat(repository.findClientSuggestions("Acme", false, null))
        .containsExactly(
            new ClientLookupRepository.ClientSuggestionRow(
                "00077881", "Acme Forestry", "ACME"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void clientSuggestionsShouldPropagateRowMappingFailure() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("CLIENT_NUMBER")).thenThrow(new SQLException("column unavailable"));
    when(jdbcTemplate.query(
            anyString(), any(PreparedStatementSetter.class), any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              RowMapper<?> rowMapper = invocation.getArgument(2, RowMapper.class);
              try {
                return List.of(rowMapper.mapRow(resultSet, 0));
              } catch (SQLException exception) {
                throw new DataAccessResourceFailureException("Oracle client lookup unavailable", exception);
              }
            });
    ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findClientSuggestions("Acme", false, null))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasCauseInstanceOf(SQLException.class);
  }

  @Test
  @SuppressWarnings("unchecked")
  void clientSuggestionsShouldPropagateDirectQueryFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(
            anyString(), any(PreparedStatementSetter.class), any(RowMapper.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle client lookup unavailable"));
    ClientLookupRepository repository = new ClientLookupRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findClientSuggestions("Acme", true, "00077881"))
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

    @Override
    protected <T> List<T> queryDirectFailClosed(
        String sql, SqlRowMapper<T> rowMapper, Object... bindValues) {
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
    protected <T> List<T> queryDirectRequired(
        String sql, SqlRowMapper<T> rowMapper, Object... bindValues) {
      return result.map(row -> List.of((T) row)).orElseGet(List::of);
    }
  }
}

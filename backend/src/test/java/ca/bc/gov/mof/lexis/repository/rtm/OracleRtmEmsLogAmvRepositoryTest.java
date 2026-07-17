package ca.bc.gov.mof.lexis.repository.rtm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class OracleRtmEmsLogAmvRepositoryTest {

  private static final LocalDate EFFECTIVE_DATE = LocalDate.of(2026, 7, 1);

  @Mock private JdbcTemplate jdbcTemplate;

  @Test
  @SuppressWarnings("unchecked")
  void effectiveDateReadShouldFallbackToSchemaAfterSynonymFailure() {
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenThrow(new DataAccessResourceFailureException("sensitive synonym failure"))
        .thenReturn(List.of());
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(repository.findEffectiveDateRows(null, null, EFFECTIVE_DATE)).isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate, times(2))
        .query(sql.capture(), any(RowMapper.class), any(Object[].class));
    assertThat(sql.getAllValues().get(0)).contains("FROM EMS_LOG_AMV");
    assertThat(sql.getAllValues().get(1)).contains("FROM THE.EMS_LOG_AMV");
  }

  @Test
  void exactExistenceShouldRejectUnexpectedCardinality() {
    when(jdbcTemplate.queryForObject(
            anyString(),
            eq(Integer.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenReturn(2);
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(repository.existsExact("BA", "A", "O", EFFECTIVE_DATE)).isFalse();
  }

  @Test
  @SuppressWarnings("unchecked")
  void effectiveDateReadShouldFailWhenBothAuthoritativeSourcesAreUnavailable(
      CapturedOutput output) {
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenThrow(
            new DataAccessResourceFailureException("private-synonym@example.com"),
            new DataAccessResourceFailureException("private-schema@example.com"));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findEffectiveDateRows(null, null, EFFECTIVE_DATE))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Authoritative RTM AMV data is temporarily unavailable.")
        .satisfies(failure -> assertThat(failure.getSuppressed()).hasSize(1));

    assertThat(output)
        .contains(
            "event=lexis_rtm_amv operation=find_effective_date "
                + "outcome=database_unavailable failureType=DataAccessResourceFailureException")
        .doesNotContain("private-synonym@example.com", "private-schema@example.com");
  }

  @Test
  @SuppressWarnings("unchecked")
  void latestEffectiveDateReadShouldFailWhenBothAuthoritativeSourcesAreUnavailable() {
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenThrow(
            new DataAccessResourceFailureException("synonym unavailable"),
            new DataAccessResourceFailureException("schema unavailable"));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.findLatestEffectiveDateRowsBefore(EFFECTIVE_DATE))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Authoritative RTM AMV data is temporarily unavailable.");
  }

  @Test
  @SuppressWarnings("unchecked")
  void latestEffectiveDateReadShouldSelectTheLatestRowForEachPhysicalKey() {
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of());
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(repository.findLatestEffectiveDateRowsBefore(EFFECTIVE_DATE)).isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), any(Object[].class));
    String normalizedSql = sql.getValue().replaceAll("\\s+", " ");
    assertThat(normalizedSql)
        .contains("ROW_NUMBER() OVER")
        .contains("PARTITION BY SPECIES, GRADE, GROWTH_TYPE_ST")
        .contains("WHERE VALUE_RANK = 1")
        .doesNotContain("MAX(");
  }

  @Test
  @SuppressWarnings("unchecked")
  void procedureReadFailureShouldNotBecomeAnEmptyResult(CapturedOutput output) {
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class)))
        .thenThrow(
            new DataAccessResourceFailureException(
                "{ call RTM_EMS_LOG_AMV_SELECT } private-business-id=123"));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.find("BA", "O", EFFECTIVE_DATE, EFFECTIVE_DATE))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("The RTM AMV database operation is temporarily unavailable.");

    assertThat(output)
        .contains(
            "event=lexis_rtm_amv operation=find outcome=database_unavailable "
                + "failureType=DataAccessResourceFailureException")
        .doesNotContain("RTM_EMS_LOG_AMV_SELECT", "private-business-id");
  }

  @Test
  @SuppressWarnings("unchecked")
  void missingProcedureResultShouldFailInsteadOfReturningNull() {
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class)))
        .thenReturn(null);
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.find("BA", "O", EFFECTIVE_DATE, EFFECTIVE_DATE))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("The RTM AMV database operation is temporarily unavailable.");
  }

  @Test
  @SuppressWarnings("unchecked")
  void cursorFailureShouldDiscardPreviouslyMappedRows() throws SQLException {
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(statement.getString(1)).thenReturn("0");
    when(statement.getObject(2)).thenReturn(resultSet);
    when(resultSet.next())
        .thenReturn(true)
        .thenThrow(new SQLException("private cursor failure"));
    when(resultSet.getString(1)).thenReturn("BA");
    when(resultSet.getString(2)).thenReturn("A");
    when(resultSet.getString(3)).thenReturn("O");
    when(resultSet.getDate(4)).thenReturn(java.sql.Date.valueOf(EFFECTIVE_DATE));
    when(resultSet.getDate(5)).thenReturn(java.sql.Date.valueOf(EFFECTIVE_DATE));
    when(resultSet.getBigDecimal(6)).thenReturn(new BigDecimal("10.25"));
    when(resultSet.getBigDecimal(7)).thenReturn(new BigDecimal("10.25"));
    doAnswer(
            invocation -> {
              CallableStatementCallback<List<RtmEmsLogAmvRowDto>> callback =
                  invocation.getArgument(1);
              try {
                return callback.doInCallableStatement(statement);
              } catch (SQLException ex) {
                throw new DataAccessResourceFailureException("cursor mapping unavailable", ex);
              }
            })
        .when(jdbcTemplate)
        .execute(anyString(), any(CallableStatementCallback.class));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.find("BA", "O", EFFECTIVE_DATE, null))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  @SuppressWarnings("unchecked")
  void procedureCursorShouldExposeOracleSingleSpaceGradeAsBlank() throws SQLException {
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(statement.getString(1)).thenReturn("0");
    when(statement.getObject(2)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("BA");
    when(resultSet.getString(2)).thenReturn(" ");
    when(resultSet.getString(3)).thenReturn("O");
    when(resultSet.getDate(4)).thenReturn(java.sql.Date.valueOf(EFFECTIVE_DATE));
    when(resultSet.getDate(5)).thenReturn(java.sql.Date.valueOf(EFFECTIVE_DATE));
    when(resultSet.getBigDecimal(6)).thenReturn(new BigDecimal("10.25"));
    when(resultSet.getBigDecimal(7)).thenReturn(new BigDecimal("10.25"));
    doAnswer(
            invocation -> {
              CallableStatementCallback<List<RtmEmsLogAmvRowDto>> callback =
                  invocation.getArgument(1);
              return callback.doInCallableStatement(statement);
            })
        .when(jdbcTemplate)
        .execute(anyString(), any(CallableStatementCallback.class));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    List<RtmEmsLogAmvRowDto> rows =
        repository.find("BA", "O", EFFECTIVE_DATE, null);

    assertThat(rows).singleElement().extracting(RtmEmsLogAmvRowDto::grade).isEqualTo("BLANK");
  }

  @Test
  @SuppressWarnings("unchecked")
  void insertShouldBindBlankGradeAsOracleSingleSpace() throws SQLException {
    CallableStatement statement = mock(CallableStatement.class);
    when(statement.getString(1)).thenReturn("0");
    doAnswer(
            invocation -> {
              CallableStatementCallback<String> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(statement);
            })
        .when(jdbcTemplate)
        .execute(anyString(), any(CallableStatementCallback.class));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(
            repository.insert(
                "BA", "BLANK", "O", EFFECTIVE_DATE, new BigDecimal("10.25")))
        .isEqualTo("0");

    verify(statement).setString(3, " ");
  }

  @Test
  @SuppressWarnings("unchecked")
  void mutationFailureShouldThrowAndUsePublicSafeLogging(CapturedOutput output) {
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class)))
        .thenThrow(
            new DataAccessResourceFailureException(
                "{ call RTM_EMS_LOG_AMV_UPDATE } species=private-value"));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(
            () ->
                repository.update(
                    "BA",
                    "A",
                    "O",
                    EFFECTIVE_DATE,
                    EFFECTIVE_DATE,
                    new BigDecimal("10.25")))
        .isInstanceOf(DataAccessResourceFailureException.class);

    assertThat(output)
        .contains(
            "event=lexis_rtm_amv operation=update outcome=database_unavailable "
                + "failureType=DataAccessResourceFailureException")
        .doesNotContain("RTM_EMS_LOG_AMV_UPDATE", "private-value");
  }

  @Test
  void exactExistenceShouldTreatSuccessfulZeroCountAsMissingWithoutSchemaFallback() {
    when(jdbcTemplate.queryForObject(
            anyString(),
            eq(Integer.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenReturn(0);
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(repository.existsExact("BA", "A", "O", EFFECTIVE_DATE)).isFalse();

    verify(jdbcTemplate)
        .queryForObject(
            anyString(),
            eq(Integer.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE)));
  }

  @Test
  void exactExistenceShouldFallbackToSchemaAfterSynonymFailure() {
    when(jdbcTemplate.queryForObject(
            anyString(),
            eq(Integer.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenThrow(new DataAccessResourceFailureException("synonym unavailable"))
        .thenReturn(1);
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(repository.existsExact("BA", "A", "O", EFFECTIVE_DATE)).isTrue();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate, times(2))
        .queryForObject(
            sql.capture(),
            eq(Integer.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE)));
    assertThat(sql.getAllValues().get(0)).contains("FROM EMS_LOG_AMV");
    assertThat(sql.getAllValues().get(1)).contains("FROM THE.EMS_LOG_AMV");
    assertThat(sql.getAllValues())
        .allSatisfy(
            statement ->
                assertThat(statement)
                    .contains("AND EFFECTIVE_DATE = ?")
                    .doesNotContain("TRUNC(EFFECTIVE_DATE)"));
  }

  @Test
  void exactValueShouldRejectUnexpectedCardinality() {
    when(jdbcTemplate.queryForList(
            anyString(),
            eq(BigDecimal.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenReturn(List.of(new BigDecimal("10.25"), new BigDecimal("10.25")));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(
            repository.hasExactValue(
                "BA", "A", "O", EFFECTIVE_DATE, new BigDecimal("10.25")))
        .isFalse();
  }

  @Test
  void exactExistenceShouldFailWhenSynonymAndSchemaAreUnavailable() {
    when(jdbcTemplate.queryForObject(
            anyString(),
            eq(Integer.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenThrow(
            new DataAccessResourceFailureException("synonym unavailable"),
            new DataAccessResourceFailureException("schema unavailable"));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.existsExact("BA", "A", "O", EFFECTIVE_DATE))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Authoritative RTM AMV data is temporarily unavailable.")
        .satisfies(failure -> assertThat(failure.getSuppressed()).hasSize(1));
  }

  @Test
  void exactValueShouldTreatSuccessfulEmptyResultAsMissingWithoutSchemaFallback() {
    when(jdbcTemplate.queryForList(
            anyString(),
            eq(BigDecimal.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenReturn(List.of());
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(
            repository.hasExactValue(
                "BA", "A", "O", EFFECTIVE_DATE, new BigDecimal("10.25")))
        .isFalse();

    verify(jdbcTemplate)
        .queryForList(
            anyString(),
            eq(BigDecimal.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE)));
  }

  @Test
  void exactValueShouldFallbackToSchemaAfterSynonymFailure() {
    when(jdbcTemplate.queryForList(
            anyString(),
            eq(BigDecimal.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenThrow(new DataAccessResourceFailureException("synonym unavailable"))
        .thenReturn(List.of(new BigDecimal("10.25")));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThat(
            repository.hasExactValue(
                "BA", "A", "O", EFFECTIVE_DATE, new BigDecimal("10.25")))
        .isTrue();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate, times(2))
        .queryForList(
            sql.capture(),
            eq(BigDecimal.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE)));
    assertThat(sql.getAllValues().get(0)).contains("FROM EMS_LOG_AMV");
    assertThat(sql.getAllValues().get(1)).contains("FROM THE.EMS_LOG_AMV");
    assertThat(sql.getAllValues())
        .allSatisfy(
            statement ->
                assertThat(statement)
                    .contains("AND EFFECTIVE_DATE = ?")
                    .doesNotContain("TRUNC(EFFECTIVE_DATE)"));
  }

  @Test
  void exactValueShouldFailWhenSynonymAndSchemaAreUnavailable() {
    when(jdbcTemplate.queryForList(
            anyString(),
            eq(BigDecimal.class),
            eq("BA"),
            eq("A"),
            eq("O"),
            eq(java.sql.Date.valueOf(EFFECTIVE_DATE))))
        .thenThrow(
            new DataAccessResourceFailureException("synonym unavailable"),
            new DataAccessResourceFailureException("schema unavailable"));
    OracleRtmEmsLogAmvRepository repository = new OracleRtmEmsLogAmvRepository(jdbcTemplate);

    assertThatThrownBy(
            () ->
                repository.hasExactValue(
                    "BA", "A", "O", EFFECTIVE_DATE, new BigDecimal("10.25")))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Authoritative RTM AMV data is temporarily unavailable.")
        .satisfies(failure -> assertThat(failure.getSuppressed()).hasSize(1));
  }
}

package ca.bc.gov.mof.lexis.repository.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | ExemptionDetailsRpcRepository")
class ExemptionDetailsRpcRepositoryTest {

  @Test
  @SuppressWarnings("unchecked")
  void blanketOicTotalsShouldMatchLegacyBySummingPermitVolume() throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getDouble("REQUESTED_VOLUME")).thenReturn(1250.5d);
    when(resultSet.getDouble("COMPLETED_VOLUME")).thenReturn(800.25d);
    when(resultSet.wasNull()).thenReturn(false);
    when(
            jdbcTemplate.query(
                any(String.class),
                any(RowMapper.class),
                eq("BO-001")))
        .thenAnswer(
            invocation ->
                List.of(
                    ((RowMapper<ExemptionDetailsRpcRepository.BlanketOicTotalsRow>)
                            invocation.getArgument(1))
                        .mapRow(resultSet, 0)));
    ExemptionDetailsRpcRepository repository =
        new ExemptionDetailsRpcRepository(jdbcTemplate);

    ExemptionDetailsRpcRepository.BlanketOicTotalsRow totals =
        repository.findBlanketOicTotals(" BO-001 ");

    assertThat(totals.requestedVolume()).isEqualTo(1250.5d);
    assertThat(totals.completedVolume()).isEqualTo(800.25d);
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sql.capture(), any(RowMapper.class), eq("BO-001"));
    assertThat(sql.getValue())
        .contains("SUM(PERMIT_VOLUME)")
        .contains("EXPORT_PERMIT_STATUS_CODE = 'COM'")
        .contains("WHERE EXEMPTION_NUMBER = ?");
  }

  @Test
  void fileDeleteShouldPropagateOracleFailure() {
    ExemptionDetailsRpcRepository repository = new FailingExemptionDetailsRpcRepository();

    assertThatThrownBy(() -> repository.deleteExemptionFile(10L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void exemptionOrgUnitLookupShouldPropagateOracleFailure() {
    ExemptionDetailsRpcRepository repository = new FailingExemptionDetailsRpcRepository();

    assertThatThrownBy(() -> repository.findExemptionOrgUnitNumbers("EX-205"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void applicationPermitLookupShouldPropagateOracleFailure() {
    ExemptionDetailsRpcRepository repository = new FailingExemptionDetailsRpcRepository();

    assertThatThrownBy(() -> repository.findPermitsByApplicationNumberRequired(1000456L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void applicationPermitLookupShouldUseDeployedLegacyPermitNumberColumn() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet cursor = mock(ResultSet.class);
    when(cursor.next()).thenReturn(true, false);
    when(cursor.getLong("EXPORT_PERMIT_DETAIL_NUMBER")).thenReturn(7000123L);
    when(cursor.getString("EXEMPTION_NUMBER")).thenReturn("26-8757");
    when(cursor.wasNull()).thenReturn(false);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_PERMIT_DET_BY_APP(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(statement));
    when(statement.getObject(2)).thenReturn(cursor);
    ExemptionDetailsRpcRepository repository =
        new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findPermitsByApplicationNumberRequired(1000456L))
        .singleElement()
        .satisfies(
            permit -> {
              assertThat(permit.permitNumber()).isEqualTo(7000123L);
              assertThat(permit.exemptionNumber()).isEqualTo("26-8757");
            });
    verify(cursor, never()).getLong("EXPORT_PERMIT_NUMBER");
  }

  @Test
  void activationCodeLookupShouldPropagateOracleFailure() {
    ExemptionDetailsRpcRepository repository = new FailingExemptionDetailsRpcRepository();

    assertThatThrownBy(() -> repository.isExemptionTypeCodeValidRequired("M"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void attachmentOwnershipReadsShouldPropagateOracleFailure() {
    ExemptionDetailsRpcRepository repository = new FailingExemptionDetailsRpcRepository();

    assertOracleFailure(
        () -> repository.findExemptionDocumentDetailsByExemptionNumber("EX-205"));
    assertOracleFailure(
        () -> repository.findApplicationDocumentDetailsByApplicationNumber(1000456L));
    assertOracleFailure(() -> repository.findAttachmentTypeDescription("UPLOAD"));
  }

  @Test
  void attachmentOwnershipReadsShouldPreserveLegitimateEmptyResults() {
    ExemptionDetailsRpcRepository repository = new EmptyDocumentLookupRepository();

    assertThat(repository.findExemptionDocumentDetailsByExemptionNumber("EX-205")).isEmpty();
    assertThat(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("UPLOAD")).isEmpty();
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void attachmentStreamShouldTreatMissingCursorAsOracleFailure() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement statement = mock(CallableStatement.class);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_FILE_ATTACHMENT(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(statement));
    when(statement.getObject(2)).thenReturn(null);
    ExemptionDetailsRpcRepository repository =
        new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.streamFileAttachment(44L, new ByteArrayOutputStream()))
        .isInstanceOf(java.io.IOException.class)
        .hasCauseInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void applicationLinkLookupShouldUseLegacyExemptionApplicationVolumeColumn() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet cursor = applicationLinkCursor(108653L, 847.7d);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(statement));
    when(statement.getObject(2)).thenReturn(cursor);

    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationLinkRecord(108653L))
        .hasValueSatisfying(
            application -> {
              assertThat(application.applicationNumber()).isEqualTo(108653L);
              assertThat(application.exemptionApplicationVolume()).isEqualTo(847.7d);
            });

    verify(cursor, never()).getDouble("APPLICATION_VOLUME");
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void applicationSummaryLookupShouldNotReadScaleColumnsMissingFromLegacyCursor() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet cursor = applicationSummaryCursor(108653L, 847.7d);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_APPLICATION_BY_EXEMPTION(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(statement));
    when(statement.getObject(2)).thenReturn(cursor);

    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationSummariesByExemptionNumber("26-8759"))
        .singleElement()
        .satisfies(
            application -> {
              assertThat(application.applicationNumber()).isEqualTo(108653L);
              assertThat(application.requestedVolume()).isEqualTo(847.7d);
              assertThat(application.scaleVolume()).isNaN();
            });

    verify(cursor, never()).getDouble("TOTAL_SCALE_VOLUME");
    verify(cursor, never()).getDouble("SCALE_VOLUME");
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void permitSummaryLookupShouldUseOnlyColumnsAvailableFromDeployedLegacyCursor()
      throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet cursor = mock(ResultSet.class);
    when(cursor.next()).thenReturn(true, false);
    when(cursor.getLong("EXPORT_PERMIT_DETAIL_NUMBER")).thenReturn(7000123L);
    when(cursor.getDouble("PERMIT_VOLUME")).thenReturn(80.0d);
    when(cursor.wasNull()).thenReturn(false);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_PERMIT_DET_BY_EXMP(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(statement));
    when(statement.getObject(2)).thenReturn(cursor);
    ExemptionDetailsRpcRepository repository =
        new ExemptionDetailsRpcRepository(jdbcTemplate);

    List<ExemptionDetailsRpcRepository.PermitSummaryRow> permits =
        repository.findPermitsByExemptionNumber("BO-001");

    assertThat(permits).hasSize(1);
    assertThat(permits.get(0).permitNumber()).isEqualTo(7000123L);
    assertThat(permits.get(0).permitVolume()).isEqualTo(80.0d);
    verify(cursor, never()).getLong("EXPORT_PERMIT_NUMBER");
    verify(cursor, never()).getLong("ORG_UNIT_NO");
  }

  private static ResultSet applicationLinkCursor(long applicationNumber, double applicationVolume)
      throws SQLException {
    ResultSet cursor = mock(ResultSet.class);
    when(cursor.next()).thenReturn(true, false);
    when(cursor.getLong("APPLICATION_NUMBER")).thenReturn(applicationNumber);
    when(cursor.getDouble("EXEMPTION_APPLICATION_VOLUME")).thenReturn(applicationVolume);
    when(cursor.getTimestamp("APPLICATION_DATE"))
        .thenReturn(Timestamp.valueOf("2026-02-20 00:00:00"));
    when(cursor.getTimestamp("RECEIVED_DATE"))
        .thenReturn(Timestamp.valueOf("2026-02-21 00:00:00"));
    return cursor;
  }

  private static ResultSet applicationSummaryCursor(long applicationNumber, double applicationVolume)
      throws SQLException {
    ResultSet cursor = mock(ResultSet.class);
    when(cursor.next()).thenReturn(true, false);
    when(cursor.getLong("APPLICATION_NUMBER")).thenReturn(applicationNumber);
    when(cursor.getDouble("EXEMPTION_APPLICATION_VOLUME")).thenReturn(applicationVolume);
    when(cursor.getString("OWNER_CLIENT_NUMBER")).thenReturn("00162575");
    when(cursor.getString("EXPORT_JURISDICTION_CODE")).thenReturn("P");
    when(cursor.getString("EXPORT_PRODUCT_TYPE_CODE")).thenReturn("T");
    return cursor;
  }

  private static void assertOracleFailure(Runnable operation) {
    assertThatThrownBy(operation::run)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private static final class FailingExemptionDetailsRpcRepository
      extends ExemptionDetailsRpcRepository {
    FailingExemptionDetailsRpcRepository() {
      super(null);
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }

    @Override
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
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
  }

  private static final class EmptyDocumentLookupRepository
      extends ExemptionDetailsRpcRepository {
    EmptyDocumentLookupRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return List.of();
    }
  }
}

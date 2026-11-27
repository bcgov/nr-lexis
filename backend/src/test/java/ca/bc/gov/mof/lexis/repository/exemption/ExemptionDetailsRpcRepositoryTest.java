package ca.bc.gov.mof.lexis.repository.exemption;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.EXEMPTION_TYPE_BY_CODE;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ORG_UNIT_BY_NUMBER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | ExemptionDetailsRpcRepository")
class ExemptionDetailsRpcRepositoryTest {

  @Test
  void orgUnitValidationShouldRejectInvalidInputsWithoutQuerying() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.isOrgUnitValidRequired(null)).isFalse();
    assertThat(repository.isOrgUnitValidRequired(0L)).isFalse();
    assertThat(repository.isOrgUnitValidRequired(-1L)).isFalse();
    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitValidationShouldBindNumberAndUseOnlyTheFirstNullableRow() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L, 9999L, 1904L, 1903L, 0L, 1903L);
    when(resultSet.wasNull()).thenReturn(false, false, false, false, true, false);
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenAnswer(
            invocation -> {
              RowMapper<Long> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.isOrgUnitValidRequired(1903L)).isTrue();
    assertThat(repository.isOrgUnitValidRequired(1903L)).isFalse();
    assertThat(repository.isOrgUnitValidRequired(1903L)).isFalse();
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitValidationShouldDistinguishAbsentRowsFromQueryFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenReturn(List.of())
        .thenThrow(failure);
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.isOrgUnitValidRequired(1903L)).isFalse();
    assertThatThrownBy(() -> repository.isOrgUnitValidRequired(1903L)).isSameAs(failure);
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitValidationShouldRejectAnUnreadableRequiredNumber() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    SQLException failure = new SQLException("Invalid column name");
    when(resultSet.getLong("ORG_UNIT_NO")).thenThrow(failure);
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenAnswer(
            invocation -> {
              RowMapper<Long> mapper = invocation.getArgument(1);
              return java.util.Collections.singletonList(mapper.mapRow(resultSet, 0));
            });
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.isOrgUnitValidRequired(1903L))
        .isInstanceOf(org.springframework.dao.DataRetrievalFailureException.class)
        .hasMessageContaining("ORG_UNIT_NO")
        .hasCause(failure);
  }

  @Test
  void permitRegionsShouldBeReadDirectlyForTheExemptionsPermits() throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("EXPORT_PERMIT_DETAIL_NUMBER")).thenReturn(7000123L, 7000124L);
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L, 0L);
    // The second permit has no region.
    when(resultSet.wasNull()).thenReturn(false, false, false, true);
    doAnswer(
            invocation -> {
              RowCallbackHandler handler = invocation.getArgument(1);
              handler.processRow(resultSet);
              handler.processRow(resultSet);
              return null;
            })
        .when(jdbcTemplate)
        .query(any(String.class), any(RowCallbackHandler.class), eq("BO-001"));
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findPermitRegionsByExemptionNumber(" BO-001 "))
        .containsExactly(entry(7000123L, 1903L));
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowCallbackHandler.class), eq("BO-001"));
    assertThat(sql.getValue())
        .contains("ORG_UNIT_NO")
        .contains("FROM EXPORT_PERMIT_DETAIL")
        .contains("WHERE EXEMPTION_NUMBER = ?");
  }

  @Test
  @SuppressWarnings("unchecked")
  void documentContextShouldLoadAllLinkedDocumentsInOneDirectQuery() throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("EXPORT_ATTACHMENT_ID")).thenReturn(20L);
    when(resultSet.getLong("SOURCE_APPLICATION_NUMBER")).thenReturn(1000456L);
    when(resultSet.getLong("DELETABLE")).thenReturn(0L);
    when(resultSet.getString("FILE_NAME")).thenReturn("application.pdf");
    when(resultSet.getString("DESCRIPTION")).thenReturn("desc");
    when(resultSet.getString("EXPORT_ATTACHMENT_TYPE_CODE")).thenReturn("UPLOAD");
    when(resultSet.getString("ATTACHMENT_TYPE_DESCRIPTION"))
        .thenReturn("Uploaded document");
    when(resultSet.getString("DOCUMENT_SOURCE")).thenReturn("application");
    when(resultSet.wasNull()).thenReturn(false);
    when(
            jdbcTemplate.query(
                any(String.class),
                any(RowMapper.class),
                eq("EX-205"),
                eq("EX-205")))
        .thenAnswer(
            invocation ->
                List.of(
                    ((RowMapper<ExemptionDetailsRpcRepository.ExemptionDocumentContextRow>)
                            invocation.getArgument(1))
                        .mapRow(resultSet, 0)));
    ExemptionDetailsRpcRepository repository =
        new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findExemptionDocumentContextRows(" EX-205 "))
        .singleElement()
        .satisfies(
            document -> {
              assertThat(document.documentRow().id()).isEqualTo(20L);
              assertThat(document.attachmentTypeDescription())
                  .isEqualTo("Uploaded document");
              assertThat(document.source()).isEqualTo("application");
              assertThat(document.sourceApplicationNumber()).isEqualTo(1000456L);
              assertThat(document.deletable()).isFalse();
            });
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(
            sql.capture(),
            any(RowMapper.class),
            eq("EX-205"),
            eq("EX-205"));
    assertThat(sql.getValue())
        .contains("FROM EXPORT_EXEMPT_FILE_ATTCHMNT EEFA")
        .contains("INNER JOIN EXPORT_APPL_FILE_ATTCHMNT EAFA")
        .contains("LEFT JOIN EXPORT_ATTACHMENT_TYPE_CODE EATC")
        .contains("ORDER BY DR.SOURCE_ORDER");
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
  @SuppressWarnings("unchecked")
  void activationCodeLookupShouldPropagateOracleFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(eq(EXEMPTION_TYPE_BY_CODE), any(RowMapper.class), eq("M")))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

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
  }

  @Test
  void attachmentOwnershipReadsShouldPreserveLegitimateEmptyResults() {
    ExemptionDetailsRpcRepository repository = new EmptyDocumentLookupRepository();

    assertThat(repository.findExemptionDocumentDetailsByExemptionNumber("EX-205")).isEmpty();
    assertThat(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L)).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentTypeDescriptionShouldUseBoundDirectQueryAndTrimDescription() throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("DESCRIPTION")).thenReturn(" Uploaded document ");
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("UPLOAD")))
        .thenAnswer(
            invocation ->
                List.of(
                    ((RowMapper<String>) invocation.getArgument(1)).mapRow(resultSet, 0)));
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription(" UPLOAD "))
        .hasValue("Uploaded document");

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq("UPLOAD"));
    assertThat(sql.getValue())
        .contains("FROM THE.EXPORT_ATTACHMENT_TYPE_CODE")
        .contains("WHERE C.EXPORT_ATTACHMENT_TYPE_CODE = ?");
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentTypeDescriptionShouldReturnEmptyForNoDescriptionOrABlankFirstRow()
      throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("EMPTY")))
        .thenReturn(List.of());
    when(resultSet.getString("DESCRIPTION")).thenReturn(null, "later", "  ", "later");
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("NULL")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("BLANK")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription("EMPTY")).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("NULL")).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("BLANK")).isEmpty();
  }

  @Test
  void attachmentTypeDescriptionShouldSkipLookupForBlankCode() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription(null)).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("  ")).isEmpty();

    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  void attachmentTypeDescriptionShouldPropagateQueryFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("UPLOAD")))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertOracleFailure(() -> repository.findAttachmentTypeDescription("UPLOAD"));
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
    ResultSet row = applicationLinkCursor(108653L, 847.7d);
    stubDirectRow(jdbcTemplate, row, 108653L);

    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationLinkRecord(108653L))
        .hasValueSatisfying(
            application -> {
              assertThat(application.applicationNumber()).isEqualTo(108653L);
              assertThat(application.exemptionApplicationVolume()).isEqualTo(847.7d);
            });

    verify(row, never()).getDouble("APPLICATION_VOLUME");
    String sql = capturedDirectSql(jdbcTemplate, 108653L);
    assertThat(sql)
        .contains("WHERE EEA.APPLICATION_NUMBER = ?")
        .contains("LEFT JOIN EXPORT_SCHEDULE ES")
        .contains("INNER JOIN EXPORT_APPLICATION_STATUS_CODE EASC")
        .contains("INNER JOIN EXPORT_EXEMPTION_REASON_CODE EERC")
        .contains("INNER JOIN EXPORT_APPLICANT_TYPE_CODE EATC")
        .doesNotContain("GET_APPLICATION_APPROVAL_DATE")
        .doesNotContain("EXPORT_PACKAGE");
    verify(jdbcTemplate, never()).execute(any(String.class), any(CallableStatementCallback.class));
  }

  @ParameterizedTest
  @NullSource
  @ValueSource(strings = {" ", "  Harvested site  "})
  @SuppressWarnings({"rawtypes", "unchecked"})
  void applicationLinkRoundTripShouldPreserveStoredProductLocation(String productLocation)
      throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement writeStatement = mock(CallableStatement.class);
    ResultSet row = applicationLinkCursor(900101L, 10.0d);
    when(row.getString("PRODUCT_LOCATION")).thenReturn(productLocation);
    stubDirectRow(jdbcTemplate, row, 900101L);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_14.UPDATE_EXEMPTION_APPLICATION(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(writeStatement));
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    var application = repository.findApplicationLinkRecord(900101L).orElseThrow();
    assertThat(application.productLocation()).isEqualTo(productLocation);
    assertThat(
            repository.updateApplicationExemption(
                new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
                    application, "EX-TEST", "EXE", "idir\\reviewer")))
        .isTrue();
    assertThat(
            repository.updateApplicationExemption(
                new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
                    application, null, "APP", "idir\\reviewer")))
        .isTrue();

    if (productLocation == null) {
      verify(writeStatement, times(2)).setNull(8, Types.VARCHAR);
      verify(writeStatement, never()).setString(eq(8), any());
    } else {
      verify(writeStatement, times(2)).setString(8, productLocation);
      verify(writeStatement, never()).setNull(eq(8), anyInt());
    }
    verify(writeStatement).setString(18, "EX-TEST");
    verify(writeStatement).setNull(18, Types.VARCHAR);
    verify(writeStatement).setString(20, "EXE");
    verify(writeStatement).setString(20, "APP");
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void applicationSummaryLookupShouldNotReadScaleColumnsMissingFromLegacyCursor() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet cursor = applicationSummaryCursor(108653L, 847.7d);
    stubDirectRow(jdbcTemplate, cursor, "26-8759");

    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationSummariesByExemptionNumber(" 26-8759 "))
        .singleElement()
        .satisfies(
            application -> {
              assertThat(application.applicationNumber()).isEqualTo(108653L);
              assertThat(application.requestedVolume()).isEqualTo(847.7d);
              assertThat(application.scaleVolume()).isNaN();
              assertThat(application.ownerClientNumber()).isEqualTo("00001074");
              assertThat(application.agentClientNumber()).isEqualTo("00002176");
              assertThat(application.ownerClientLocationCode()).isEqualTo("03");
              assertThat(application.agentClientLocationCode()).isEqualTo("12");
              assertThat(application.applicantTypeCode()).isEqualTo("A");
              assertThat(application.ownerContactName()).isEqualTo("OWNER PERSON");
              assertThat(application.agentContactName()).isEqualTo("EXPORT PERSON");
              assertThat(application.ownerCompanyName())
                  .isEqualTo("SAMPLE OWNER LTD");
              assertThat(application.agentCompanyName())
                  .isEqualTo("SAMPLE AGENT LTD");
              assertThat(application.applicationStatusCode()).isEqualTo("EXE");
            });

    verify(cursor, never()).getDouble("TOTAL_SCALE_VOLUME");
    verify(cursor, never()).getDouble("SCALE_VOLUME");
    String sql = capturedDirectSql(jdbcTemplate, "26-8759");
    assertThat(sql)
        .contains("WHERE EEA.EXEMPTION_NUMBER = ?")
        .contains("ORDER BY EEA.APPLICATION_NUMBER")
        .contains("INNER JOIN EXPORT_APPLICATION_STATUS_CODE EASC")
        .contains("INNER JOIN EXPORT_EXEMPTION_REASON_CODE EERC")
        .contains("INNER JOIN EXPORT_APPLICANT_TYPE_CODE EATC")
        .contains("LEFT JOIN THE.V_CLIENT_PUBLIC FCO")
        .doesNotContain("GET_APPLICATION_APPROVAL_DATE")
        .doesNotContain("EXPORT_PACKAGE")
        .doesNotContain(" FOREST_CLIENT");
    verify(jdbcTemplate, never()).execute(any(String.class), any(CallableStatementCallback.class));
  }

  @Test
  void exemptionRecordShouldReadTheExemptionRowWithoutAggregatingItsChildren() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet row = mock(ResultSet.class);
    when(row.getString("EXEMPTION_NUMBER")).thenReturn("26-8759");
    when(row.getDouble("APPROVED_VOLUME")).thenReturn(1200.5d);
    when(row.getTimestamp("EXPIRY_DATE")).thenReturn(Timestamp.valueOf("2027-02-21 00:00:00"));
    when(row.getString("EXPORT_EXEMPTION_TYPE_CODE")).thenReturn("M");
    when(row.getString("EXPORT_EXEMPTION_STATUS_CODE")).thenReturn("ACT");
    stubDirectRow(jdbcTemplate, row, "26-8759");
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findExemptionRecord(" 26-8759 "))
        .hasValueSatisfying(
            exemption -> {
              assertThat(exemption.exemptionNumber()).isEqualTo("26-8759");
              assertThat(exemption.approvedVolume()).isEqualTo(1200.5d);
              assertThat(exemption.exemptionTypeCode()).isEqualTo("M");
              assertThat(exemption.exemptionStatusCode()).isEqualTo("ACT");
            });
    assertThat(repository.existsByExemptionNumber("26-8759")).isTrue();
    assertThat(repository.existsByExemptionNumber("26-0000")).isFalse();
    assertThat(repository.findExemptionRecord("26-0000")).isEmpty();

    String sql = capturedDirectSql(jdbcTemplate, "26-8759");
    assertThat(sql)
        .contains("FROM EXPORT_EXEMPTION EE")
        .contains("INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC")
        .contains("WHERE EE.EXEMPTION_NUMBER = ?")
        .doesNotContain("EXPORT_EXEMPTION_APPLICATION")
        .doesNotContain("EXPORT_SCALE_DETAIL");
    verify(jdbcTemplate, never()).execute(any(String.class), any(CallableStatementCallback.class));
  }

  @Test
  void applicationsWithPermitsShouldBeReadForTheWholeExemptionInOneQuery() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet row = mock(ResultSet.class);
    when(row.getLong("APPLICATION_NUMBER")).thenReturn(108653L);
    stubDirectRow(jdbcTemplate, row, "26-8759");
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationNumbersWithPermitsByExemptionNumber(" 26-8759 "))
        .containsExactly(108653L);
    assertThat(repository.findApplicationNumbersWithPermitsByExemptionNumber(" ")).isEmpty();

    String sql = capturedDirectSql(jdbcTemplate, "26-8759");
    assertThat(sql)
        .contains("WHERE EEA.EXEMPTION_NUMBER = ?")
        .contains("ON EP.APPLICATION_NUMBER = EEA.APPLICATION_NUMBER")
        .contains("ON ESD.PACKAGE_NUMBER = EP.PACKAGE_NUMBER")
        .contains("AND EPD.EXEMPTION_NUMBER = EEA.EXEMPTION_NUMBER")
        .contains("INNER JOIN EXPORT_PERMIT_STATUS_CODE EPSC");
    verify(jdbcTemplate, never()).execute(any(String.class), any(CallableStatementCallback.class));
  }

  @Test
  @SuppressWarnings("unchecked")
  void changedLookupsShouldPropagateOracleFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), any()))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    ExemptionDetailsRpcRepository repository = new ExemptionDetailsRpcRepository(jdbcTemplate);

    assertOracleFailure(() -> repository.findApplicationSummariesByExemptionNumber("26-8759"));
    assertOracleFailure(() -> repository.findApplicationLinkRecord(108653L));
    assertOracleFailure(() -> repository.findExemptionRecord("26-8759"));
    assertOracleFailure(() -> repository.existsByExemptionNumber("26-8759"));
    assertOracleFailure(
        () -> repository.findApplicationNumbersWithPermitsByExemptionNumber("26-8759"));
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
    when(cursor.getString("OWNER_CLIENT_NUMBER")).thenReturn("00001074");
    when(cursor.getString("AGENT_CLIENT_NUMBER")).thenReturn("00002176");
    when(cursor.getString("OWNER_CLIENT_LOCATION_CODE")).thenReturn("03");
    when(cursor.getString("AGENT_CLIENT_LOCATION_CODE")).thenReturn("12");
    when(cursor.getString("EXPORT_APPLICANT_TYPE_CODE")).thenReturn("A");
    when(cursor.getString("OWNER_CONTACT_NAME")).thenReturn("OWNER PERSON");
    when(cursor.getString("AGENT_CONTACT_NAME")).thenReturn("EXPORT PERSON");
    when(cursor.getString("OWNER_COMPANY_NAME")).thenReturn("SAMPLE OWNER LTD");
    when(cursor.getString("AGENT_COMPANY_NAME"))
        .thenReturn("SAMPLE AGENT LTD");
    when(cursor.getString("EXPORT_JURISDICTION_CODE")).thenReturn("P");
    when(cursor.getString("EXPORT_PRODUCT_TYPE_CODE")).thenReturn("T");
    when(cursor.getString("EXPORT_APPLICATION_STATUS_CODE")).thenReturn("EXE");
    return cursor;
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private static void stubDirectRow(JdbcTemplate jdbcTemplate, ResultSet row, Object bindValue)
      throws SQLException {
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq(bindValue)))
        .thenAnswer(invocation -> List.of(((RowMapper) invocation.getArgument(1)).mapRow(row, 0)));
  }

  @SuppressWarnings("unchecked")
  private static String capturedDirectSql(JdbcTemplate jdbcTemplate, Object bindValue) {
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate, atLeastOnce())
        .query(sql.capture(), any(RowMapper.class), eq(bindValue));
    return sql.getValue();
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

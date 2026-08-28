package ca.bc.gov.mof.lexis.repository.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.DocumentRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitDocumentContextRow;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataRetrievalFailureException;

@ExtendWith(MockitoExtension.class)
class PermitRpcRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;

  @Test
  void packagePermitMembershipShouldUseOneDirectPredicateForNormalAndOicRelationships() {
    when(
            jdbcTemplate.queryForObject(
                anyString(), eq(Long.class), eq("PKG-903"), eq(7000123L), eq(7000123L)))
        .thenReturn(1L);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPackageAssignedToPermitRequired(" PKG-903 ", 7000123L)).isTrue();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .queryForObject(
            sql.capture(), eq(Long.class), eq("PKG-903"), eq(7000123L), eq(7000123L));
    assertThat(sql.getValue())
        .contains("WHEN EXISTS")
        .contains("FROM EXPORT_PACKAGE P")
        .contains("LEFT JOIN EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("LEFT JOIN EXPORT_PERMIT_DETAIL EPD")
        .contains("LEFT JOIN EXPORT_SCALE_DETAIL ESD")
        .contains("EPD.EXPORT_PERMIT_DETAIL_NUMBER = ?")
        .contains("OR ESD.EXPORT_PERMIT_DETAIL_NUMBER = ?");
  }

  @Test
  void packagePermitMembershipShouldReturnFalseWhenNoRelationshipExists() {
    when(
            jdbcTemplate.queryForObject(
                anyString(), eq(Long.class), eq("PKG-903"), eq(7000123L), eq(7000123L)))
        .thenReturn(0L);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPackageAssignedToPermitRequired("PKG-903", 7000123L)).isFalse();
  }

  @Test
  void packagePermitMembershipShouldRejectInvalidInputWithoutQueryingOracle() {
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPackageAssignedToPermitRequired(" ", 7000123L)).isFalse();
    assertThat(repository.isPackageAssignedToPermitRequired("PKG-903", 0L)).isFalse();

    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  void linkedPermitClientAccessShouldUseOneProvincialExistsQuery() {
    when(
            jdbcTemplate.queryForObject(
                anyString(),
                eq(Long.class),
                eq(7000123L),
                eq("00012345"),
                eq("00012345")))
        .thenReturn(1L);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(
            repository.hasLinkedProvincialApplicationForClient(
                7000123L, " 00012345 "))
        .isTrue();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .queryForObject(
            sql.capture(),
            eq(Long.class),
            eq(7000123L),
            eq("00012345"),
            eq("00012345"));
    assertThat(sql.getValue())
        .contains("WHEN EXISTS")
        .contains("FROM EXPORT_SCALE_DETAIL ESD")
        .contains("INNER JOIN EXPORT_PACKAGE P")
        .contains("INNER JOIN EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("EEA.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("EEA.OWNER_CLIENT_NUMBER = ?")
        .contains("EEA.AGENT_CLIENT_NUMBER = ?");
  }

  @Test
  void linkedPermitClientAccessShouldRejectInvalidInputWithoutQueryingOracle() {
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.hasLinkedProvincialApplicationForClient(0L, "00012345"))
        .isFalse();
    assertThat(repository.hasLinkedProvincialApplicationForClient(7000123L, " "))
        .isFalse();

    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  void corePackageRowsShouldReuseTheCompletePermitPackageCursor() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_PERMIT(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString(anyString())).thenReturn(null);
    when(resultSet.getDouble(anyString())).thenReturn(0.0d);
    when(resultSet.getString("PACKAGE_NUMBER")).thenReturn(" PKG-200 ", "PKG-100");
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L, 1000457L);
    when(resultSet.getDouble("PACKAGE_VOLUME")).thenReturn(20.0d, 10.0d);
    when(resultSet.getString("EXPORT_PACKAGE_STATUS_CODE")).thenReturn("ACT", "COM");
    when(resultSet.getString("EXPORT_GROWTH_TYPE_CODE")).thenReturn("S", "O");
    when(resultSet.getString("EXPORT_PRODUCT_TYPE_CODE")).thenReturn("T", "T");
    when(resultSet.wasNull()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findCorePackageRowsByPermitNumberRequired(7000123L);

    assertThat(rows)
        .extracting(
            "packageNumber",
            "applicationNumber",
            "packageVolume",
            "packageStatusCode",
            "growthTypeCode")
        .containsExactly(
            tuple("PKG-100", 1000457L, 10.0d, "COM", "O"),
            tuple("PKG-200", 1000456L, 20.0d, "ACT", "S"));
    verify(callableStatement).setString(1, "7000123");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void permitScaleRowsByApplicationShouldUseTheExistingApplicationCursor() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_SCALE_DETAIL_BY_APP(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("EXPORT_SCALE_DETAIL_ID")).thenReturn("101");
    when(resultSet.getString("TIMBER_MARK")).thenReturn("TM-1");
    when(resultSet.getString("EXPORT_SPECIES_CODE")).thenReturn("HE");
    when(resultSet.getString("EXPORT_GRADE_CODE")).thenReturn("A");
    when(resultSet.getDouble("SPECIES_GRADE_VOLUME")).thenReturn(7.5d);
    when(resultSet.getLong("PIECES_COUNT")).thenReturn(12L);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
    when(resultSet.getString("EXPORT_PERMIT_DETAIL_NUMBER")).thenReturn("7000123");
    when(resultSet.getString("PACKAGE_NUMBER")).thenReturn("PKG-100");
    when(resultSet.getString("CASCADE_SPLIT_CODE")).thenReturn("C");
    when(resultSet.wasNull()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findPermitScaleDetailsByApplicationNumber(1000456L);

    assertThat(rows)
        .extracting(
            "exportScaleDetailId",
            "timberMark",
            "exportSpeciesCode",
            "exportGradeCode",
            "speciesGradeVolume",
            "piecesCount",
            "applicationNumber",
            "exportPermitDetailNumber",
            "packageNumber")
        .containsExactly(
            tuple("101", "TM-1", "HE", "A", 7.5d, 12L, 1000456L, "7000123", "PKG-100"));
    verify(callableStatement).setString(1, "1000456");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  @SuppressWarnings("unchecked")
  void permitFeeScaleRowsShouldLoadScaleCodesAndAmvInOneDirectQuery() throws Exception {
    when(resultSet.getString(anyString()))
        .thenAnswer(
            invocation ->
                switch ((String) invocation.getArgument(0)) {
                  case "EXPORT_SCALE_DETAIL_ID" -> "101";
                  case "TIMBER_MARK" -> "TM-1";
                  case "EXPORT_SPECIES_CODE" -> "HE";
                  case "EXPORT_GRADE_CODE" -> "A";
                  case "EXPORT_PERMIT_DETAIL_NUMBER" -> "7000123";
                  case "PACKAGE_NUMBER" -> "PKG-100";
                  case "APPLICATION_PRODUCT_TYPE_CODE" -> "T";
                  case "SPECIES_DESCRIPTION" -> "Hemlock";
                  case "GRADE_DESCRIPTION" -> "Grade A";
                  case "PACKAGE_GROWTH_TYPE_CODE" -> "S";
                  case "PACKAGE_GROWTH_TYPE_DESCRIPTION" -> "Second Growth";
                  default -> null;
                });
    when(resultSet.getDouble("SPECIES_GRADE_VOLUME")).thenReturn(7.5d);
    when(resultSet.getLong("PIECES_COUNT")).thenReturn(12L);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
    when(resultSet.getBigDecimal("AVERAGE_MARKET_PRICE")).thenReturn(new java.math.BigDecimal("125.00"));
    when(resultSet.wasNull()).thenReturn(false);
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq(7000123L)))
        .thenAnswer(
            invocation ->
                List.of(
                    ((RowMapper<PermitRpcRepository.PermitFeeScaleRow>) invocation.getArgument(1))
                        .mapRow(resultSet, 0)));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findPermitFeeScaleRows(7000123L);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).applicationProductTypeCode()).isEqualTo("T");
    assertThat(rows.get(0).speciesDescription()).isEqualTo("Hemlock");
    assertThat(rows.get(0).averageMarketValue()).isEqualByComparingTo("125.00");
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq(7000123L));
    assertThat(sql.getValue())
        .contains("WITH SCALE_CONTEXT AS")
        .contains("FROM EXPORT_SCALE_DETAIL SD")
        .contains("EEA.EXPORT_PRODUCT_TYPE_CODE AS APPLICATION_PRODUCT_TYPE_CODE")
        .contains("NVL(SD.EXPORT_GRADE_CODE, ' ') AS AMV_GRADE_CODE")
        .contains("SCALE_AMV_DATE AS")
        .contains("MAX(ELA.EFFECTIVE_DATE) AS EFFECTIVE_DATE")
        .contains("LEFT JOIN EXPORT_LOG_AMV ELA")
        .contains("ELA.EFFECTIVE_DATE <= SC.PERMIT_APPLICATION_DATE")
        .contains("ELA.EXPORT_GRADE_CODE = SC.AMV_GRADE_CODE")
        .contains("WHEN P.APPLICATION_NUMBER IS NULL THEN EPD.EXPORT_GROWTH_TYPE_CODE")
        .contains("ELA.EXPORT_GROWTH_TYPE_CODE = SC.AMV_GROWTH_TYPE_CODE")
        .contains("WHERE SD.EXPORT_PERMIT_DETAIL_NUMBER = ?");
  }

  @Test
  @SuppressWarnings("unchecked")
  void corePackageContextsShouldUseOneDirectPermitQuery() {
    when(
            jdbcTemplate.query(
                any(String.class), any(RowMapper.class), eq(7000123L), eq(7000123L)))
        .thenReturn(List.of());
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findCorePackageContexts(7000123L, false)).isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sql.capture(), any(RowMapper.class), eq(7000123L), eq(7000123L));
    assertThat(sql.getValue())
        .contains("FROM EXPORT_PACKAGE P")
        .contains("LEFT JOIN EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("LEFT JOIN EXPORT_EXEMPTION EE")
        .contains("ASSIGNED_TO_PERMIT")
        .contains("TARGET_SCALE.EXPORT_PERMIT_DETAIL_NUMBER = ?")
        .contains("ORDER BY P.PACKAGE_NUMBER");
  }

  @Test
  @SuppressWarnings("unchecked")
  void coreScaleRowsShouldBindAllPackagesInOneQuery() {
    when(
            jdbcTemplate.query(
                any(String.class),
                any(RowMapper.class),
                eq("PKG-100"),
                eq("PKG-200"),
                eq(7000123L)))
        .thenReturn(List.of());
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(
            repository.findCoreScaleRows(
                List.of("PKG-200", "PKG-100", "PKG-100"), 7000123L, false))
        .isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(
            sql.capture(),
            any(RowMapper.class),
            eq("PKG-100"),
            eq("PKG-200"),
            eq(7000123L));
    assertThat(sql.getValue())
        .contains("WHERE SD.PACKAGE_NUMBER IN (?, ?)")
        .contains("SD.EXPORT_PERMIT_DETAIL_NUMBER IS NULL")
        .contains("OR SD.EXPORT_PERMIT_DETAIL_NUMBER = ?")
        .contains("ORDER BY SD.PACKAGE_NUMBER");
  }

  @Test
  @SuppressWarnings("unchecked")
  void coreEndUsesShouldBindApplicationsAndPackagesInOneQuery() {
    when(
            jdbcTemplate.query(
                any(String.class),
                any(RowMapper.class),
                eq(1000456L),
                eq(1000457L),
                eq("PKG-100")))
        .thenReturn(List.of());
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(
            repository.findCoreEndUseRows(
                List.of(1000457L, 1000456L), List.of("PKG-100")))
        .isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(
            sql.capture(),
            any(RowMapper.class),
            eq(1000456L),
            eq(1000457L),
            eq("PKG-100"));
    assertThat(sql.getValue())
        .contains("EEASE.APPLICATION_NUMBER IN (?, ?)")
        .contains("EEASE.PACKAGE_NUMBER IN (?)")
        .contains("'APPLICATION' AS ROW_KIND")
        .contains("'PACKAGE' AS ROW_KIND")
        .contains("'CANDIDATE' AS ROW_KIND");
  }

  @Test
  void inPredicateShouldChunkValuesAtTheOracleLimit() {
    String predicate = PermitRpcRepository.inPredicate("SD.PACKAGE_NUMBER", 3450);
    String[] groups = predicate.substring(1, predicate.length() - 1).split(" OR ");

    assertThat(groups).hasSize(4);
    assertThat(groups)
        .allSatisfy(
            group ->
                assertThat(group.chars().filter(character -> character == '?').count())
                    .isLessThanOrEqualTo(1000L));
    assertThat(groups[3].chars().filter(character -> character == '?').count())
        .isEqualTo(450L);
    assertThat(predicate.chars().filter(character -> character == '?').count()).isEqualTo(3450L);
    assertThat(predicate).startsWith("(SD.PACKAGE_NUMBER IN (").endsWith("))");
  }

  @Test
  void findAllCountryCodesShouldUseOracleRowsWhenAvailable() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString("CODE")).thenReturn("US", "NZ");
    when(resultSet.getString("DESCRIPTION")).thenReturn("United States", "New Zealand");
    when(resultSet.getLong("GROUP_BY")).thenReturn(2L, 2L);
    when(resultSet.getLong("ORDER_BY")).thenReturn(1L, 2L);
    when(resultSet.wasNull()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findAllCountryCodesRequired();

    assertThat(rows)
        .extracting("code", "description", "groupBy", "orderBy")
        .containsExactly(
            tuple("US", "United States", 2L, 1L),
            tuple("NZ", "New Zealand", 2L, 2L));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void findAllCountryCodesShouldPreserveLegitimateEmptyResult() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?) }");
    when(resultSet.next()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findAllCountryCodesRequired();

    assertThat(rows).isEmpty();
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void findAllCountryCodesShouldPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("country lookup unavailable");
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(failure);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(repository::findAllCountryCodesRequired).isSameAs(failure);
  }

  @Test
  void invoiceNumbersShouldPreserveLegitimateEmptyResult() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_INVOICES_BY_PERMIT(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findInvoiceNumbersByPermitRequired(7000123L)).isEmpty();
    verify(callableStatement).setString(1, "7000123");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void invoiceNumbersShouldPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("invoice lookup unavailable");
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_INVOICES_BY_PERMIT(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(failure);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findInvoiceNumbersByPermitRequired(7000123L))
        .isSameAs(failure);
  }

  @Test
  void contextualEndUseReadsShouldPropagateOracleFailure() {
    when(jdbcTemplate.execute(any(String.class), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findEndUsesByApplicationNumber(1000456L))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(() -> repository.findEndUsesByPackageNumber("PKG-1"))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(() -> repository.findCandidateExcolCodes(1, "HE", "LU", 11L))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void contextualEndUseReadsShouldPreserveLegitimateEmptyResults() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_END_USE_BY_APP(?,?) }", 2);
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_END_USE_BY_PACK(?,?) }", 2);
    stubCursorProcedure("{ call LEXIS_CODES.FIND_CANDIDATE_EXCOL_VALUES(?,?,?,?,?) }", 5);
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findEndUsesByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findEndUsesByPackageNumber("PKG-1")).isEmpty();
    assertThat(repository.findCandidateExcolCodes(1, "HE", "LU", 11L)).isEmpty();
  }

  @Test
  void feePolicyFactorShouldDefaultToZeroWhenOracleHasNoMatchingPolicy() {
    SQLException noDataFound = new SQLException("ORA-01403: no data found", "02000", 1403);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.GET_POLICY_FACTOR(?,?,?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(new DataIntegrityViolationException("No matching fee policy", noDataFound));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findFeePolicyPercentIncrease(LocalDate.of(2010, 12, 2), 1905L))
        .isEqualByComparingTo(BigDecimal.ZERO);
  }

  @Test
  void feePolicyFactorShouldPropagateOtherOracleFailures() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.GET_POLICY_FACTOR(?,?,?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(failure);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 1, 15), 1905L))
        .isSameAs(failure);
  }

  @Test
  void findProductTypeDescriptionShouldFallbackWhenCodePackageReturnsEmpty() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_PRODUCT_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findProductTypeDescription("T")).contains("Unmanufactured Timber");
    verify(callableStatement).setString(1, "T");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void permitAttachmentRelationshipShouldUseSubtypeCursor() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_5.FIND_PERMIT_FILE_ATTACHMENT(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPermitFileAttachmentRequired(55L)).isTrue();
    verify(callableStatement).setLong(1, 55L);
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);

    org.mockito.Mockito.reset(callableStatement, resultSet, jdbcTemplate);
    stubCursorProcedure(
        "{ call LEXIS_GROUP_5.FIND_PERMIT_FILE_ATTACHMENT(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);

    assertThat(repository.isPermitFileAttachmentRequired(56L)).isFalse();
  }

  @Test
  @SuppressWarnings("unchecked")
  void permitDocumentContextShouldLoadEveryDocumentRelationshipInOneQuery() throws Exception {
    when(resultSet.getString(anyString()))
        .thenAnswer(
            invocation ->
                switch ((String) invocation.getArgument(0)) {
                  case "FILE_NAME" -> "invoice.pdf";
                  case "DESCRIPTION" -> "Sales invoice";
                  case "EXPORT_ATTACHMENT_TYPE_CODE" -> "INV";
                  case "ATTACHMENT_TYPE_DESCRIPTION" -> "Invoice";
                  case "DOCUMENT_SOURCE" -> "invoice";
                  default -> null;
                });
    when(resultSet.getLong("EXPORT_ATTACHMENT_ID")).thenReturn(50L);
    when(resultSet.getLong("SOURCE_APPLICATION_NUMBER")).thenReturn(0L);
    when(resultSet.getLong("SOURCE_PERMIT_NUMBER")).thenReturn(7000123L);
    when(resultSet.getLong("DELETABLE")).thenReturn(1L);
    when(resultSet.wasNull()).thenReturn(false, true, false, false);
    when(
            jdbcTemplate.query(
                any(String.class),
                any(RowMapper.class),
                eq(7000123L),
                eq(7000123L),
                eq(7000123L)))
        .thenAnswer(
            invocation ->
                List.of(
                    ((RowMapper<PermitDocumentContextRow>) invocation.getArgument(1))
                        .mapRow(resultSet, 0)));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    List<PermitDocumentContextRow> rows = repository.findPermitDocumentContextRows(7000123L);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).documentRow().fileName()).isEqualTo("invoice.pdf");
    assertThat(rows.get(0).source()).isEqualTo("invoice");
    assertThat(rows.get(0).sourceApplicationNumber()).isNull();
    assertThat(rows.get(0).sourcePermitNumber()).isEqualTo(7000123L);
    assertThat(rows.get(0).deletable()).isTrue();
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(
            sql.capture(),
            any(RowMapper.class),
            eq(7000123L),
            eq(7000123L),
            eq(7000123L));
    assertThat(sql.getValue())
        .contains("WITH PERMIT_APPLICATIONS AS")
        .contains("FROM EXPORT_PERMIT_FILE_ATTACHMENT")
        .contains("FROM EXPORT_SALES_INVCE_FILE_ATTACH")
        .contains("INNER JOIN EXPORT_APPL_FILE_ATTCHMNT")
        .contains("LEFT JOIN EXPORT_ATTACHMENT_TYPE_CODE")
        .contains("INVALID_APPLICATION_RELATIONSHIP");
  }

  @Test
  @SuppressWarnings("unchecked")
  void permitDocumentContextShouldRejectInvalidPackageApplicationRelationship() {
    when(
            jdbcTemplate.query(
                any(String.class),
                any(RowMapper.class),
                eq(7000123L),
                eq(7000123L),
                eq(7000123L)))
        .thenReturn(
            List.of(
                new PermitDocumentContextRow(
                    new DocumentRow(0L, null, null, null),
                    null,
                    "INVALID_APPLICATION_RELATIONSHIP",
                    null,
                    null,
                    false)));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findPermitDocumentContextRows(7000123L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid application relationship");
  }

  @Test
  void permitAttachmentRelationshipShouldRejectMissingCursor() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_5.FIND_PERMIT_FILE_ATTACHMENT(?,?) }", 2);
    when(callableStatement.getObject(2)).thenReturn(null);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.isPermitFileAttachmentRequired(55L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("no permit attachment cursor");
  }

  @Test
  void permitAttachmentRelationshipShouldRejectDuplicateRows() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_5.FIND_PERMIT_FILE_ATTACHMENT(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, true);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.isPermitFileAttachmentRequired(55L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("duplicate permit attachment rows");
  }

  @Test
  void permitAttachmentRelationshipShouldPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("permit attachment lookup unavailable");
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_PERMIT_FILE_ATTACHMENT(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(failure);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.isPermitFileAttachmentRequired(55L)).isSameAs(failure);
  }

  @Test
  void requiredScaleCodeAndBoicMarkLookupsShouldUseOracleRows() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_SPECIES_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isSpeciesCodeValidRequired("HE")).isTrue();
    verify(callableStatement).setString(1, "HE");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);

    org.mockito.Mockito.reset(callableStatement, resultSet);
    stubCursorProcedure("{ call LEXIS_CODES.FIND_VALID_BOIC_TIMBER_MARK(?,?,?) }", 3);
    when(resultSet.next()).thenReturn(true, false);

    assertThat(repository.isValidBoicTimberMarkRequired("TM-1", "EX-1")).isTrue();
    verify(callableStatement).setString(1, "TM-1");
    verify(callableStatement).setString(2, "EX-1");
    verify(callableStatement).registerOutParameter(3, Types.REF_CURSOR);
  }

  @Test
  void requiredPermitValidationCodesShouldUseLegacyCodeProcedures() throws Exception {
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertRequiredCodeLookup(
        "{ call LEXIS_CODES.FIND_PERMIT_STATUS_CODE(?,?) }",
        "ACT",
        repository::isPermitStatusCodeValidRequired);
    assertRequiredCodeLookup(
        "{ call LEXIS_CODES.FIND_COUNTRY_CODE(?,?) }",
        "US",
        repository::isCountryCodeValidRequired);
    assertRequiredCodeLookup(
        "{ call LEXIS_CODES.FIND_PORT_CODE(?,?) }",
        "VA",
        repository::isPortCodeValidRequired);
    assertRequiredCodeLookup(
        "{ call LEXIS_CODES.FIND_SCALE_METHOD_CODE(?,?) }",
        "W",
        repository::isScaleMethodCodeValidRequired);
    assertRequiredCodeLookup(
        "{ call LEXIS_CODES.FIND_TRANSPORT_TYPE_CODE(?,?) }",
        "TRUCK",
        repository::isTransportTypeCodeValidRequired);
  }

  @Test
  void requiredMu44LookupShouldUseLegacyCountProcedureAndRejectMissingResult()
      throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.IS_PERMIT_MU44(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong("RESULTS_COUNT")).thenReturn(1L);
    when(resultSet.wasNull()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPermitMu44Required(7000123L)).isTrue();
    verify(callableStatement).setString(1, "7000123");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);

    org.mockito.Mockito.reset(callableStatement, resultSet);
    stubCursorProcedure("{ call LEXIS_GROUP_5.IS_PERMIT_MU44(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);

    assertThatThrownBy(() -> repository.isPermitMu44Required(7000123L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("MU44");
  }

  @Test
  void requiredPermitValidationCodeLookupShouldPropagateOracleFailure() {
    when(jdbcTemplate.execute(any(String.class), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.isPermitStatusCodeValidRequired("ACT"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void findGrowthTypeDescriptionShouldUseOracleRowWhenAvailable() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_GROWTH_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(2)).thenReturn("Oracle Second Growth");

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findGrowthTypeDescription("S")).contains("Oracle Second Growth");
    verify(callableStatement).setString(1, "S");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void findApplicationStatusCodeShouldUseRequiredApplicationLookup() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("EXPORT_APPLICATION_STATUS_CODE")).thenReturn("PMT");

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationStatusCodeByNumber(1000456L)).contains("PMT");
    verify(callableStatement).setString(1, "1000456");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void findApplicationInfoShouldMapTheAuthoritativeOicIndicator() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong(any(String.class)))
        .thenAnswer(
            invocation ->
                "APPLICATION_NUMBER".equals(invocation.getArgument(0)) ? 1000999L : 1835L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString(any(String.class)))
        .thenAnswer(
            invocation ->
                switch ((String) invocation.getArgument(0)) {
                  case "EXEMPTION_NUMBER" -> "EX-700";
                  case "REGION" -> "Cariboo Natural Resource Region";
                  case "ORG_UNIT_NAME" -> throw new java.sql.SQLException("Column not projected");
                  case "OIC_INDICATOR" -> "Y";
                  default -> null;
                });

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationInfoByNumber(1000999L))
        .get()
        .extracting("applicationNumber", "exemptionNumber", "regionName", "oicIndicator")
        .containsExactly(1000999L, "EX-700", "Cariboo Natural Resource Region", "Y");
    verify(callableStatement).setString(1, "1000999");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
    verify(resultSet, never()).getString("END_USE_SORT");
    verify(resultSet, never()).getString("ORG_UNIT_NAME");
  }

  @Test
  void insertPermitDetailShouldBindTheCheckedInThirtySevenArgumentContract()
      throws Exception {
    String call =
        "{ call LEXIS_GROUP_9.INSERT_PERMIT_DETAIL(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) }";
    stubCursorProcedure(call, 37);
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);
    PermitMutationRow row =
        new PermitMutationRow(
            null,
            "Destination",
            "Transport",
            LocalDate.of(2026, 4, 1),
            "Other port",
            LocalDate.of(2026, 4, 2),
            LocalDate.of(2026, 4, 3),
            null,
            "R-1",
            LocalDate.of(2026, 12, 31),
            12.5d,
            10L,
            4L,
            "FED-1",
            "Remarks",
            null,
            null,
            "TR",
            "W",
            "00000001",
            "01",
            "00000002",
            "02",
            "EX-700",
            1835L,
            "VA",
            "ACT",
            "S",
            "US",
            1.5d,
            "Override",
            99L,
            100L,
            20.5d,
            "T");

    assertThat(repository.insertPermitDetail(row, "idir\\jsmith")).isEmpty();

    verify(callableStatement).setString(1, "Destination");
    verify(callableStatement).setString(2, "Transport");
    verify(callableStatement)
        .setTimestamp(3, Timestamp.valueOf(LocalDate.of(2026, 4, 1).atStartOfDay()));
    verify(callableStatement).setString(4, "Other port");
    verify(callableStatement)
        .setTimestamp(5, Timestamp.valueOf(LocalDate.of(2026, 4, 2).atStartOfDay()));
    verify(callableStatement)
        .setTimestamp(6, Timestamp.valueOf(LocalDate.of(2026, 4, 3).atStartOfDay()));
    verify(callableStatement).setString(8, "R-1");
    verify(callableStatement)
        .setTimestamp(9, Timestamp.valueOf(LocalDate.of(2026, 12, 31).atStartOfDay()));
    verify(callableStatement).setDouble(10, 12.5d);
    verify(callableStatement).setLong(11, 10L);
    verify(callableStatement).setLong(12, 4L);
    verify(callableStatement).setString(13, "FED-1");
    verify(callableStatement).setString(14, "Remarks");
    verify(callableStatement).setString(15, "idir\\jsmith");
    verify(callableStatement).setTimestamp(eq(16), any(Timestamp.class));
    verify(callableStatement).setNull(17, Types.VARCHAR);
    verify(callableStatement).setNull(18, Types.TIMESTAMP);
    verify(callableStatement).setString(19, "TR");
    verify(callableStatement).setString(20, "W");
    verify(callableStatement).setString(21, "00000001");
    verify(callableStatement).setString(22, "01");
    verify(callableStatement).setString(23, "00000002");
    verify(callableStatement).setString(24, "02");
    verify(callableStatement).setString(25, "EX-700");
    verify(callableStatement).setLong(26, 1835L);
    verify(callableStatement).setString(27, "VA");
    verify(callableStatement).setString(28, "ACT");
    verify(callableStatement).setString(29, "US");
    verify(callableStatement).setString(30, "S");
    verify(callableStatement).setDouble(31, 1.5d);
    verify(callableStatement).setString(32, "Override");
    verify(callableStatement).setLong(33, 99L);
    verify(callableStatement).setLong(34, 100L);
    verify(callableStatement).setDouble(35, 20.5d);
    verify(callableStatement).setString(36, "T");
    verify(callableStatement).registerOutParameter(37, Types.REF_CURSOR);
    verify(callableStatement, never()).setNull(37, Types.TIMESTAMP);
    verify(callableStatement, never()).registerOutParameter(38, Types.REF_CURSOR);
  }

  @Test
  void requiredPermitApplicationRelationshipsShouldRejectMalformedRows() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_PERMIT(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(0L);
    when(resultSet.wasNull()).thenReturn(true);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid application relationship")
        .hasMessageContaining("permit 7000123");
  }

  @Test
  void requiredExemptionApplicationRelationshipsShouldBeSortedAndFailClosed()
      throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_APPLICATION_BY_EXEMPTION(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000457L, 1000456L);
    when(resultSet.wasNull()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .containsExactly(1000456L, 1000457L);
    verify(callableStatement).setString(1, "EX-700");

    org.mockito.Mockito.reset(callableStatement, resultSet);
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_APPLICATION_BY_EXEMPTION(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(0L);
    when(resultSet.wasNull()).thenReturn(true);

    assertThatThrownBy(
            () -> repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid application relationship")
        .hasMessageContaining("exemption EX-700");
  }

  @Test
  void requiredPackagesByExemptionShouldPropagateOracleFailure() {
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_EXMP(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findPackagesByExemptionNumberRequired("EX-700"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void requiredPackagesByExemptionShouldPreserveLegitimatelyEmptyCursor() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_EXMP(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findPackagesByExemptionNumberRequired("EX-700")).isEmpty();
    verify(callableStatement).setString(1, "EX-700");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void packagesByExemptionShouldMapRowsWithoutPermitNumberColumns() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_EXMP(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("PACKAGE_NUMBER")).thenReturn(" PKG-901 ");
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .extracting("applicationNumber", "packageNumber")
        .containsExactly(tuple(1000456L, "PKG-901"));
    verify(resultSet, never()).getLong("EXPORT_PERMIT_DETAIL_NUMBER");
    verify(resultSet, never()).getLong("EXPORT_PERMIT_NUMBER");
  }

  @Test
  void attachmentDeletesShouldPropagateOracleFailures() {
    when(jdbcTemplate.execute(any(String.class), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.deletePermitFile(11L))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(() -> repository.deleteApplicationFile(12L))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(() -> repository.deleteInvoiceFile(13L))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void attachmentOwnershipReadsShouldPropagateOracleFailures() {
    when(jdbcTemplate.execute(any(String.class), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findPermitDocumentDetailsByPermitNumber(7000123L))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () -> repository.findApplicationDocumentDetailsByApplicationNumber(1000456L))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(repository::findAllAttachmentTypes)
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(() -> repository.findAttachmentTypeDescription("INV"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void attachmentOwnershipReadsShouldPreserveLegitimateEmptyResults() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PERMIT_FILE_DETAILS(?,?) }", 2);
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_ATTACH_CODES(?) }");
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findPermitDocumentDetailsByPermitNumber(7000123L)).isEmpty();
    assertThat(repository.findAllAttachmentTypes()).isEmpty();
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void attachmentStreamShouldDistinguishOracleFailureFromTrueNotFound() throws Exception {
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_FILE_ATTACHMENT(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(callableStatement));
    when(callableStatement.getObject(2)).thenReturn(null);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.streamFileAttachment(44L, new ByteArrayOutputStream()))
        .isInstanceOf(java.io.IOException.class)
        .hasCauseInstanceOf(DataAccessResourceFailureException.class);

    when(callableStatement.getObject(2)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(false);
    assertThat(repository.streamFileAttachment(45L, new ByteArrayOutputStream())).isFalse();
  }

  @Test
  void requiredApplicationDocumentsShouldUseTheRequiredCursorLookup()
      throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_APPL_FILE_DETAILS(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong("EXPORT_ATTACHMENT_ID")).thenReturn(44L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("FILE_NAME")).thenReturn("application.pdf");
    when(resultSet.getString("DESCRIPTION")).thenReturn("supporting document");
    when(resultSet.getString("EXPORT_ATTACHMENT_TYPE_CODE")).thenReturn("INS");
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findApplicationDocumentDetailsByApplicationNumberRequired(1000456L))
        .extracting("id", "fileName", "attachmentTypeCode")
        .containsExactly(tuple(44L, "application.pdf", "INS"));
    verify(callableStatement).setLong(1, 1000456L);
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void requiredGbmsHistoryShouldBindPermitAndRejectInvoiceFallbackForAnotherPermit()
      throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_9.FIND_GBMS_INVOICE_HISTORY(?,?,?) }", 3);
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn("A000123", "A000122");
    when(resultSet.getString("CANCELLED_BY_INVOICE")).thenReturn(null, null);
    when(resultSet.getString("REPLACED_BY_INVOICE")).thenReturn(null, "A000123");
    when(resultSet.getLong("LEXIS_PERMIT_NUMBER")).thenReturn(7000123L, 7000999L);
    when(resultSet.getDouble("INVOICE_AMOUNT")).thenReturn(125.50d, 100.00d);
    when(resultSet.wasNull()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findGbmsInvoiceHistoryRequired("RN-42", 7000123L);

    assertThat(rows)
        .extracting("invoiceNumber", "replacedByInvoice", "invoiceAmount")
        .containsExactly(tuple("A000123", null, 125.50d));
    verify(callableStatement).setString(1, "RN-42");
    verify(callableStatement).setString(2, "7000123");
    verify(callableStatement).registerOutParameter(3, Types.REF_CURSOR);
  }

  @Test
  void displayGbmsHistoryShouldPreserveLegacyReceiptFallbackRows() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_9.FIND_GBMS_INVOICE_HISTORY(?,?,?) }", 3);
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn("A007321", "A007322");
    when(resultSet.getString("CANCELLED_BY_INVOICE")).thenReturn(null, "A007321");
    when(resultSet.getString("REPLACED_BY_INVOICE")).thenReturn("A007322", null);
    when(resultSet.getLong("LEXIS_PERMIT_NUMBER")).thenReturn(7000999L, 7000999L);
    when(resultSet.getDouble("INVOICE_AMOUNT")).thenReturn(-1939.50d, 1950.70d);
    when(resultSet.wasNull()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findGbmsInvoiceHistoryForDisplay("RN-42", 7000123L, false);

    assertThat(rows)
        .extracting("invoiceNumber", "cancelledByInvoice", "replacedByInvoice", "invoiceAmount")
        .containsExactly(
            tuple("A007321", null, "A007322", -1939.50d),
            tuple("A007322", "A007321", null, 1950.70d));
    verify(callableStatement).setString(1, "RN-42");
    verify(callableStatement).setString(2, "7000123");
    verify(callableStatement).registerOutParameter(3, Types.REF_CURSOR);
  }

  @Test
  void requiredGbmsHistoryShouldRejectInvalidPermitAndPropagateOracleFailure() {
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findGbmsInvoiceHistoryRequired(null, 0L))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("positive");

    when(jdbcTemplate.execute(any(String.class), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> repository.findGbmsInvoiceHistoryRequired(null, 7000123L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void requiredReadOnlyGbmsHistoryShouldPreserveGenuinelyEmptyHistory() throws Exception {
    stubCursorProcedure("{ call LEXIS_READ_ONLY.FIND_GBMS_INVOICE_HISTORY(?,?,?) }", 3);
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findGbmsInvoiceHistoryRequired("", 7000123L, true)).isEmpty();
    verify(callableStatement).setString(1, null);
    verify(callableStatement).setString(2, "7000123");
    verify(callableStatement).registerOutParameter(3, Types.REF_CURSOR);
  }

  @Test
  void requiredReadOnlyGbmsHistoryShouldPropagateOracleFailure() {
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_READ_ONLY.FIND_GBMS_INVOICE_HISTORY(?,?,?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Read-only history unavailable"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.findGbmsInvoiceHistoryRequired(null, 7000123L, true))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Read-only history unavailable");
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursorProcedure(String call) throws Exception {
    stubCursorProcedure(call, 1);
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursorProcedure(String call, int cursorIndex) throws Exception {
    when(jdbcTemplate.execute(eq(call), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback<?> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(callableStatement);
            });
    when(callableStatement.getObject(cursorIndex)).thenReturn(resultSet);
  }

  private void assertRequiredCodeLookup(
      String call,
      String code,
      java.util.function.Predicate<String> lookup)
      throws Exception {
    org.mockito.Mockito.reset(callableStatement, resultSet);
    stubCursorProcedure(call, 2);
    when(resultSet.next()).thenReturn(true, false);

    assertThat(lookup.test(code)).isTrue();
    verify(callableStatement).setString(1, code);
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }
}

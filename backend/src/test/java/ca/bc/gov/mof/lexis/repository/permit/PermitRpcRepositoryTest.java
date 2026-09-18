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
import ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
                anyString(), eq(Long.class), eq(" PKG-903 "), eq(7000123L), eq(7000123L)))
        .thenReturn(1L);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPackageAssignedToPermitRequired(" PKG-903 ", 7000123L)).isTrue();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .queryForObject(
            sql.capture(), eq(Long.class), eq(" PKG-903 "), eq(7000123L), eq(7000123L));
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
            tuple(" PKG-200 ", 1000456L, 20.0d, "ACT", "S"),
            tuple("PKG-100", 1000457L, 10.0d, "COM", "O"));
    verify(callableStatement).setString(1, "7000123");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void oicPackageListShouldPreserveDistinctCursorKeys() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_OIC_PERMIT(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, true, true, false);
    when(resultSet.getString("PACKAGE_NUMBER")).thenReturn("PKG-100  ", "PKG-100", "PKG-100  ");

    assertThat(new PermitRpcRepository(jdbcTemplate).findPackageNumbersByOicPermitNumber(7000123L))
        .containsExactly("PKG-100", "PKG-100  ");
  }

  @Test
  void packageScaleLookupShouldBindAndReturnTheExactKey() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_SCALE_DETAIL_BY_PKG(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(anyString())).thenReturn(null);
    when(resultSet.getString("PACKAGE_NUMBER")).thenReturn("PKG-100  ");

    assertThat(new PermitRpcRepository(jdbcTemplate).findScaleDetailsByPackageNumber("PKG-100  "))
        .extracting("packageNumber").containsExactly("PKG-100  ");
    verify(callableStatement).setString(1, "PKG-100  ");
  }

  @Test
  void firstPackageApplicationShouldPreserveLegacyCursorOrder() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_PERMIT(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString("PACKAGE_NUMBER")).thenReturn("PKG-200", "PKG-100");
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000457L, 1000456L);
    when(resultSet.wasNull()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findFirstPackageApplicationByPermitNumberRequired(7000123L))
        .contains(new PermitRpcRepository.PermitPackageApplicationRow("PKG-200", 1000457L));
    verify(callableStatement).setString(1, "7000123");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void firstPackageApplicationShouldReturnEmptyForAnEmptyCursor() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PACKAGES_BY_PERMIT(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findFirstPackageApplicationByPermitNumberRequired(7000123L)).isEmpty();
  }

  @Test
  void firstPackageApplicationShouldPropagateRequiredCursorFailures() {
    when(jdbcTemplate.execute(any(String.class), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.findFirstPackageApplicationByPermitNumberRequired(7000123L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
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
    assertThat(rows.get(0).scaleRow().cascadeSplitCode()).isNull();
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq(7000123L));
    String query = sql.getValue();
    assertThat(query)
        .contains("WITH SCALE_CONTEXT AS")
        .contains("FROM EXPORT_SCALE_DETAIL SD")
        .contains("LEFT JOIN TIMBER_MARK TM")
        .contains("TM.CASCADE_SPLIT_CODE")
        .doesNotContain("HARVESTING_HAULING_XREF")
        .doesNotContain("HARVESTING_AUTHORITY")
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
    String effectiveDateSelection =
        query.substring(
            query.indexOf("SCALE_AMV_DATE AS"),
            query.indexOf("GROUP BY SC.EXPORT_SCALE_DETAIL_ID"));
    assertThat(effectiveDateSelection)
        .doesNotContain("ELA.EXPORT_GROWTH_TYPE_CODE = SC.AMV_GROWTH_TYPE_CODE");
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
  void corePackageContextsShouldKeepDistinctStoredKeys() {
    var plain = new PermitRpcRepository.PermitCorePackageContextRow(
        new PermitRpcRepository.PermitCorePackageRow(
            "PKG-100", 1000456L, 10d, 1d, 1d, "ACT", null, "N", "S", "H"),
        null, "P", "B", null, null, null, null, null, false);
    var padded = new PermitRpcRepository.PermitCorePackageContextRow(
        new PermitRpcRepository.PermitCorePackageRow(
            "PKG-100  ", 1000456L, 20d, 1d, 1d, "ACT", null, "N", "S", "H"),
        null, "P", "B", null, null, null, null, null, true);
    when(jdbcTemplate.query(anyString(), any(RowMapper.class),
        eq(7000123L), eq(7000123L), eq(7000123L)))
        .thenReturn(List.of(padded, plain, padded));

    assertThat(new PermitRpcRepository(jdbcTemplate).findCorePackageContexts(7000123L, true))
        .containsExactly(plain, padded);
  }

  @Test
  @SuppressWarnings("unchecked")
  void bulkPackageLookupsShouldBindBothExactKeys() {
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("PKG-100"), eq("PKG-100  ")))
        .thenReturn(List.of());
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    repository.findCoreScaleRows(List.of("PKG-100  ", "PKG-100", "PKG-100  "), 7000123L, true);
    repository.findCoreEndUseRows(List.of(), List.of("PKG-100  ", "PKG-100", "PKG-100  "));

    verify(jdbcTemplate, org.mockito.Mockito.times(2))
        .query(anyString(), any(RowMapper.class), eq("PKG-100"), eq("PKG-100  "));
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void scaleAssignmentUpdateShouldRetainItsStoredPackageKey() throws Exception {
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class)))
        .thenAnswer(invocation -> ((CallableStatementCallback<?>) invocation.getArgument(1))
            .doInCallableStatement(callableStatement));
    var record = new PermitRpcRepository.ScaleMutationRecord(
        "103", "TM3", 7L, 12.5d, "PKG-903  ", "HE", "A", 7000123L,
        "idir\\jsmith", Timestamp.valueOf("2026-01-01 10:00:00"));

    assertThat(new PermitRpcRepository(jdbcTemplate).updateScaleDetail(record, "idir\\jsmith"))
        .isTrue();
    verify(callableStatement).setString(6, "PKG-903  ");
  }

  @Test
  void boicScaleInsertShouldBindAndVerifyTheExactPackageKey() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_9.INSERT_SCALE_DETAIL(?,?,?,?,?,?,?,?,?,?,?,?,?) }", 13);
    when(resultSet.next()).thenReturn(true, false, true, false);
    when(resultSet.getString(anyString())).thenReturn(null);
    when(resultSet.getLong(anyString())).thenReturn(0L);
    when(resultSet.getString("EXPORT_SCALE_DETAIL_ID")).thenReturn("103");
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000999L);
    when(resultSet.getString("EXPORT_PERMIT_DETAIL_NUMBER")).thenReturn("7000123");
    when(resultSet.getString("PACKAGE_NUMBER")).thenReturn("PKG-903  ", "PKG-903");
    var record = new PermitRpcRepository.BoicScaleMutationRecord(
        "TM3", 7L, 12.5d, "PKG-903  ", "HE", "A", 1000999L, 7000123L, null,
        "idir\\jsmith", Timestamp.valueOf("2026-01-01 10:00:00"));
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.insertBoicScaleDetail(record)).isPresent();
    assertThat(repository.insertBoicScaleDetail(record)).isEmpty();
    verify(callableStatement, org.mockito.Mockito.times(2)).setString(8, "PKG-903  ");
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
        .contains("LEFT JOIN TIMBER_MARK TM")
        .contains("TM.CASCADE_SPLIT_CODE")
        .doesNotContain("HARVESTING_HAULING_XREF")
        .doesNotContain("HARVESTING_AUTHORITY")
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
  @SuppressWarnings("unchecked")
  void findAllCountryCodesShouldPreserveDirectRowOrderDuplicatesAndMetadata() throws Exception {
    when(resultSet.getString("CODE")).thenReturn(" US ", "NZ", " US ");
    when(resultSet.getString("DESCRIPTION"))
        .thenReturn(" United States ", "New Zealand", " United States ");
    when(resultSet.getLong("GROUP_BY")).thenReturn(2L, 1L, 2L);
    when(resultSet.getLong("ORDER_BY")).thenReturn(3L, 2L, 3L);
    when(resultSet.wasNull()).thenReturn(false);
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<PermitRpcRepository.CountryCodeRow> mapper = invocation.getArgument(1);
              return List.of(
                  mapper.mapRow(resultSet, 0),
                  mapper.mapRow(resultSet, 1),
                  mapper.mapRow(resultSet, 2));
            });

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findAllCountryCodesRequired();

    assertThat(rows)
        .extracting("code", "description", "groupBy", "orderBy")
        .containsExactly(
            tuple("US", "United States", 2L, 3L),
            tuple("NZ", "New Zealand", 1L, 2L),
            tuple("US", "United States", 2L, 3L));
    ArgumentCaptor<Object[]> bindCaptor = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate)
        .query(eq(LexisCodeQueries.ACTIVE_COUNTRIES), any(RowMapper.class), bindCaptor.capture());
    assertThat(bindCaptor.getValue()).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void findAllCountryCodesShouldDefaultNullOrderingAndFilterMissingCodeOrDescription()
      throws Exception {
    when(resultSet.getString("CODE")).thenReturn(" US ", " ", "CA", "NZ");
    when(resultSet.getString("DESCRIPTION"))
        .thenReturn(" United States ", "Missing code", " ", null);
    when(resultSet.wasNull()).thenReturn(true);
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<PermitRpcRepository.CountryCodeRow> mapper = invocation.getArgument(1);
              return List.of(
                  mapper.mapRow(resultSet, 0),
                  mapper.mapRow(resultSet, 1),
                  mapper.mapRow(resultSet, 2),
                  mapper.mapRow(resultSet, 3));
            });
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findAllCountryCodesRequired())
        .extracting("code", "description", "groupBy", "orderBy")
        .containsExactly(tuple("US", "United States", 0L, 0L));
  }

  @Test
  @SuppressWarnings("unchecked")
  void findAllCountryCodesShouldPreserveLegitimateEmptyResult() {
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of());

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findAllCountryCodesRequired();

    assertThat(rows).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void findAllCountryCodesShouldPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("country lookup unavailable");
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenThrow(failure);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(repository::findAllCountryCodesRequired).isSameAs(failure);
  }

  @ParameterizedTest
  @ValueSource(strings = {"CODE", "DESCRIPTION", "GROUP_BY", "ORDER_BY"})
  @SuppressWarnings("unchecked")
  void findAllCountryCodesShouldFailWhenARequiredColumnCannotBeRead(String column) throws Exception {
    SQLException failure = new SQLException("Missing " + column);
    if (!column.equals("CODE")) {
      when(resultSet.getString("CODE")).thenReturn("US");
    }
    if (column.equals("GROUP_BY") || column.equals("ORDER_BY")) {
      when(resultSet.getString("DESCRIPTION")).thenReturn("United States");
    }
    if (column.equals("ORDER_BY")) {
      when(resultSet.getLong("GROUP_BY")).thenReturn(1L);
    }
    if (column.equals("CODE") || column.equals("DESCRIPTION")) {
      when(resultSet.getString(column)).thenThrow(failure);
    } else {
      when(resultSet.getLong(column)).thenThrow(failure);
    }
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<PermitRpcRepository.CountryCodeRow> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThatThrownBy(repository::findAllCountryCodesRequired)
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining(column)
        .hasCause(failure);
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
  void requiredPermitValidationCodesShouldUseBoundDirectQueries() throws Exception {
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertRequiredCodeLookup(
        LexisCodeQueries.PERMIT_STATUS_BY_CODE,
        "ACT",
        repository::isPermitStatusCodeValidRequired);
    assertRequiredCodeLookup(
        LexisCodeQueries.COUNTRY_BY_CODE,
        "US",
        repository::isCountryCodeValidRequired);
    assertRequiredCodeLookup(
        LexisCodeQueries.SCALE_METHOD_BY_CODE,
        "W",
        repository::isScaleMethodCodeValidRequired);
    assertRequiredCodeLookup(
        LexisCodeQueries.TRANSPORT_TYPE_BY_CODE,
        "TRUCK",
        repository::isTransportTypeCodeValidRequired);
  }

  @Test
  @SuppressWarnings("unchecked")
  void portValidationShouldBindTheCodeAndAcceptHistoricalRows() {
    when(jdbcTemplate.query(eq(LexisCodeQueries.PORT_BY_CODE), any(RowMapper.class), eq("VA")))
        .thenAnswer(invocation -> {
          RowMapper<Boolean> mapper = invocation.getArgument(1);
          return List.of(mapper.mapRow(resultSet, 0));
        });
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPortCodeValidRequired(" VA ")).isTrue();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq("VA"));
    assertThat(sql.getValue())
        .contains("FROM THE.EXPORT_PORT_OF_EXPORT_CODE C")
        .contains("WHERE C.EXPORT_PORT_OF_EXPORT_CODE = ?")
        .doesNotContain("SYSDATE", "ORDER BY");
    verify(jdbcTemplate, never()).execute(anyString(), any(CallableStatementCallback.class));
  }

  @Test
  void portValidationShouldSkipBlankInputs() {
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPortCodeValidRequired(null)).isFalse();
    assertThat(repository.isPortCodeValidRequired(" ")).isFalse();
    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  @SuppressWarnings("unchecked")
  void portValidationShouldDistinguishUnknownCodesFromDatabaseFailures() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(LexisCodeQueries.PORT_BY_CODE), any(RowMapper.class), eq("VA")))
        .thenReturn(List.of())
        .thenThrow(failure);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.isPortCodeValidRequired("VA")).isFalse();
    assertThatThrownBy(() -> repository.isPortCodeValidRequired("VA")).isSameAs(failure);
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
  @SuppressWarnings("unchecked")
  void requiredPermitValidationCodeLookupShouldPropagateOracleFailure() {
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.PERMIT_STATUS_BY_CODE), any(RowMapper.class), eq("ACT")))
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
        .containsExactly(tuple(1000456L, " PKG-901 "));
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
  }

  @Test
  void attachmentOwnershipReadsShouldPreserveLegitimateEmptyResults() throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_5.FIND_PERMIT_FILE_DETAILS(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findPermitDocumentDetailsByPermitNumber(7000123L)).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentTypesShouldKeepHistoricalRowsAndMapOptionalOrderMetadata() throws Exception {
    when(resultSet.getString("CODE")).thenReturn(" INV ", " ", "OTH", "TXT");
    when(resultSet.getString("DESCRIPTION"))
        .thenReturn(" Invoice ", "Blank code", null, "Plain text");
    when(resultSet.wasNull()).thenReturn(true);
    when(jdbcTemplate.query(eq(LexisCodeQueries.ATTACHMENT_TYPES), any(RowMapper.class)))
        .thenAnswer(invocation -> {
          RowMapper<PermitRpcRepository.AttachmentTypeRow> mapper = invocation.getArgument(1);
          return List.of(
              mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1),
              mapper.mapRow(resultSet, 2), mapper.mapRow(resultSet, 3));
        });
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findAllAttachmentTypes())
        .extracting("code", "description", "groupBy", "orderBy")
        .containsExactly(tuple("INV", "Invoice", 0L, 0L), tuple("TXT", "Plain text", 0L, 0L));
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class));
    assertThat(sql.getValue())
        .contains("FROM THE.EXPORT_ATTACHMENT_TYPE_CODE C", "NULL AS ORDER_BY", "NULL AS GROUP_BY")
        .doesNotContain("WHERE", "SYSDATE", "ORDER BY");
    verify(jdbcTemplate, never()).execute(anyString(), any(CallableStatementCallback.class));
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentTypeQueriesShouldKeepEmptyResultsAndPropagateFailures() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(LexisCodeQueries.ATTACHMENT_TYPES), any(RowMapper.class)))
        .thenReturn(List.of())
        .thenThrow(failure);
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ATTACHMENT_TYPE_BY_CODE), any(RowMapper.class), eq("INV")))
        .thenReturn(List.of())
        .thenThrow(failure);
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findAllAttachmentTypes()).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("INV")).isEmpty();
    assertThatThrownBy(repository::findAllAttachmentTypes).isSameAs(failure);
    assertThatThrownBy(() -> repository.findAttachmentTypeDescription("INV")).isSameAs(failure);
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentDescriptionShouldBindNormalizedInputAndPreserveNullFirstRow() throws Exception {
    when(resultSet.getString("DESCRIPTION")).thenReturn(" Invoice ", null, " Later ");
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ATTACHMENT_TYPE_BY_CODE), any(RowMapper.class), eq("INV")))
        .thenAnswer(invocation -> {
          RowMapper<String> mapper = invocation.getArgument(1);
          return java.util.Collections.singletonList(mapper.mapRow(resultSet, 0));
        })
        .thenAnswer(invocation -> {
          RowMapper<String> mapper = invocation.getArgument(1);
          return java.util.Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
        });
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription(" INV ")).contains("Invoice");
    assertThat(repository.findAttachmentTypeDescription("INV")).isEmpty();
    assertThat(LexisCodeQueries.ATTACHMENT_TYPE_BY_CODE)
        .contains("WHERE C.EXPORT_ATTACHMENT_TYPE_CODE = ?")
        .doesNotContain("SYSDATE", "ORDER BY");
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentDescriptionShouldRetainOptionalColumnCompatibility() throws Exception {
    when(resultSet.getString("DESCRIPTION")).thenThrow(new SQLException("Invalid column name"));
    when(jdbcTemplate.query(
            eq(LexisCodeQueries.ATTACHMENT_TYPE_BY_CODE), any(RowMapper.class), eq("INV")))
        .thenAnswer(invocation -> {
          RowMapper<String> mapper = invocation.getArgument(1);
          return java.util.Collections.singletonList(mapper.mapRow(resultSet, 0));
        });

    assertThat(new PermitRpcRepository(jdbcTemplate).findAttachmentTypeDescription("INV"))
        .isEmpty();
  }

  @Test
  void attachmentDescriptionShouldSkipBlankInputs() {
    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription(null)).isEmpty();
    assertThat(repository.findAttachmentTypeDescription(" ")).isEmpty();
    verifyNoInteractions(jdbcTemplate);
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

  @SuppressWarnings("unchecked")
  private void assertRequiredCodeLookup(
      String sql,
      String code,
      java.util.function.Predicate<String> lookup)
      throws Exception {
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), eq(code)))
        .thenAnswer(
            invocation -> {
              RowMapper<Boolean> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });

    assertThat(lookup.test(" " + code + " ")).isTrue();
    verify(jdbcTemplate).query(eq(sql), any(RowMapper.class), eq(code));
    verifyNoInteractions(resultSet);
  }
}

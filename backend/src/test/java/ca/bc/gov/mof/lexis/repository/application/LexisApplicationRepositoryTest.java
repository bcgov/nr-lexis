package ca.bc.gov.mof.lexis.repository.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | LexisApplicationRepository")
class LexisApplicationRepositoryTest {

  @Test
  @SuppressWarnings("unchecked")
  void accessLookupShouldUseOneNarrowApplicationQuery() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ApplicationAccessContextDto access =
        new ApplicationAccessContextDto(900123L, "P", 1904L, "00077881", "00055667");
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq(900123L)))
        .thenAnswer(
            invocation -> {
              RowMapper<ApplicationAccessContextDto> rowMapper = invocation.getArgument(1);
              ResultSet resultSet = mock(ResultSet.class);
              when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(900123L);
              when(resultSet.getString("EXPORT_JURISDICTION_CODE")).thenReturn("P");
              when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1904L);
              when(resultSet.getString("OWNER_CLIENT_NUMBER")).thenReturn("00077881");
              when(resultSet.getString("AGENT_CLIENT_NUMBER")).thenReturn("00055667");
              return List.of(rowMapper.mapRow(resultSet, 0));
            });
    LexisApplicationRepository repository = new LexisApplicationRepository(jdbcTemplate);

    assertThat(repository.findAccessByApplicationNumber(900123L)).contains(access);

    verify(jdbcTemplate)
        .query(
            argThat(
                sql ->
                    sql.contains("FROM EXPORT_EXEMPTION_APPLICATION")
                        && sql.contains("EXPORT_JURISDICTION_CODE")
                        && sql.contains("ORG_UNIT_NO")
                        && sql.contains("OWNER_CLIENT_NUMBER")
                        && sql.contains("AGENT_CLIENT_NUMBER")
                        && !sql.contains("EXPORT_PACKAGE")
                        && !sql.contains("EXPORT_PURCHASE_OFFER")),
            any(RowMapper.class),
            eq(900123L));
  }

  @Test
  void loadExemptionReasonOptionsShouldUseLegacyProcedureName() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    assertThat(repository.loadExemptionReasonOptions())
        .containsExactly(new CodeNameDto("U", "Utilization"));
    assertThat(repository.codeNameProcedureSignature())
        .isEqualTo("LEXIS_CODES.FIND_ALL_EXEMPT_RSN_CODES(?)");
  }

  @Test
  void searchShouldUseDirectQueryForEveryFilter() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            "900123",
            "PKG-1",
            "EX-1",
            "B",
            "APP",
            "00077881",
            "00055667",
            "H",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            31916L,
            List.of(1904L, 1905L),
            false,
            "listingDate DESC",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("TO_CHAR(v.APPLICATION_NUMBER) LIKE '%' || ? || '%'")
        .contains("v.PACKAGE_NUMBER LIKE '%' || ? || '%'")
        .contains("v.EXEMPTION_NUMBER LIKE '%' || ? || '%'")
        .contains("v.EXPORT_APPLICATION_STATUS_CODE = ?")
        .contains("v.EXPORT_PRODUCT_TYPE_CODE = ?")
        .contains("v.RECEIVED_DATE >= ?")
        .contains("v.RECEIVED_DATE <= ?")
        .contains("v.ADVERTISING_DATE >= ?")
        .contains("v.ADVERTISING_DATE <= ?")
        .contains("v.EXPORT_SCHEDULE_ID = ?")
        .contains("v.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%'")
        .contains("v.ORG_UNIT_NO IN (?, ?)")
        .contains("v.EXPORT_EXEMPTION_TYPE_CODE = ?")
        .contains("v.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%'")
        .contains("v.EXPORT_JURISDICTION_CODE <> 'F'")
        .contains("v.OIC_INDICATOR = ?")
        .contains("ORDER BY v.ADVERTISING_DATE DESC, v.APPLICATION_NUMBER ASC")
        .doesNotContain("EEA.")
        .doesNotContain("EP.")
        .doesNotContain("ES.")
        .doesNotContain(":1");
    assertThat(repository.pageSelectSql())
        .contains("FROM EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("LISTAGG(EP.PACKAGE_NUMBER, ',')")
        .contains("INNER JOIN EXPORT_APPLICATION_STATUS_CODE EASC")
        .contains("INNER JOIN EXPORT_EXEMPTION_REASON_CODE EERC")
        .contains("INNER JOIN EXPORT_APPLICANT_TYPE_CODE EATC")
        .contains("FROM EXPORT_PURCHASE_OFFER EPO")
        .contains("EPO.VALID_OFFER_INDICATOR = 'Y'")
        .contains("EPO.OFFER_WITHDRAWAL_DATE IS NULL")
        .doesNotContain("FIND_APPLICATIONS_BY_CRITERIA");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "EX-1",
            "APP",
            "H",
            java.sql.Date.valueOf("2026-01-01"),
            java.sql.Date.valueOf("2026-01-31"),
            java.sql.Date.valueOf("2026-02-01"),
            java.sql.Date.valueOf("2026-02-28"),
            31916L,
            "00077881",
            "N",
            1904L,
            1905L,
            "B",
            "00055667",
            "00055667");
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql()).doesNotContain("EEA.ORG_UNIT_NO");
    assertThat(repository.whereSql()).doesNotContain("v.ORG_UNIT_NO");
    assertThat(repository.bindValues()).containsExactly("N");
  }

  @Test
  void scopedClientSearchShouldMatchOwnerOrAgentRegardlessOfApplicantType() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            "00012345",
            null,
            null,
            null,
            null,
            null,
            List.of(),
            true,
            null,
            0,
            10));

    assertThat(repository.whereSql())
        .contains("v.OWNER_CLIENT_NUMBER LIKE")
        .contains("v.AGENT_CLIENT_NUMBER LIKE")
        .doesNotContain("v.EXPORT_APPLICANT_TYPE_CODE");
    assertThat(repository.bindValues()).containsExactly("N", "00012345", "00012345");
  }

  @Test
  void searchShouldLoadRequestedDirectPageWithCountTotal() {
    List<LexisApplicationSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(900101L, 900111L)
            .mapToObj(LexisApplicationRepositoryTest::applicationResult)
            .toList();
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository(rows);

    Page<LexisApplicationSearchResultDto> results =
        repository.search(
            new LexisApplicationSearchCriteria(
                null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(LexisApplicationSearchResultDto::application)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 10, 25, 50, 100, 200})
  void searchShouldUseTwoDatabaseCallsForPageSizesThroughTwoHundred(int pageSize) {
    List<LexisApplicationSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(900001L, 900200L)
            .mapToObj(LexisApplicationRepositoryTest::applicationResult)
            .toList();
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository(rows);

    Page<LexisApplicationSearchResultDto> results =
        repository.search(emptyCriteria(null, 0, pageSize));

    assertThat(results.getNumberOfElements()).isEqualTo(pageSize);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @ParameterizedTest
  @CsvSource(
      delimiter = '|',
      textBlock = """
          applicationNumber DESC|ORDER BY v.APPLICATION_NUMBER DESC
          application DESC|ORDER BY v.APPLICATION_NUMBER DESC
          applicantClientNumber ASC|ORDER BY v.APPLICANT_CLIENT_NUMBER ASC, v.APPLICATION_NUMBER ASC
          displayOwnerClientNumber DESC|ORDER BY v.OWNER_CLIENT_NUMBER DESC, v.APPLICATION_NUMBER ASC
          ownerClientNumber ASC|ORDER BY v.OWNER_CLIENT_NUMBER ASC, v.APPLICATION_NUMBER ASC
          exemptionNumber DESC|ORDER BY v.EXEMPTION_NUMBER DESC, v.APPLICATION_NUMBER ASC
          listingDate ASC|ORDER BY v.ADVERTISING_DATE ASC, v.APPLICATION_NUMBER ASC
          regionCode DESC|ORDER BY v.REGION_CODE DESC, v.APPLICATION_NUMBER ASC
          region ASC|ORDER BY v.REGION_CODE ASC, v.APPLICATION_NUMBER ASC
          """)
  void searchShouldWhitelistEverySupportedSort(String sortField, String expectedOrder) {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(emptyCriteria(sortField, 0, 10));

    assertThat(repository.whereSql()).contains(expectedOrder);
  }

  @Test
  void searchShouldRejectUnrecognizedSortExpressions() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(emptyCriteria("applicationNumber DESC NULLS FIRST; DELETE", 0, 10));

    assertThat(repository.whereSql())
        .endsWith("ORDER BY v.APPLICATION_NUMBER ASC")
        .doesNotContain("DELETE")
        .doesNotContain("NULLS FIRST");
  }

  @Test
  void countShouldUseTheSameFiltersWithoutPageSortOrOfferLookup() {
    TestLexisApplicationRepository repository =
        new TestLexisApplicationRepository(List.of(applicationResult(900001L)));
    LexisApplicationSearchCriteria criteria =
        new LexisApplicationSearchCriteria(
            null,
            "PKG-1",
            null,
            null,
            null,
            null,
            "00012345",
            null,
            null,
            null,
            null,
            null,
            List.of(1904L),
            true,
            "listingDate DESC",
            0,
            10);

    repository.search(criteria);
    String pageWhere = repository.whereSql();
    List<Object> pageBinds = repository.bindValues();
    repository.count(criteria);

    assertThat(repository.countSelectSql())
        .contains("SELECT COUNT(*)")
        .contains("FROM EXPORT_EXEMPTION_APPLICATION EEA")
        .doesNotContain("EXPORT_PURCHASE_OFFER");
    assertThat(repository.countWhereSql())
        .isEqualTo(pageWhere.substring(0, pageWhere.indexOf(" ORDER BY")))
        .doesNotContain("OFFSET")
        .doesNotContain("FETCH NEXT");
    assertThat(repository.countBindValues()).isEqualTo(pageBinds);
  }

  @Test
  void searchShouldUseKnownTotalWithoutCallingCount() {
    TestLexisApplicationRepository repository =
        new TestLexisApplicationRepository(
            java.util.stream.LongStream.rangeClosed(900001L, 900011L)
                .mapToObj(LexisApplicationRepositoryTest::applicationResult)
                .toList());

    Page<LexisApplicationSearchResultDto> results =
        repository.search(emptyCriteria(null, 1, 10), 11);

    assertThat(results.getContent())
        .extracting(LexisApplicationSearchResultDto::application)
        .containsExactly(900011L);
    assertThat(repository.countCalls()).isZero();
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void mapRemarkRowShouldUseLegacyRemarkNumberColumn() throws Exception {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();
    ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
    Timestamp entryTimestamp = Timestamp.valueOf("2026-06-17 08:30:00");
    when(rs.getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR")).thenReturn(88L);
    when(rs.wasNull()).thenReturn(false);
    when(rs.getString("REMARK")).thenReturn("Admin note");
    when(rs.getString("ENTRY_USERID")).thenReturn("idir\\admin");
    when(rs.getTimestamp("ENTRY_TIMESTAMP")).thenReturn(entryTimestamp);

    LexisApplicationDetailDto.LexisRemarkDto remark = repository.mapRemarkRow(rs);

    assertThat(remark.remarkId()).isEqualTo(88L);
    assertThat(remark.remark()).isEqualTo("Admin note");
    assertThat(remark.user()).isEqualTo("idir\\admin");
    assertThat(remark.date()).isEqualTo(LocalDate.of(2026, 6, 17));
    verify(rs).getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR");
  }

  @Test
  void detailShouldKeepAnEmptyApplicationCursorAsNotFound() {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(null, false);

    assertThat(repository.findByApplicationNumber(900123L)).isEmpty();
  }

  @Test
  void detailShouldPreserveLegitimatelyEmptyChildCursors() {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(null, true);

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .satisfies(
            detail -> {
              assertThat(detail.packages()).isEmpty();
              assertThat(detail.remarks()).isEmpty();
              assertThat(detail.offers()).isEmpty();
              assertThat(detail.teacMeetingDate()).isNull();
            });
  }

  @Test
  void detailShouldMapLegacyLatestUserIdAsAuthor() {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(null, true);

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .extracting(LexisApplicationDetailDto::author)
        .isEqualTo("idir\\application-editor");
  }

  @Test
  void detailShouldSortRemarksByLegacyRemarkNumber() {
    LexisApplicationRepository repository = new RemarkOrderingLexisApplicationRepository();

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .satisfies(
            detail ->
                assertThat(detail.remarks())
                    .extracting(LexisApplicationDetailDto.LexisRemarkDto::remarkId)
                    .containsExactly(10L, 20L));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)",
        "LEXIS_CODES.FIND_SCHEDULE_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_SCALE_DETAIL_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_PACKAGES_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_REMARKS_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_PURCHASE_OFFERS_BY_APP(?,?)"
      })
  void detailShouldPropagateAuthoritativeCursorFailures(String failingProcedure) {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(failingProcedure, true);

    assertThatThrownBy(() -> repository.findByApplicationNumber(900123L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining(failingProcedure);
  }

  @Test
  void validOfferCheckShouldPropagateOracleFailure() {
    LexisApplicationRepository repository = new OfferReadLexisApplicationRepository(true);

    assertThatThrownBy(() -> repository.hasValidOffer(List.of(900123L)))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("purchase offers unavailable");
  }

  @Test
  void validOfferCheckShouldPreserveLegitimatelyEmptyOfferCursor() {
    LexisApplicationRepository repository = new OfferReadLexisApplicationRepository(false);

    assertThat(repository.hasValidOffer(List.of(900123L))).isFalse();
  }

  @Test
  void searchMappingShouldUseInlineOfferFlagWithoutPerRowProcedureCalls() throws SQLException {
    ResultSet noOffer = applicationSearchResultSet(900101L, 0L);
    ResultSet activeOffer = applicationSearchResultSet(900102L, 1L);
    MappingLexisApplicationRepository repository =
        new MappingLexisApplicationRepository(List.of(noOffer, activeOffer));

    Page<LexisApplicationSearchResultDto> results =
        repository.search(emptyCriteria(null, 0, 200));

    assertThat(results.getContent())
        .extracting(
            LexisApplicationSearchResultDto::application,
            LexisApplicationSearchResultDto::showCheckbox,
            LexisApplicationSearchResultDto::exemptionTypeDescription)
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple(900101L, true, "Ministerial"),
            org.assertj.core.groups.Tuple.tuple(900102L, false, "Ministerial"));
    assertThat(repository.cursorCalls()).isZero();
    assertThat(repository.databaseCalls()).isEqualTo(2);
  }

  private static LexisApplicationSearchCriteria emptyCriteria(
      String sortField, int page, int size) {
    return new LexisApplicationSearchCriteria(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        List.of(),
        false,
        sortField,
        page,
        size);
  }

  private static LexisApplicationSearchResultDto applicationResult(long applicationNumber) {
    return new LexisApplicationSearchResultDto(
        applicationNumber,
        "New",
        "Client",
        "00000001",
        null,
        null,
        "Region",
        100d,
        true,
        false,
        null);
  }

  private static ResultSet applicationSearchResultSet(long applicationNumber, long activeOffer)
      throws SQLException {
    ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(applicationNumber);
    when(resultSet.getLong("HAS_ACTIVE_VALID_OFFER")).thenReturn(activeOffer);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("EXPORT_APPLICATION_STATUS_CODE")).thenReturn("APP");
    when(resultSet.getString("EXPORT_PRODUCT_TYPE_CODE")).thenReturn("H");
    when(resultSet.getString("OWNER_CLIENT_NUMBER")).thenReturn("00000001");
    when(resultSet.getString("STATUS_DESCRIPTION")).thenReturn("Approved");
    when(resultSet.getString("EXEMPTION_TYPE_DESCRIPTION")).thenReturn("Ministerial");
    return resultSet;
  }

  private static final class TestLexisApplicationRepository extends LexisApplicationRepository {
    private final List<?> rows;
    private String whereSql;
    private List<Object> bindValues;
    private String pageSelectSql;
    private String countSelectSql;
    private String countWhereSql;
    private List<Object> countBindValues;
    private String codeNameProcedureSignature;
    private int countCalls;
    private int pageCalls;

    TestLexisApplicationRepository() {
      this(List.of());
    }

    TestLexisApplicationRepository(List<?> rows) {
      super(null);
      this.rows = rows;
    }

    String whereSql() {
      return whereSql;
    }

    List<Object> bindValues() {
      return bindValues;
    }

    String pageSelectSql() {
      return pageSelectSql;
    }

    String countSelectSql() {
      return countSelectSql;
    }

    String countWhereSql() {
      return countWhereSql;
    }

    List<Object> countBindValues() {
      return countBindValues;
    }

    int countCalls() {
      return countCalls;
    }

    int pageCalls() {
      return pageCalls;
    }

    String codeNameProcedureSignature() {
      return codeNameProcedureSignature;
    }

    @Override
    protected List<CodeNameDto> loadCodeNameOptions(String procedureSignature) {
      codeNameProcedureSignature = procedureSignature;
      return List.of(new CodeNameDto("U", "Utilization"));
    }

    @Override
    protected List<CodeNameDto> loadCodeNameOptionsRequired(String procedureSignature) {
      return loadCodeNameOptions(procedureSignature);
    }

    @Override
    protected int queryDirectCount(String selectSql, DirectSql where) {
      countSelectSql = selectSql;
      countWhereSql = where.sql();
      countBindValues = where.bindValues();
      countCalls++;
      return rows.size();
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Page<T> queryDirectPage(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      pageSelectSql = selectSql;
      whereSql = whereAndOrder.sql();
      bindValues = whereAndOrder.bindValues();
      pageCalls++;
      int normalizedPage = Math.max(0, page);
      int normalizedSize = Math.max(1, size);
      int fromIndex = Math.min(rows.size(), normalizedPage * normalizedSize);
      int toIndex = Math.min(rows.size(), fromIndex + normalizedSize);
      List<T> content = (List<T>) rows.subList(fromIndex, toIndex);
      return new PageImpl<>(
          content, PageRequest.of(normalizedPage, normalizedSize), totalElements);
    }
  }

  private static final class MappingLexisApplicationRepository
      extends LexisApplicationRepository {
    private final List<ResultSet> resultSets;
    private int databaseCalls;
    private int cursorCalls;

    MappingLexisApplicationRepository(List<ResultSet> resultSets) {
      super(null);
      this.resultSets = resultSets;
    }

    int databaseCalls() {
      return databaseCalls;
    }

    int cursorCalls() {
      return cursorCalls;
    }

    @Override
    protected int queryDirectCount(String selectSql, DirectSql where) {
      databaseCalls++;
      return resultSets.size();
    }

    @Override
    protected <T> Page<T> queryDirectPage(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      databaseCalls++;
      List<T> mapped =
          resultSets.stream()
              .map(
                  resultSet -> {
                    try {
                      return rowMapper.map(resultSet);
                    } catch (SQLException exception) {
                      throw new AssertionError(exception);
                    }
                  })
              .toList();
      return new PageImpl<>(mapped, PageRequest.of(page, size), totalElements);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      cursorCalls++;
      return List.of();
    }
  }

  private static final class DetailReadLexisApplicationRepository
      extends LexisApplicationRepository {
    private final String failingProcedure;
    private final boolean applicationPresent;

    DetailReadLexisApplicationRepository(String failingProcedure, boolean applicationPresent) {
      super(null);
      this.failingProcedure = failingProcedure;
      this.applicationPresent = applicationPresent;
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if (procedureSignature.equals(failingProcedure)) {
        throw new DataAccessResourceFailureException(
            "Oracle detail dependency unavailable: " + procedureSignature);
      }
      if (!"LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)".equals(procedureSignature)) {
        return List.of();
      }
      if (!applicationPresent) {
        return List.of();
      }

      try {
        return List.of(rowMapper.map(applicationDetailResultSet()));
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static final class OfferReadLexisApplicationRepository
      extends LexisApplicationRepository {
    private final boolean fail;

    OfferReadLexisApplicationRepository(boolean fail) {
      super(null);
      this.fail = fail;
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if (fail) {
        throw new DataAccessResourceFailureException("Oracle purchase offers unavailable");
      }
      return List.of();
    }
  }

  private static final class RemarkOrderingLexisApplicationRepository
      extends LexisApplicationRepository {

    RemarkOrderingLexisApplicationRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      try {
        if ("LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)".equals(procedureSignature)) {
          return List.of(rowMapper.map(applicationDetailResultSet()));
        }
        if ("LEXIS_GROUP_5.FIND_REMARKS_BY_APP(?,?)".equals(procedureSignature)) {
          return List.of(rowMapper.map(remarkResultSet(20L)), rowMapper.map(remarkResultSet(10L)));
        }
        return List.of();
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static ResultSet applicationDetailResultSet() throws SQLException {
    ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(900123L);
    when(resultSet.getString("EXPORT_JURISDICTION_CODE")).thenReturn("P");
    when(resultSet.getString("ENTRY_USERID")).thenReturn("idir\\application-author");
    when(resultSet.getString("UPDATE_USERID")).thenReturn("idir\\application-editor");
    when(resultSet.wasNull()).thenReturn(false);
    return resultSet;
  }

  private static ResultSet remarkResultSet(long remarkId) throws SQLException {
    ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
    when(resultSet.getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR")).thenReturn(remarkId);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("REMARK")).thenReturn("Remark " + remarkId);
    when(resultSet.getString("ENTRY_USERID")).thenReturn("idir\\remark-author");
    when(resultSet.getTimestamp("ENTRY_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf("2026-07-23 08:30:00"));
    return resultSet;
  }
}

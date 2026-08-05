package ca.bc.gov.mof.lexis.repository.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | PermitRepository")
class PermitRepositoryTest {

  @Test
  void detailShouldExposeTheDistinctPermitApplicationDate() throws SQLException {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getDate("APPLICATION_DATE"))
        .thenReturn(java.sql.Date.valueOf(LocalDate.of(2026, 6, 17)));
    when(resultSet.getDate("RECEIVED_DATE"))
        .thenReturn(java.sql.Date.valueOf(LocalDate.of(2026, 6, 19)));
    when(resultSet.getString("ENTRY_USERID")).thenReturn("IDIR\\CREATOR");
    when(resultSet.getString("UPDATE_USERID")).thenReturn("IDIR\\EDITOR");
    DetailPermitRepository repository = new DetailPermitRepository(resultSet);

    PermitDetailDto detail = repository.findByPermitNumber(700001L).orElseThrow();

    assertThat(detail.applicationDate()).isEqualTo(LocalDate.of(2026, 6, 17));
    assertThat(detail.receivedDate()).isEqualTo(LocalDate.of(2026, 6, 19));
    assertThat(detail.author()).isEqualTo("IDIR\\EDITOR");
  }

  @Test
  void detailShouldExposeBlanketOicRequestLimits() throws SQLException {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("OIC_REQUEST_PIECES")).thenReturn(250L);
    when(resultSet.getDouble("OIC_REQUEST_VOLUME")).thenReturn(125.75d);
    DetailPermitRepository repository = new DetailPermitRepository(resultSet);

    PermitDetailDto detail = repository.findByPermitNumber(700001L).orElseThrow();

    assertThat(detail.oicRequestPieces()).isEqualTo(250L);
    assertThat(detail.oicRequestVolume()).isEqualTo(125.75d);
  }

  @Test
  void detailShouldPreserveUnavailableBlanketOicRequestLimitsAsNull() throws SQLException {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.wasNull()).thenReturn(true);
    DetailPermitRepository repository = new DetailPermitRepository(resultSet);

    PermitDetailDto detail = repository.findByPermitNumber(700001L).orElseThrow();

    assertThat(detail.oicRequestPieces()).isNull();
    assertThat(detail.oicRequestVolume()).isNull();
  }

  @Test
  void detailShouldKeepAnEmptyCursorAsNotFound() {
    DetailPermitRepository repository = new DetailPermitRepository(null);

    assertThat(repository.findByPermitNumber(700001L)).isEmpty();
  }

  @Test
  void detailShouldPropagateOracleCursorFailure() {
    PermitRepository repository = new FailingDetailPermitRepository();

    assertThatThrownBy(() -> repository.findByPermitNumber(700001L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("FIND_PERMIT_DET_BY_ID");
  }

  @Test
  @SuppressWarnings("unchecked")
  void accessLookupShouldReadOnlyRootPermitFields() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    PermitAccessDto access =
        new PermitAccessDto(700001L, "00055667", "00077881", 1904L);
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq(700001L)))
        .thenReturn(List.of(access));
    PermitRepository repository = new PermitRepository(jdbcTemplate);

    assertThat(repository.findAccessByPermitNumber(700001L)).contains(access);

    verify(jdbcTemplate)
        .query(
            argThat(
                sql ->
                    sql.contains("FROM EXPORT_PERMIT_DETAIL")
                        && sql.contains("AGENT_NUMBER")
                        && sql.contains("CLIENT_NUMBER")
                        && sql.contains("ORG_UNIT_NO")
                        && !sql.contains("EXPORT_SALES_INVOICE")),
            any(RowMapper.class),
            eq(700001L));
  }

  @Test
  void searchShouldUseOneDirectQueryAndExistsForJoinedCriteria() {
    TestPermitRepository repository = new TestPermitRepository();

    repository.search(
        new PermitSearchCriteria(
            "900123",
            "PKG-1",
            "700001",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            "ACT",
            "INV-1",
            "00055667",
            "00077881",
            true,
            List.of(1904L),
            "dateIssued ASC",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EXISTS (SELECT 1 FROM EXPORT_EXEMPTION_APPLICATION EP")
        .contains("EXISTS (SELECT 1 FROM EXPORT_SCALE_DETAIL ESD")
        .contains("TO_CHAR(EPD.EXPORT_PERMIT_DETAIL_NUMBER)")
        .contains("EXISTS (SELECT 1 FROM EXPORT_SALES_INVOICE ESI")
        .contains("EPD.ORG_UNIT_NO IN (?)")
        .contains("EXISTS (SELECT 1 FROM EXPORT_SCALE_DETAIL ESD_REQUIRED")
        .contains(
            "ORDER BY EPD.EXPORT_PERMIT_ISSUE_DATE ASC, EPD.EXPORT_PERMIT_DETAIL_NUMBER ASC")
        .doesNotContain(":1");
    assertThat(repository.pageSelectSql())
        .contains("FROM EXPORT_PERMIT_DETAIL EPD")
        .doesNotContain("FIND_PERMIT_BY_CRITERIA");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "700001",
            java.sql.Date.valueOf("2026-01-01"),
            java.sql.Date.valueOf("2026-01-31"),
            "ACT",
            "INV-1",
            "00055667",
            "00077881",
            "00077881",
            1904L);
  }

  @Test
  void searchShouldPreserveLegacyApplicantAndOwnerFilterWiring() {
    TestPermitRepository repository = new TestPermitRepository();

    repository.search(
        new PermitSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "00055667",
            "00077881",
            List.of(),
            null,
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EPD.CLIENT_NUMBER LIKE '%' || ? || '%'")
        .contains("EPD.AGENT_NUMBER LIKE '%' || ? || '%'")
        .contains("EPD.CLIENT_NUMBER LIKE '%' || ? || '%' AND EPD.AGENT_NUMBER IS NULL");
    assertThat(repository.bindValues())
        .containsExactly("00055667", "00077881", "00077881");
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestPermitRepository repository = new TestPermitRepository();

    repository.search(
        new PermitSearchCriteria(
            null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("EPD.ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  @Test
  void scopedAccessShouldUseLegacyDirectAndLinkedApplicationBranches() {
    TestPermitRepository repository = new TestPermitRepository();
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "00099999",
            "00088888",
            "00012345",
            true,
            List.of(),
            null,
            0,
            10);

    repository.search(criteria);
    String searchSql = repository.whereSql();
    List<Object> searchBinds = repository.bindValues();

    repository.count(criteria);

    assertThat(searchSql)
        .contains("EPD.CLIENT_NUMBER LIKE")
        .contains("EPD.AGENT_NUMBER LIKE")
        .doesNotContain("EP_ACCESS");
    assertThat(repository.pageSelectSql())
        .contains("WITH ACCESSIBLE_PERMITS AS")
        .contains("OWNER_PERMIT.CLIENT_NUMBER = ?")
        .contains("AGENT_PERMIT.AGENT_NUMBER = ?")
        .contains("EP_ACCESS.AGENT_CLIENT_NUMBER = ?")
        .doesNotContain("EP_ACCESS.OWNER_CLIENT_NUMBER =")
        .contains("EP_ACCESS.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("EP_ACCESS.EXPORT_JURISDICTION_CODE IS NULL")
        .contains("EXISTS (\n    SELECT 1 FROM EXPORT_SCALE_DETAIL ESD_REQUIRED")
        .contains("INNER JOIN ACCESSIBLE_PERMITS AP");
    assertThat(searchBinds)
        .containsExactly(
            "00012345",
            "00012345",
            "00012345",
            "00099999",
            "00088888",
            "00088888");
    assertThat(repository.countWhereSql()).isEqualTo(searchSql.substring(0, searchSql.indexOf(" ORDER BY")));
    assertThat(repository.countBindValues()).isEqualTo(searchBinds);
    assertThat(repository.countSelectSql())
        .contains("WITH ACCESSIBLE_PERMITS AS")
        .contains("INNER JOIN ACCESSIBLE_PERMITS AP");
    assertThat(repository.countCalls()).isEqualTo(2);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void scopedFeeAccessShouldNotRequireScaleOnTheLinkedApplicationBranch() {
    TestPermitRepository repository = new TestPermitRepository();

    repository.search(
        new PermitSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "00012345",
            false,
            List.of(),
            null,
            0,
            10));

    assertThat(repository.pageSelectSql())
        .contains("WITH ACCESSIBLE_PERMITS AS")
        .contains("EP_ACCESS.EXPORT_JURISDICTION_CODE = 'P'")
        .doesNotContain("EXPORT_SCALE_DETAIL ESD_REQUIRED");
    assertThat(repository.bindValues())
        .containsExactly("00012345", "00012345", "00012345");
  }

  @Test
  void searchShouldLoadRequestedDirectPageWithCountTotal() {
    List<PermitSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(700001L, 700011L)
            .mapToObj(PermitRepositoryTest::permitResult)
            .toList();
    TestPermitRepository repository = new TestPermitRepository(rows);

    Page<PermitSearchResultDto> results =
        repository.search(
            new PermitSearchCriteria(
                null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(PermitSearchResultDto::permitNumber)
        .containsExactly(700001L, 700002L, 700003L, 700004L, 700005L, 700006L, 700007L, 700008L, 700009L, 700010L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void searchShouldNotStitchTwentyLegacyCallsForTwoHundredRows() {
    List<PermitSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(700001L, 700200L)
            .mapToObj(PermitRepositoryTest::permitResult)
            .toList();
    TestPermitRepository repository = new TestPermitRepository(rows);

    Page<PermitSearchResultDto> results =
        repository.search(
            new PermitSearchCriteria(
                null, null, null, null, null, null, null, null, null, List.of(), null, 0, 200));

    assertThat(results.getNumberOfElements()).isEqualTo(200);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void countShouldUseLightweightSqlWithoutPageOrSortClauses() {
    TestPermitRepository repository = new TestPermitRepository(List.of(permitResult(700001L)));

    int total =
        repository.count(
            new PermitSearchCriteria(
                null, "PKG-1", null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(total).isEqualTo(1);
    assertThat(repository.countSelectSql())
        .contains("SELECT COUNT(*)")
        .contains("FROM EXPORT_PERMIT_DETAIL EPD")
        .doesNotContain("EXPORT_SCALE_DETAIL");
    assertThat(repository.countWhereSql())
        .contains("EXISTS (SELECT 1 FROM EXPORT_SCALE_DETAIL ESD")
        .doesNotContain("ORDER BY")
        .doesNotContain("OFFSET")
        .doesNotContain("FETCH NEXT");
  }

  @Test
  void searchShouldUseKnownTotalWithoutCallingCountProcedure() {
    List<PermitSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(700001L, 700011L)
            .mapToObj(PermitRepositoryTest::permitResult)
            .toList();
    TestPermitRepository repository = new TestPermitRepository(rows);

    Page<PermitSearchResultDto> results =
        repository.search(
            new PermitSearchCriteria(
                null, null, null, null, null, null, null, null, null, List.of(), null, 1, 10),
            11);

    assertThat(results.getContent())
        .extracting(PermitSearchResultDto::permitNumber)
        .containsExactly(700011L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.countCalls()).isZero();
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  private static PermitSearchResultDto permitResult(long permitNumber) {
    return new PermitSearchResultDto(permitNumber, "Active", "00000001", "00000002", 100d, null, "Region");
  }

  private static final class TestPermitRepository extends PermitRepository {
    private final List<?> rows;
    private String whereSql;
    private List<Object> bindValues;
    private String pageSelectSql;
    private String countSelectSql;
    private String countWhereSql;
    private List<Object> countBindValues;
    private int countCalls;
    private int pageCalls;

    TestPermitRepository() {
      this(List.of());
    }

    TestPermitRepository(List<?> rows) {
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

    int pageCalls() {
      return pageCalls;
    }

    int countCalls() {
      return countCalls;
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
      int fromIndex = Math.min(rows.size(), Math.max(0, page) * Math.max(1, size));
      int toIndex = Math.min(rows.size(), fromIndex + Math.max(1, size));
      List<T> content = (List<T>) rows.subList(fromIndex, toIndex);
      return new PageImpl<>(content, PageRequest.of(page, size), totalElements);
    }
  }

  private static final class DetailPermitRepository extends PermitRepository {
    private final ResultSet resultSet;

    DetailPermitRepository(ResultSet resultSet) {
      super(null);
      this.resultSet = resultSet;
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if (resultSet == null) {
        return List.of();
      }
      try {
        return List.of(rowMapper.map(resultSet));
      } catch (SQLException exception) {
        throw new AssertionError(exception);
      }
    }
  }

  private static final class FailingDetailPermitRepository extends PermitRepository {
    FailingDetailPermitRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException(
          "Oracle detail dependency unavailable: " + procedureSignature);
    }
  }
}

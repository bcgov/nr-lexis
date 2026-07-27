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
    DetailPermitRepository repository = new DetailPermitRepository(resultSet);

    PermitDetailDto detail = repository.findByPermitNumber(700001L).orElseThrow();

    assertThat(detail.applicationDate()).isEqualTo(LocalDate.of(2026, 6, 17));
    assertThat(detail.receivedDate()).isEqualTo(LocalDate.of(2026, 6, 19));
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
  void searchShouldUsePermitPackageAliasesForDynamicCriteria() {
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
        .contains("EP.APPLICATION_NUMBER")
        .contains("ESD.PACKAGE_NUMBER")
        .contains("EPD.EXPORT_PERMIT_DETAIL_NUMBER")
        .contains("ESI.EXPORT_SALES_INVOICE_NUMBER")
        .contains("EPD.ORG_UNIT_NO")
        .contains("ESD.EXPORT_PERMIT_DETAIL_NUMBER IS NOT NULL")
        .contains(
            "ORDER BY EPD.EXPORT_PERMIT_ISSUE_DATE ASC, EPD.EXPORT_PERMIT_DETAIL_NUMBER ASC")
        .doesNotContain("v.");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "700001",
            "2026-01-01",
            "2026-01-31",
            "ACT",
            "INV-1",
            "00077881",
            "00055667",
            "00055667",
            "1904");
  }

  @Test
  void searchShouldApplyApplicantAndOwnerFiltersToTheirDisplayedMeanings() {
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
        .contains("CLIENT_NUMBER LIKE '%' || :1 || '%'")
        .contains("EPD.AGENT_NUMBER LIKE '%' || :2 || '%'")
        .contains("CLIENT_NUMBER LIKE '%' || :3 || '%' AND EPD.AGENT_NUMBER IS NULL");
    assertThat(repository.bindValues())
        .containsExactly("00077881", "00055667", "00055667");
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
  void scopedAccessShouldIncludeDirectAndLinkedApplicationClientsForSearchAndCount() {
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
            false,
            List.of(),
            null,
            0,
            10);

    repository.search(criteria);
    String searchSql = repository.whereSql();
    List<String> searchBinds = repository.bindValues();

    repository.count(criteria);

    assertThat(searchSql)
        .contains("CLIENT_NUMBER LIKE")
        .contains("EPD.AGENT_NUMBER LIKE")
        .contains("EPD.CLIENT_NUMBER =")
        .contains("EPD.AGENT_NUMBER =")
        .contains("EXISTS (SELECT 1 FROM EXPORT_SCALE_DETAIL ACCESS_ESD")
        .contains("INNER JOIN EXPORT_PACKAGE ACCESS_EP")
        .contains("INNER JOIN EXPORT_EXEMPTION_APPLICATION ACCESS_EEA")
        .contains("ACCESS_ESD.EXPORT_PERMIT_DETAIL_NUMBER = EPD.EXPORT_PERMIT_DETAIL_NUMBER")
        .contains("ACCESS_EEA.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("ACCESS_EEA.OWNER_CLIENT_NUMBER =")
        .contains("ACCESS_EEA.AGENT_CLIENT_NUMBER =");
    assertThat(searchBinds)
        .containsExactly(
            "00088888",
            "00099999",
            "00099999",
            "00012345",
            "00012345",
            "00012345",
            "00012345");
    assertThat(repository.whereSql()).isEqualTo(searchSql);
    assertThat(repository.bindValues()).isEqualTo(searchBinds);
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<PermitSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(700001L, 700010L)
            .mapToObj(PermitRepositoryTest::permitResult)
            .toList();
    TestPermitRepository repository =
        new TestPermitRepository(List.<List<?>>of(firstPage, List.of(permitResult(700011L))));

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
  void searchShouldUseKnownTotalWithoutCallingCountProcedure() {
    List<PermitSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(700001L, 700010L)
            .mapToObj(PermitRepositoryTest::permitResult)
            .toList();
    TestPermitRepository repository =
        new TestPermitRepository(List.<List<?>>of(firstPage, List.of(permitResult(700011L))));

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
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private int countCalls;
    private int pageCalls;

    TestPermitRepository() {
      this(List.of());
    }

    TestPermitRepository(List<List<?>> pages) {
      super(null);
      this.pages = pages;
    }

    String whereSql() {
      return whereSql;
    }

    List<String> bindValues() {
      return bindValues;
    }

    int pageCalls() {
      return pageCalls;
    }

    int countCalls() {
      return countCalls;
    }

    @Override
    protected int queryLegacyDynamicCountProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues) {
      this.whereSql = whereSql;
      this.bindValues = bindValues;
      countCalls++;
      return pages.stream().mapToInt(List::size).sum();
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryLegacyDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      this.whereSql = whereSql;
      this.bindValues = bindValues;
      pageCalls++;
      if (page >= pages.size()) {
        return List.of();
      }
      return (List<T>) pages.get(page);
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

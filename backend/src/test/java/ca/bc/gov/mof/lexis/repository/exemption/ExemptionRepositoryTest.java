package ca.bc.gov.mof.lexis.repository.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;

@DisplayName("Unit Test | ExemptionRepository")
class ExemptionRepositoryTest {

  @Test
  void searchShouldUseExemptionPackageAliasesForDynamicCriteria() {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(List.of(exemptionResult("EX-1"))));

    repository.search(
        new ExemptionSearchCriteria(
            "900123",
            "PKG-1",
            "EX-1",
            "B",
            "NEW",
            "00055667",
            "00077881",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            List.of(1904L),
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EEA.APPLICATION_NUMBER")
        .contains("EP.PACKAGE_NUMBER")
        .contains("EE.EXEMPTION_NUMBER")
        .contains("ES.ADVERTISING_DATE")
        .contains("EO.ORG_UNIT_NO")
        .contains("GROUP BY EE.EXEMPTION_NUMBER")
        .containsOnlyOnce("EEA.APPLICATION_NUMBER")
        .contains("ORDER BY EE.EXEMPTION_NUMBER DESC")
        .doesNotContain(" v.");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "EX-1",
            "B",
            "NEW",
            "00077881",
            "00055667",
            "00055667",
            "2026-01-01",
            "2026-01-31",
            "2026-02-01",
            "2026-02-28",
            "1904");
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.search(
        new ExemptionSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, List.of(), 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("EO.ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  @Test
  void scopedIndustrySearchShouldIncludeBlanketOicOutsideClientAndRegionMatches() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.search(
        new ExemptionSearchCriteria(
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
            List.of(76L, 1826L),
            true,
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EEA.AGENT_CLIENT_NUMBER")
        .contains("EEA.OWNER_CLIENT_NUMBER")
        .contains("EO.ORG_UNIT_NO")
        .contains("OR EE.EXPORT_EXEMPTION_TYPE_CODE = 'B'")
        .doesNotContain("EEA.AGENT_CLIENT_NUMBER IS NULL");
    assertThat(repository.bindValues())
        .containsExactly("00012345", "00012345", "76", "1826");
  }

  @Test
  void applicantFilterShouldMatchTheAgentOrAnOwnerOnlyApplication() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.search(
        new ExemptionSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            "00055667",
            null,
            null,
            null,
            null,
            null,
            List.of(),
            false,
            false,
            null,
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EEA.AGENT_CLIENT_NUMBER LIKE '%' || :1 || '%'")
        .contains("EEA.OWNER_CLIENT_NUMBER LIKE '%' || :2 || '%'")
        .contains("EEA.AGENT_CLIENT_NUMBER IS NULL");
    assertThat(repository.bindValues()).containsExactly("00055667", "00055667");
  }

  @Test
  void searchAndCountShouldExcludeBlanketOicWhenVisibilityIsDenied() {
    TestExemptionRepository repository = new TestExemptionRepository();
    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
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
            List.of(76L),
            false,
            true,
            0,
            10);

    repository.search(criteria);
    assertThat(repository.whereSql())
        .contains("EE.EXPORT_EXEMPTION_TYPE_CODE != 'B'");

    repository.count(criteria);
    assertThat(repository.whereSql())
        .contains("EE.EXPORT_EXEMPTION_TYPE_CODE != 'B'")
        .doesNotContain("GROUP BY")
        .doesNotContain("ORDER BY");
  }

  @Test
  void countShouldUseFilterCriteriaWithoutAggregateGroupingOrOrdering() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.count(
        new ExemptionSearchCriteria(
            null, null, "EX-1", null, null, null, null, null, null, null, null, List.of(), 0, 10));

    assertThat(repository.whereSql())
        .contains("EE.EXEMPTION_NUMBER")
        .doesNotContain("GROUP BY")
        .doesNotContain("ORDER BY");
    assertThat(repository.bindValues()).containsExactly("EX-1");
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<ExemptionSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(1L, 10L)
            .mapToObj(number -> exemptionResult("EX-" + number))
            .toList();
    TestExemptionRepository repository =
        new TestExemptionRepository(List.<List<?>>of(firstPage, List.of(exemptionResult("EX-11"))));

    Page<ExemptionSearchResultDto> results =
        repository.search(
            new ExemptionSearchCriteria(
                null, null, null, null, null, null, null, null, null, null, null, List.of(), 0, 10));

    assertThat(results.getContent())
        .extracting(ExemptionSearchResultDto::exemptionNumber)
        .containsExactly("EX-1", "EX-2", "EX-3", "EX-4", "EX-5", "EX-6", "EX-7", "EX-8", "EX-9", "EX-10");
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @ParameterizedTest
  @MethodSource("supportedSortOrders")
  void searchShouldApplyOnlyWhitelistedSortFields(String requestedSort, String expectedOrder) {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(List.of(exemptionResult("EX-1"))));

    repository.search(criteriaWithSort(requestedSort));

    assertThat(repository.whereSql()).contains(expectedOrder);
  }

  @Test
  void searchShouldDiscardUntrustedSortTextAndUseTheLegacyDefault() {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(List.of(exemptionResult("EX-1"))));

    repository.search(criteriaWithSort("balanceRemaining DESC NULLS LAST; DELETE FROM X"));

    assertThat(repository.whereSql())
        .contains("ORDER BY EE.EXEMPTION_NUMBER DESC")
        .doesNotContain("NULLS LAST")
        .doesNotContain("DELETE FROM");
  }

  @Test
  void searchGroupByShouldNotSplitOneExemptionByApplicationNumber() {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(List.of(exemptionResult("EX-1"))));

    repository.search(criteriaWithSort(null));

    String groupAndOrder =
        repository.whereSql().substring(repository.whereSql().indexOf(" GROUP BY "));
    assertThat(groupAndOrder).doesNotContain("EEA.APPLICATION_NUMBER");
  }

  @Test
  void searchShouldMapTheExactLegacyExemptionCursorFields() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("EXEMPTION_NUMBER")).thenReturn(" EX-205 ");
    when(resultSet.getString("EXPORT_EXEMPTION_TYPE_CODE")).thenReturn(" M ");
    when(resultSet.getString("EXPORT_EXEMPTION_STATUS_CODE")).thenReturn(" NEW ");
    when(resultSet.getString("AGENT_CLIENT_NUMBER")).thenReturn(" 00055667 ");
    when(resultSet.getString("OWNER_CLIENT_NUMBER")).thenReturn(" 00077881 ");
    when(resultSet.getTimestamp("APPROVAL_DATE"))
        .thenReturn(Timestamp.valueOf("2026-03-12 00:00:00"));
    when(resultSet.getTimestamp("ADVERTISING_DATE"))
        .thenReturn(Timestamp.valueOf("2026-02-26 00:00:00"));
    when(resultSet.getTimestamp("EXPIRY_DATE"))
        .thenReturn(Timestamp.valueOf("2027-03-12 00:00:00"));
    when(resultSet.getString("ORG_UNIT_NAME")).thenReturn(" R2, R3 ");
    when(resultSet.getDouble("APPROVED_VOLUME")).thenReturn(95.5d);
    when(resultSet.getDouble("VOLUME_REMAINING")).thenReturn(83.25d);
    when(resultSet.wasNull()).thenReturn(false);
    MappingExemptionRepository repository = new MappingExemptionRepository(resultSet);

    Page<ExemptionSearchResultDto> page = repository.search(criteriaWithSort(null), 1);

    assertThat(page.getContent())
        .singleElement()
        .satisfies(
            row -> {
              assertThat(row.exemptionNumber()).isEqualTo("EX-205");
              assertThat(row.exemptionType()).isEqualTo("M");
              assertThat(row.status()).isEqualTo("NEW");
              assertThat(row.applicantClientNumber()).isEqualTo("00055667");
              assertThat(row.ownerClientNumber()).isEqualTo("00077881");
              assertThat(row.applicationNumber()).isNull();
              assertThat(row.approvalDate()).isEqualTo(LocalDate.of(2026, 3, 12));
              assertThat(row.listingDate()).isEqualTo(LocalDate.of(2026, 2, 26));
              assertThat(row.expiryDate()).isEqualTo(LocalDate.of(2027, 3, 12));
              assertThat(row.region()).isEqualTo("R2, R3");
              assertThat(row.approvedVolume()).isEqualTo(95.5d);
              assertThat(row.balanceRemaining()).isEqualTo(83.25d);
              assertThat(row.locked()).isTrue();
            });
  }

  @Test
  void detailShouldKeepAnEmptyCursorAsNotFound() {
    DetailReadExemptionRepository repository = new DetailReadExemptionRepository(false);

    assertThat(repository.findByExemptionNumber("EX-205")).isEmpty();
  }

  @Test
  void detailShouldPropagateOracleCursorFailure() {
    DetailReadExemptionRepository repository = new DetailReadExemptionRepository(true);

    assertThatThrownBy(() -> repository.findByExemptionNumber("EX-205"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("FIND_EXEMPTION_BY_NUMBER");
  }

  private static ExemptionSearchResultDto exemptionResult(String exemptionNumber) {
    return new ExemptionSearchResultDto(
        exemptionNumber,
        "Type",
        "New",
        "00000002",
        "00000001",
        900123L,
        null,
        null,
        null,
        "Region",
        100d,
        90d,
        false);
  }

  private static ExemptionSearchCriteria criteriaWithSort(String sortField) {
    return new ExemptionSearchCriteria(
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
        false,
        sortField,
        0,
        10);
  }

  private static Stream<Arguments> supportedSortOrders() {
    return Stream.of(
        Arguments.of("exemptionNumber", "ORDER BY EE.EXEMPTION_NUMBER ASC"),
        Arguments.of("type DESC", "ORDER BY EE.EXPORT_EXEMPTION_TYPE_CODE DESC"),
        Arguments.of("status", "ORDER BY EE.EXPORT_EXEMPTION_STATUS_CODE ASC"),
        Arguments.of("applicantClientNumber DESC", "ORDER BY AGENT_CLIENT_NUMBER DESC"),
        Arguments.of("ownerClientNumber", "ORDER BY OWNER_CLIENT_NUMBER ASC"),
        Arguments.of("approvedVolume DESC", "ORDER BY EE.APPROVED_VOLUME DESC"),
        Arguments.of("balanceRemaining", "ORDER BY VOLUME_REMAINING ASC"),
        Arguments.of("listingDate DESC", "ORDER BY ES.ADVERTISING_DATE DESC"),
        Arguments.of("expiryDate", "ORDER BY EE.EXPIRY_DATE ASC"),
        Arguments.of("region DESC", "ORDER BY EO.ORG_UNIT_NAME DESC"));
  }

  private static final class TestExemptionRepository extends ExemptionRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private int pageCalls;

    TestExemptionRepository() {
      this(List.of());
    }

    TestExemptionRepository(List<List<?>> pages) {
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

    @Override
    protected int queryLegacyDynamicCountProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues) {
      this.whereSql = whereSql;
      this.bindValues = bindValues;
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

  private static final class DetailReadExemptionRepository extends ExemptionRepository {
    private final boolean fail;

    DetailReadExemptionRepository(boolean fail) {
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
        throw new DataAccessResourceFailureException(
            "Oracle detail dependency unavailable: " + procedureSignature);
      }
      return List.of();
    }
  }

  private static final class MappingExemptionRepository extends ExemptionRepository {
    private final ResultSet resultSet;

    MappingExemptionRepository(ResultSet resultSet) {
      super(null);
      this.resultSet = resultSet;
    }

    @Override
    protected <T> List<T> queryLegacyDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      if (page > 0) {
        return List.of();
      }
      try {
        return List.of(rowMapper.map(resultSet));
      } catch (SQLException ex) {
        throw new DataRetrievalFailureException("Unable to map exemption cursor", ex);
      }
    }
  }
}

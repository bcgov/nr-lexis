package ca.bc.gov.mof.lexis.repository.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSummaryLookupDto;
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
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | ExemptionRepository")
class ExemptionRepositoryTest {

  @Test
  void exemptionStatusOptionsShouldIncludeExpired() {
    ExemptionRepository repository =
        new ExemptionRepository(null) {
          @Override
          protected List<CodeNameDto> loadCodeNameOptionsRequired(String procedureSignature) {
            return List.of(
                new CodeNameDto("NEW", "New"),
                new CodeNameDto("EXP", "Expired"));
          }
        };

    assertThat(repository.loadExemptionStatusOptions())
        .extracting(CodeNameDto::code)
        .containsExactly("NEW", "EXP");
  }

  @Test
  @SuppressWarnings("unchecked")
  void accessLookupShouldReadOnlyRootExemptionFields() throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("EXEMPTION_NUMBER")).thenReturn("BO-001");
    when(resultSet.getString("EXPORT_EXEMPTION_TYPE_CODE")).thenReturn("B");
    when(resultSet.getString("EXPORT_EXEMPTION_STATUS_CODE")).thenReturn("ACT");
    when(
            jdbcTemplate.query(
                anyString(),
                any(RowMapper.class),
                eq("BO-001")))
        .thenAnswer(
            invocation ->
                List.of(
                    ((RowMapper<ExemptionAccessDto>) invocation.getArgument(1))
                        .mapRow(resultSet, 0)));
    ExemptionRepository repository = new ExemptionRepository(jdbcTemplate);

    ExemptionAccessDto access =
        repository.findAccessByExemptionNumber(" BO-001 ").orElseThrow();

    assertThat(access.blanketOic()).isTrue();
    assertThat(access.exemptionStatusCode()).isEqualTo("ACT");
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sql.capture(), any(RowMapper.class), eq("BO-001"));
    assertThat(sql.getValue())
        .contains("FROM EXPORT_EXEMPTION")
        .contains("WHERE EXEMPTION_NUMBER = ?")
        .doesNotContain("EXPORT_SCALE_DETAIL");
  }

  @Test
  void linkedExemptionClientAccessShouldUseOneProvincialExistsQuery() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(
            jdbcTemplate.queryForObject(
                anyString(),
                eq(Long.class),
                eq("EX-205"),
                eq("00012345"),
                eq("00012345")))
        .thenReturn(1L);
    ExemptionRepository repository = new ExemptionRepository(jdbcTemplate);

    assertThat(
            repository.hasLinkedProvincialApplicationForClient(
                " EX-205 ", " 00012345 "))
        .isTrue();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .queryForObject(
            sql.capture(),
            eq(Long.class),
            eq("EX-205"),
            eq("00012345"),
            eq("00012345"));
    assertThat(sql.getValue())
        .contains("FROM EXPORT_EXEMPTION_APPLICATION")
        .contains("EXPORT_JURISDICTION_CODE = 'P'")
        .contains("OWNER_CLIENT_NUMBER = ?")
        .contains("AGENT_CLIENT_NUMBER = ?");
  }

  @Test
  @SuppressWarnings("unchecked")
  void summaryLookupsShouldUseOneBoundQueryForDistinctExemptions() throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet first = mock(ResultSet.class);
    when(first.getString("EXEMPTION_NUMBER")).thenReturn("EX-2");
    when(first.getString("TYPE_DESCRIPTION")).thenReturn("Ministerial");
    when(first.getString("STATUS_DESCRIPTION")).thenReturn("Approved");
    ResultSet second = mock(ResultSet.class);
    when(second.getString("EXEMPTION_NUMBER")).thenReturn("EX-1");
    when(second.getString("TYPE_DESCRIPTION")).thenReturn("Blanket OIC");
    when(second.getString("STATUS_DESCRIPTION")).thenReturn("Active");
    when(
            jdbcTemplate.query(
                anyString(),
                any(RowMapper.class),
                eq("EX-2"),
                eq("EX-1")))
        .thenAnswer(
            invocation -> {
              RowMapper<ExemptionSummaryLookupDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(first, 0), mapper.mapRow(second, 1));
            });
    ExemptionRepository repository = new ExemptionRepository(jdbcTemplate);

    var lookups =
        repository.findSummaryLookups(
            List.of(" EX-2 ", "", "EX-1", "EX-2"));

    assertThat(lookups).hasSize(2);
    assertThat(lookups.get("EX-2").exemptionTypeDescription())
        .isEqualTo("Ministerial");
    assertThat(lookups.get("EX-1").exemptionStatusDescription())
        .isEqualTo("Active");
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sql.capture(), any(RowMapper.class), eq("EX-2"), eq("EX-1"));
    assertThat(sql.getValue())
        .contains("EXPORT_EXEMPTION_TYPE_CODE")
        .contains("EXPORT_EXEMPTION_STATUS_CODE")
        .contains("IN (?, ?)");
  }

  @Test
  void summaryLookupsShouldSkipDatabaseWhenNoValidNumbers() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ExemptionRepository repository = new ExemptionRepository(jdbcTemplate);

    assertThat(repository.findSummaryLookups(List.of(" "))).isEmpty();

    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  void lightweightAccessLookupsShouldRejectBlankInputWithoutOracle() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ExemptionRepository repository = new ExemptionRepository(jdbcTemplate);

    assertThat(repository.findAccessByExemptionNumber(" ")).isEmpty();
    assertThat(repository.hasLinkedProvincialApplicationForClient("EX-205", " "))
        .isFalse();

    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  void searchShouldUseOneDirectQueryWithPackageAndRegionFilters() {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(exemptionResult("EX-1")));

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
        .contains("TO_CHAR(EEA.APPLICATION_NUMBER)")
        .contains("EXISTS (SELECT 1 FROM EXPORT_PACKAGE EP")
        .contains("EE.EXEMPTION_NUMBER")
        .contains("ES.ADVERTISING_DATE")
        .contains("EEA_REGION.ORG_UNIT_NO IN (?)")
        .contains("OEO_REGION.ORG_UNIT_NO IN (?)")
        .contains("ORDER BY EE.EXEMPTION_NUMBER DESC")
        .doesNotContain(":1");
    assertThat(repository.whereSql().chars().filter(character -> character == '(').count())
        .isEqualTo(
            repository.whereSql().chars().filter(character -> character == ')').count());
    assertThat(repository.pageSelectSql())
        .contains("CANONICAL_EXEMPTION_APPLICATION AS")
        .contains("ROW_NUMBER() OVER")
        .contains("EEA.CANONICAL_RANK = 1")
        .contains("PERMIT_VOLUME_BY_EXEMPTION AS")
        .contains("SELECT\n  EE.EXEMPTION_NUMBER")
        .doesNotContain("FIND_EXEMPTIONS_BY_CRITERIA");
    assertThat(repository.countSelectSql())
        .contains("CANONICAL_EXEMPTION_APPLICATION AS")
        .contains("ROW_NUMBER() OVER")
        .contains("EEA.CANONICAL_RANK = 1")
        .doesNotContain("PERMIT_VOLUME_BY_EXEMPTION");
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
            java.sql.Date.valueOf("2026-01-01"),
            java.sql.Date.valueOf("2026-01-31"),
            java.sql.Date.valueOf("2026-02-01"),
            java.sql.Date.valueOf("2026-02-28"),
            1904L,
            1904L);
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.search(
        new ExemptionSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, List.of(), 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("EEA_REGION.ORG_UNIT_NO")
        .doesNotContain("OEO_REGION.ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  @Test
  void searchShouldNotJoinPackagesWhenThePackageFilterIsBlank() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.search(
        new ExemptionSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, List.of(), 0, 10));

    assertThat(repository.whereSql()).doesNotContain("EXPORT_PACKAGE EP");
    assertThat(repository.pageSelectSql()).doesNotContain("EXPORT_PACKAGE");
  }

  @Test
  void scopedIndustrySearchShouldIncludeClientOicAndGlobalBlanketOic() {
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
            false,
            true,
            null,
            0,
            10));

    assertThat(repository.pageSelectSql())
        .contains("WITH ACCESSIBLE_EXEMPTIONS AS")
        .contains("GROUP BY EEA_ACCESS.EXEMPTION_NUMBER")
        .contains("EEA_ACCESS.AGENT_CLIENT_NUMBER")
        .contains("EEA_ACCESS.OWNER_CLIENT_NUMBER")
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE IS NULL")
        .contains("EE_ACCESS.EXPORT_EXEMPTION_TYPE_CODE != 'B'")
        .doesNotContain("EE_ACCESS.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')")
        .contains("EE_BOIC.EXPORT_EXEMPTION_TYPE_CODE = 'B'")
        .doesNotContain("EE_BOIC.EXPORT_EXEMPTION_TYPE_CODE IN ('B', 'O')")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE_CANON")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE_VOLUME")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE_IEEA")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE_OEO")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE")
        .contains("EEA.CANONICAL_RANK = 1")
        .doesNotContain("OR EE.EXPORT_EXEMPTION_TYPE_CODE IN ('B', 'O')");
    assertThat(repository.countSelectSql())
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE IS NULL")
        .contains("EE_ACCESS.EXPORT_EXEMPTION_TYPE_CODE != 'B'")
        .contains("EE_BOIC.EXPORT_EXEMPTION_TYPE_CODE = 'B'");
    assertThat(repository.whereSql())
        .contains("EEA_REGION.ORG_UNIT_NO")
        .contains("OEO_REGION.ORG_UNIT_NO")
        .doesNotContain("EEA_ACCESS")
        .doesNotContain("EEA.AGENT_CLIENT_NUMBER IS NULL");
    assertThat(repository.bindValues())
        .containsExactly(
            "00012345",
            "00012345",
            76L,
            1826L,
            76L,
            1826L);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void broadClientScopeWithoutOicVisibilityShouldExcludeBothOicTypes() {
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
            List.of(),
            false,
            false,
            true,
            null,
            0,
            10));

    assertThat(repository.pageSelectSql())
        .contains("WITH ACCESSIBLE_EXEMPTIONS AS")
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE IS NULL")
        .contains("EE_ACCESS.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')")
        .doesNotContain("EE_BOIC.EXPORT_EXEMPTION_TYPE_CODE = 'B'");
    assertThat(repository.countSelectSql())
        .contains("WITH ACCESSIBLE_EXEMPTIONS AS")
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("EEA_ACCESS.EXPORT_JURISDICTION_CODE IS NULL")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE_CANON")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE")
        .doesNotContain("PERMIT_VOLUME_BY_EXEMPTION", "EXEMPTION_ORG_UNIT");
    assertThat(repository.whereSql()).doesNotContain("EEA_ACCESS");
    assertThat(repository.bindValues()).containsExactly("00012345", "00012345");
  }

  @Test
  void scopedSummaryCountShouldCountAccessibleRootsWithoutCanonicalEnrichment() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.count(
        new ExemptionSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            "00001074",
            null,
            null,
            null,
            null,
            null,
            List.of(),
            true,
            false,
            true,
            "exemptionNumber DESC",
            0,
            10));

    assertThat(repository.countSelectSql())
        .contains("WITH ACCESSIBLE_EXEMPTIONS AS")
        .contains("EE_BOIC.EXPORT_EXEMPTION_TYPE_CODE = 'B'")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE")
        .contains("INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC")
        .doesNotContain(
            "CANONICAL_EXEMPTION_APPLICATION",
            "CANONICAL_RANK",
            "EXPORT_SCHEDULE",
            "PERMIT_VOLUME_BY_EXEMPTION",
            "EXEMPTION_ORG_UNIT");
    assertThat(repository.bindValues()).containsExactly("00001074", "00001074");
  }

  @Test
  void scopedSummarySearchShouldPageBeforeEnrichment() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.search(scopedSummaryCriteria("exemptionNumber DESC", null));

    assertThat(repository.pageSelectSql())
        .contains("WITH ACCESSIBLE_EXEMPTIONS AS")
        .contains("EE_BOIC.EXPORT_EXEMPTION_TYPE_CODE = 'B'")
        .contains("PAGE_EXEMPTIONS AS")
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE")
        .contains("INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC")
        .contains("INNER JOIN PAGE_EXEMPTIONS PE_CANON")
        .contains("INNER JOIN PAGE_EXEMPTIONS PE_VOLUME")
        .contains("INNER JOIN PAGE_EXEMPTIONS PE_IEEA")
        .contains("INNER JOIN PAGE_EXEMPTIONS PE_OEO")
        .doesNotContain(
            "INNER JOIN ACCESSIBLE_EXEMPTIONS AE_CANON",
            "INNER JOIN ACCESSIBLE_EXEMPTIONS AE_VOLUME",
            "INNER JOIN ACCESSIBLE_EXEMPTIONS AE_IEEA",
            "INNER JOIN ACCESSIBLE_EXEMPTIONS AE_OEO");
    assertThat(repository.pageSelectSql().indexOf("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"))
        .isLessThan(repository.pageSelectSql().indexOf("CANONICAL_EXEMPTION_APPLICATION AS"));
    assertThat(repository.bindValues()).containsExactly("00001074", "00001074");
  }

  @Test
  void scopedSummarySearchShouldPreserveNonZeroPageBeforeEnrichment() {
    List<ExemptionSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(1L, 21L)
            .mapToObj(number -> exemptionResult("EX-" + number))
            .toList();
    TestExemptionRepository repository = new TestExemptionRepository(rows);

    Page<ExemptionSearchResultDto> results =
        repository.search(scopedSummaryCriteria("exemptionNumber DESC", null, 1, 10));

    assertThat(results.getContent())
        .extracting(ExemptionSearchResultDto::exemptionNumber)
        .containsExactly(
            "EX-11",
            "EX-12",
            "EX-13",
            "EX-14",
            "EX-15",
            "EX-16",
            "EX-17",
            "EX-18",
            "EX-19",
            "EX-20");
    assertThat(results.getNumber()).isEqualTo(1);
    assertThat(results.getSize()).isEqualTo(10);
    assertThat(repository.pageSelectSql())
        .contains("PAGE_EXEMPTIONS AS")
        .contains("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    assertThat(repository.pageSelectSql().indexOf("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"))
        .isLessThan(repository.pageSelectSql().indexOf("CANONICAL_EXEMPTION_APPLICATION AS"));
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void scopedSummarySearchShouldRetainExistingPageForEnrichedSortOrFilter() {
    TestExemptionRepository enrichedSortRepository = new TestExemptionRepository();
    enrichedSortRepository.search(scopedSummaryCriteria("balanceRemaining DESC", null));

    assertThat(enrichedSortRepository.pageSelectSql())
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE_VOLUME")
        .doesNotContain("PAGE_EXEMPTIONS AS");

    TestExemptionRepository filteredRepository = new TestExemptionRepository();
    filteredRepository.search(scopedSummaryCriteria("exemptionNumber DESC", "M"));

    assertThat(filteredRepository.pageSelectSql())
        .contains("INNER JOIN ACCESSIBLE_EXEMPTIONS AE_VOLUME")
        .doesNotContain("PAGE_EXEMPTIONS AS");
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
        .contains("EEA.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%'")
        .contains("EEA.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%'")
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
    assertThat(repository.pageSelectSql()).doesNotContain("ACCESSIBLE_EXEMPTIONS");

    repository.count(criteria);
    assertThat(repository.whereSql())
        .contains("EE.EXPORT_EXEMPTION_TYPE_CODE != 'B'")
        .doesNotContain("GROUP BY")
        .doesNotContain("ORDER BY EE.");
    assertThat(repository.countSelectSql()).doesNotContain("ACCESSIBLE_EXEMPTIONS");
  }

  @Test
  void countShouldUseTheFilterOnlyQueryWhenLinkedApplicationDataIsNotNeeded() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.count(
        new ExemptionSearchCriteria(
            null, null, "EX-1", null, null, null, null, null, null, null, null, List.of(), 0, 10));

    assertThat(repository.whereSql())
        .contains("EE.EXEMPTION_NUMBER")
        .doesNotContain("GROUP BY")
        .doesNotContain("ORDER BY EE.");
    assertThat(repository.countSelectSql())
        .contains("SELECT COUNT(*)")
        .contains("FROM EXPORT_EXEMPTION EE")
        .doesNotContain("CANONICAL_EXEMPTION_APPLICATION AS")
        .doesNotContain("SELECT DISTINCT")
        .doesNotContain("EXPORT_PERMIT_DETAIL")
        .doesNotContain("EXEMPTION_ORG_UNIT");
    assertThat(repository.bindValues()).containsExactly("EX-1");
  }

  @Test
  void countShouldApplyFiltersToTheCanonicalLinkedApplication() {
    TestExemptionRepository repository = new TestExemptionRepository();

    repository.count(
        new ExemptionSearchCriteria(
            "900123",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            LocalDate.of(2026, 2, 1),
            null,
            List.of(),
            0,
            10));

    assertThat(repository.whereSql())
        .contains("TO_CHAR(EEA.APPLICATION_NUMBER) LIKE '%' || ? || '%'")
        .contains("ES.ADVERTISING_DATE >= ?")
        .doesNotContain("CANON_EEA")
        .doesNotContain("GROUP BY", "ORDER BY EE.");
    assertThat(repository.countSelectSql())
        .contains("CANONICAL_EXEMPTION_APPLICATION AS")
        .contains("CANON_ES.ADVERTISING_DATE DESC NULLS LAST")
        .contains("EEA.CANONICAL_RANK = 1");
    assertThat(repository.bindValues())
        .containsExactly("900123", java.sql.Date.valueOf("2026-02-01"));
  }

  @Test
  void searchShouldLoadRequestedDirectPageWithCountTotal() {
    List<ExemptionSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(1L, 11L)
            .mapToObj(number -> exemptionResult("EX-" + number))
            .toList();
    TestExemptionRepository repository = new TestExemptionRepository(rows);

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

  @Test
  void searchShouldNotStitchTwentyLegacyCallsForTwoHundredRows() {
    List<ExemptionSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(1L, 200L)
            .mapToObj(number -> exemptionResult("EX-" + number))
            .toList();
    TestExemptionRepository repository = new TestExemptionRepository(rows);

    Page<ExemptionSearchResultDto> results =
        repository.search(
            new ExemptionSearchCriteria(
                null, null, null, null, null, null, null, null, null, null, null, List.of(), 0, 200));

    assertThat(results.getNumberOfElements()).isEqualTo(200);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @ParameterizedTest
  @MethodSource("supportedSortOrders")
  void searchShouldApplyOnlyWhitelistedSortFields(String requestedSort, String expectedOrder) {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(exemptionResult("EX-1")));

    repository.search(criteriaWithSort(requestedSort));

    assertThat(repository.whereSql()).contains(expectedOrder);
  }

  @Test
  void searchShouldDiscardUntrustedSortTextAndUseTheLegacyDefault() {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(exemptionResult("EX-1")));

    repository.search(criteriaWithSort("balanceRemaining DESC NULLS LAST; DELETE FROM X"));

    assertThat(repository.whereSql())
        .contains("ORDER BY EE.EXEMPTION_NUMBER DESC")
        .doesNotContain("DESC NULLS LAST; DELETE")
        .doesNotContain("DELETE FROM");
  }

  @Test
  void searchShouldSelectOneCanonicalLinkedApplication() {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(exemptionResult("EX-1")));

    repository.search(criteriaWithSort(null));

    assertThat(repository.pageSelectSql())
        .contains("ROW_NUMBER() OVER")
        .contains("PARTITION BY CANON_EEA.EXEMPTION_NUMBER")
        .contains("CANON_ES.ADVERTISING_DATE DESC NULLS LAST")
        .contains("CANON_EEA.APPLICATION_NUMBER DESC")
        .contains("EEA.CANONICAL_RANK = 1");
    assertThat(repository.whereSql()).doesNotContain("CANON_EEA", "GROUP BY");
  }

  @Test
  void searchShouldPreaggregatePermitVolumeBeforeJoiningApplications() {
    TestExemptionRepository repository =
        new TestExemptionRepository(List.of(exemptionResult("EX-1")));

    repository.search(criteriaWithSort(null));

    assertThat(repository.pageSelectSql())
        .contains("WITH PAGE_EXEMPTIONS AS")
        .contains("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY")
        .contains("PERMIT_VOLUME_BY_EXEMPTION AS")
        .contains("SUM(EPD.PERMIT_VOLUME) AS USED_VOLUME")
        .contains("INNER JOIN PAGE_EXEMPTIONS PE_VOLUME")
        .contains("LEFT JOIN PERMIT_VOLUME_BY_EXEMPTION PV")
        .doesNotContain("LEFT JOIN EXPORT_PERMIT_DETAIL EPD");
    assertThat(repository.pageSelectSql().indexOf("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"))
        .isLessThan(repository.pageSelectSql().indexOf("PERMIT_VOLUME_BY_EXEMPTION AS"));
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

  @Test
  void detailShouldDeriveUsedVolumeLikeLegacy() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("EXEMPTION_NUMBER")).thenReturn("EX-205");
    when(resultSet.getString("EXPORT_EXEMPTION_TYPE_CODE")).thenReturn("M");
    when(resultSet.getString("ENTRY_USERID")).thenReturn("IDIR\\CREATOR");
    when(resultSet.getString("UPDATE_USERID")).thenReturn("IDIR\\EDITOR");
    when(resultSet.getDouble("APPROVED_VOLUME")).thenReturn(500.0d);
    when(resultSet.getDouble("VOLUME_REMAINING")).thenReturn(192.8d);
    when(resultSet.wasNull()).thenReturn(false);
    MappingExemptionRepository repository = new MappingExemptionRepository(resultSet);

    var detail = repository.findByExemptionNumber("EX-205").orElseThrow();

    assertThat(detail.approvedVolume()).isEqualTo(500.0d);
    assertThat(detail.usedVolume()).isEqualTo(307.2d);
    assertThat(detail.remainingVolume()).isEqualTo(192.8d);
    assertThat(detail.author()).isEqualTo("IDIR\\EDITOR");
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
        Arguments.of("listingDate DESC", "ORDER BY ADVERTISING_DATE DESC"),
        Arguments.of("expiryDate", "ORDER BY EE.EXPIRY_DATE ASC"),
        Arguments.of("region DESC", "ORDER BY EO.ORG_UNIT_NAME DESC"));
  }

  private static ExemptionSearchCriteria scopedSummaryCriteria(
      String sortField, String exemptionType) {
    return scopedSummaryCriteria(sortField, exemptionType, 0, 10);
  }

  private static ExemptionSearchCriteria scopedSummaryCriteria(
      String sortField, String exemptionType, int page, int size) {
    return new ExemptionSearchCriteria(
        null,
        null,
        null,
        exemptionType,
        null,
        "00001074",
        null,
        null,
        null,
        null,
        null,
        List.of(),
        true,
        false,
        true,
        sortField,
        page,
        size);
  }

  private static final class TestExemptionRepository extends ExemptionRepository {
    private final List<?> rows;
    private String whereSql;
    private List<Object> bindValues;
    private String pageSelectSql;
    private String countSelectSql;
    private int countCalls;
    private int pageCalls;

    TestExemptionRepository() {
      this(List.of());
    }

    TestExemptionRepository(List<?> rows) {
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

    int countCalls() {
      return countCalls;
    }

    int pageCalls() {
      return pageCalls;
    }

    @Override
    protected int queryDirectCount(String selectSql, DirectSql where) {
      countSelectSql = selectSql;
      whereSql = where.sql();
      bindValues = where.bindValues();
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

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Page<T> queryDirectPageWithTail(
        String selectPrefix,
        DirectSql whereAndOrder,
        String selectTail,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      pageSelectSql =
          selectPrefix
              + whereAndOrder.sql()
              + " OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
              + selectTail;
      whereSql = whereAndOrder.sql();
      bindValues = whereAndOrder.bindValues();
      pageCalls++;
      int fromIndex = Math.min(rows.size(), Math.max(0, page) * Math.max(1, size));
      int toIndex = Math.min(rows.size(), fromIndex + Math.max(1, size));
      List<T> content = (List<T>) rows.subList(fromIndex, toIndex);
      return new PageImpl<>(content, PageRequest.of(page, size), totalElements);
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
    protected <T> Page<T> queryDirectPage(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      try {
        return new PageImpl<>(
            List.of(rowMapper.map(resultSet)), PageRequest.of(page, size), totalElements);
      } catch (SQLException ex) {
        throw new DataRetrievalFailureException("Unable to map exemption cursor", ex);
      }
    }

    @Override
    protected <T> Page<T> queryDirectPageWithTail(
        String selectPrefix,
        DirectSql whereAndOrder,
        String selectTail,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      try {
        return new PageImpl<>(
            List.of(rowMapper.map(resultSet)), PageRequest.of(page, size), totalElements);
      } catch (SQLException ex) {
        throw new DataRetrievalFailureException("Unable to map exemption cursor", ex);
      }
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      try {
        return List.of(rowMapper.map(resultSet));
      } catch (SQLException ex) {
        throw new DataRetrievalFailureException("Unable to map exemption cursor", ex);
      }
    }
  }
}

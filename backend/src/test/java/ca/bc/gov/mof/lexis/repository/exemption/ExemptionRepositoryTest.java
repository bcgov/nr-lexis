package ca.bc.gov.mof.lexis.repository.exemption;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import org.springframework.data.domain.Page;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
        .contains("EEA.APPLICATION_NUMBER")
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

  private static ExemptionSearchResultDto exemptionResult(String exemptionNumber) {
    return new ExemptionSearchResultDto(
        exemptionNumber, "Type", "New", "00000001", 900123L, null, null, "Region", 100d, false);
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
}

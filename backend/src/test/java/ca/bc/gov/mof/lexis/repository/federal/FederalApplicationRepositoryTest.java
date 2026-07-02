package ca.bc.gov.mof.lexis.repository.federal;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import org.springframework.data.domain.Page;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | FederalApplicationRepository")
class FederalApplicationRepositoryTest {

  @Test
  void searchShouldUseFederalViewAliasForDynamicCriteria() {
    TestFederalApplicationRepository repository = new TestFederalApplicationRepository();

    repository.search(
        new FederalApplicationSearchCriteria(
            "900123",
            "PKG-1",
            "EX-1",
            "APP",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            "00077881",
            "00055667",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("v.FED_APPLICATION_NUMBER")
        .contains("v.EXPORT_JURISDICTION_CODE")
        .contains("ORDER BY v.APPLICATION_NUMBER DESC")
        .doesNotContain("EEA.");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "F",
            "EX-1",
            "APP",
            "2026-01-01",
            "2026-01-31",
            "2026-02-01",
            "2026-02-28",
            "00077881",
            "00077881",
            "00055667");
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<FederalApplicationSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(900101L, 900110L)
            .mapToObj(FederalApplicationRepositoryTest::federalResult)
            .toList();
    TestFederalApplicationRepository repository =
        new TestFederalApplicationRepository(
            List.<List<?>>of(firstPage, List.of(federalResult(900111L))));

    Page<FederalApplicationSearchResultDto> results =
        repository.search(
            new FederalApplicationSearchCriteria(
                null, null, null, null, null, null, null, null, null, null, 0, 10));

    assertThat(results.getContent())
        .extracting(FederalApplicationSearchResultDto::applicationNumber)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  private static FederalApplicationSearchResultDto federalResult(long applicationNumber) {
    return new FederalApplicationSearchResultDto(
        applicationNumber, "FED-" + applicationNumber, "New", "Client", null, null, null, null, null, true);
  }

  private static final class TestFederalApplicationRepository extends FederalApplicationRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private int pageCalls;

    TestFederalApplicationRepository() {
      this(List.of());
    }

    TestFederalApplicationRepository(List<List<?>> pages) {
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

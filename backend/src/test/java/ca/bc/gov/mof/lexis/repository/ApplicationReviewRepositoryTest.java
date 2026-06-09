package ca.bc.gov.mof.lexis.repository;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.SearchPage;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | ApplicationReviewRepository")
class ApplicationReviewRepositoryTest {

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestApplicationReviewRepository repository = new TestApplicationReviewRepository();

    repository.search(
        new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<ApplicationReviewSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(900101L, 900110L)
            .mapToObj(ApplicationReviewRepositoryTest::reviewResult)
            .toList();
    TestApplicationReviewRepository repository =
        new TestApplicationReviewRepository(
            List.<List<?>>of(firstPage, List.of(reviewResult(900111L))));

    SearchPage<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.results())
        .extracting(ApplicationReviewSearchResultDto::applicationNumber)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.total()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  private static ApplicationReviewSearchResultDto reviewResult(long applicationNumber) {
    return new ApplicationReviewSearchResultDto(
        applicationNumber, 100d, "Cedar", LocalDate.of(2026, 1, 1), "New", "Region", true);
  }

  private static final class TestApplicationReviewRepository extends ApplicationReviewRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private int pageCalls;

    TestApplicationReviewRepository() {
      this(List.of());
    }

    TestApplicationReviewRepository(List<List<?>> pages) {
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

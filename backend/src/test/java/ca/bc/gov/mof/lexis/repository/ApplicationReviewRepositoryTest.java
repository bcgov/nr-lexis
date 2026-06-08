package ca.bc.gov.mof.lexis.repository;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
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
  void searchShouldLoadAllLegacyPages() {
    TestApplicationReviewRepository repository =
        new TestApplicationReviewRepository(
            List.of(
                List.of(
                    new ApplicationReviewSearchResultDto(
                        900123L, 100d, "Cedar", LocalDate.of(2026, 1, 1), "New", "Region 1", true)),
                List.of(
                    new ApplicationReviewSearchResultDto(
                        900124L, 200d, "Hemlock", LocalDate.of(2026, 1, 2), "New", "Region 2", true))));

    List<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results)
        .extracting(ApplicationReviewSearchResultDto::applicationNumber)
        .containsExactly(900123L, 900124L);
    assertThat(repository.pageCalls()).isEqualTo(3);
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
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryDynamicPagedProcedure(
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

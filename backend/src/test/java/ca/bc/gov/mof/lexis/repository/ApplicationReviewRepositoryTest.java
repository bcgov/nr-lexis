package ca.bc.gov.mof.lexis.repository;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
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

  private static final class TestApplicationReviewRepository extends ApplicationReviewRepository {
    private String whereSql;
    private List<String> bindValues;

    TestApplicationReviewRepository() {
      super(null);
    }

    String whereSql() {
      return whereSql;
    }

    List<String> bindValues() {
      return bindValues;
    }

    @Override
    protected <T> List<T> queryDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      this.whereSql = whereSql;
      this.bindValues = bindValues;
      return List.of();
    }
  }
}

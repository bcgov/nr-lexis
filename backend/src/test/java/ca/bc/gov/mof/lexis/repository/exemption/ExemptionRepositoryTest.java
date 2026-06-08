package ca.bc.gov.mof.lexis.repository.exemption;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | ExemptionRepository")
class ExemptionRepositoryTest {

  @Test
  void searchShouldUseExemptionPackageAliasesForDynamicCriteria() {
    TestExemptionRepository repository = new TestExemptionRepository();

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

  private static final class TestExemptionRepository extends ExemptionRepository {
    private String whereSql;
    private List<String> bindValues;

    TestExemptionRepository() {
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

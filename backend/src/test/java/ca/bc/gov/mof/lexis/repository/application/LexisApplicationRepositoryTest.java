package ca.bc.gov.mof.lexis.repository.application;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | LexisApplicationRepository")
class LexisApplicationRepositoryTest {

  @Test
  void searchShouldUseProvincialApplicationAliasesForDynamicCriteria() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            "900123",
            "PKG-1",
            "EX-1",
            "B",
            "APP",
            "00077881",
            "00055667",
            "H",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            List.of(1904L, 1905L),
            "listingDate DESC",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EEA.APPLICATION_NUMBER")
        .contains("EP.PACKAGE_NUMBER")
        .contains("ES.ADVERTISING_DATE")
        .contains("EEA.EXPORT_JURISDICTION_CODE <> 'F'")
        .contains("ORDER BY ES.ADVERTISING_DATE DESC, EEA.APPLICATION_NUMBER ASC")
        .doesNotContain("v.");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "EX-1",
            "APP",
            "H",
            "2026-01-01",
            "2026-01-31",
            "2026-02-01",
            "2026-02-28",
            "00077881",
            "N",
            "1904",
            "1905",
            "B",
            "00055667",
            "00055667");
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql()).doesNotContain("EEA.ORG_UNIT_NO");
    assertThat(repository.bindValues()).containsExactly("N");
  }

  private static final class TestLexisApplicationRepository extends LexisApplicationRepository {
    private String whereSql;
    private List<String> bindValues;

    TestLexisApplicationRepository() {
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

package ca.bc.gov.mof.lexis.repository.permit;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | PermitRepository")
class PermitRepositoryTest {

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
        .contains("ORDER BY EPD.EXPORT_PERMIT_ISSUE_DATE ASC")
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
            "00055667",
            "00077881",
            "00077881",
            "1904");
  }

  private static final class TestPermitRepository extends PermitRepository {
    private String whereSql;
    private List<String> bindValues;

    TestPermitRepository() {
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

package ca.bc.gov.mof.lexis.repository.permit;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.DynamicSearchPage;
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

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestPermitRepository repository = new TestPermitRepository();

    repository.search(
        new PermitSearchCriteria(
            null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("EPD.ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  @Test
  void searchShouldLoadAllLegacyPagesForTotal() {
    List<PermitSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(700001L, 700010L)
            .mapToObj(PermitRepositoryTest::permitResult)
            .toList();
    TestPermitRepository repository =
        new TestPermitRepository(List.<List<?>>of(firstPage, List.of(permitResult(700011L))));

    DynamicSearchPage<PermitSearchResultDto> results =
        repository.search(
            new PermitSearchCriteria(
                null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.results())
        .extracting(PermitSearchResultDto::permitNumber)
        .containsExactly(700001L, 700002L, 700003L, 700004L, 700005L, 700006L, 700007L, 700008L, 700009L, 700010L);
    assertThat(results.total()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(2);
  }

  private static PermitSearchResultDto permitResult(long permitNumber) {
    return new PermitSearchResultDto(permitNumber, "Active", "00000001", "00000002", 100d, null, "Region");
  }

  private static final class TestPermitRepository extends PermitRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private int pageCalls;

    TestPermitRepository() {
      this(List.of());
    }

    TestPermitRepository(List<List<?>> pages) {
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

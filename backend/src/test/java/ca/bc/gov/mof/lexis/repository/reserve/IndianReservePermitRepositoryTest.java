package ca.bc.gov.mof.lexis.repository.reserve;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.SearchPage;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | IndianReservePermitRepository")
class IndianReservePermitRepositoryTest {

  @Test
  void searchShouldUseReservePermitAliasesForDynamicCriteria() {
    TestIndianReservePermitRepository repository = new TestIndianReservePermitRepository();

    repository.search(
        new IndianReservePermitSearchCriteria(
            "700001",
            "PKG-1",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            0,
            10));

    assertThat(repository.whereSql())
        .contains("CLIENT_NUMBER IS NOT NULL")
        .contains("EIRPD.EXPORT_INDIAN_RSRV_PRMT_DTL_ID")
        .contains("EP.PACKAGE_NUMBER")
        .contains("EIRPD.EXPORT_PERMIT_ISSUE_DATE")
        .contains("EIRPD.ESTIMATED_SHIPPING_DATE")
        .contains("ORDER BY EIRPD.EXPORT_INDIAN_RSRV_PRMT_DTL_ID DESC")
        .doesNotContain("v.");
    assertThat(repository.bindValues())
        .containsExactly("700001", "PKG-1", "2026-01-01", "2026-01-31", "2026-02-01", "2026-02-28");
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<IndianReservePermitSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(700001L, 700010L)
            .mapToObj(number -> permitResult(String.valueOf(number)))
            .toList();
    TestIndianReservePermitRepository repository =
        new TestIndianReservePermitRepository(
            List.<List<?>>of(firstPage, List.of(permitResult("700011"))));

    SearchPage<IndianReservePermitSearchResultDto> results =
        repository.search(new IndianReservePermitSearchCriteria(null, null, null, null, null, null, 0, 10));

    assertThat(results.results())
        .extracting(IndianReservePermitSearchResultDto::permitNumber)
        .containsExactly("700001", "700002", "700003", "700004", "700005", "700006", "700007", "700008", "700009", "700010");
    assertThat(results.total()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  private static IndianReservePermitSearchResultDto permitResult(String permitNumber) {
    return new IndianReservePermitSearchResultDto(permitNumber, "00000001", null, null);
  }

  private static final class TestIndianReservePermitRepository extends IndianReservePermitRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private int pageCalls;

    TestIndianReservePermitRepository() {
      this(List.of());
    }

    TestIndianReservePermitRepository(List<List<?>> pages) {
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

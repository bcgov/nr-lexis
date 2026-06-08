package ca.bc.gov.mof.lexis.repository.reserve;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
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
  void searchShouldLoadAllLegacyPages() {
    TestIndianReservePermitRepository repository =
        new TestIndianReservePermitRepository(
            List.of(
                List.of(new IndianReservePermitSearchResultDto("700001", "00000001", null, null)),
                List.of(new IndianReservePermitSearchResultDto("700002", "00000002", null, null))));

    List<IndianReservePermitSearchResultDto> results =
        repository.search(new IndianReservePermitSearchCriteria(null, null, null, null, null, null, 0, 10));

    assertThat(results)
        .extracting(IndianReservePermitSearchResultDto::permitNumber)
        .containsExactly("700001", "700002");
    assertThat(repository.pageCalls()).isEqualTo(3);
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

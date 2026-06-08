package ca.bc.gov.mof.lexis.repository.offer;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | PurchaseOfferRepository")
class PurchaseOfferRepositoryTest {

  @Test
  void searchShouldUsePurchaseOfferPackageAliasesForDynamicCriteria() {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.search(
        new PurchaseOfferSearchCriteria(
            "900123",
            "PKG-1",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            "00055667",
            "00088999",
            true,
            true,
            List.of(1904L),
            "listingDate DESC",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EEA.APPLICATION_NUMBER")
        .contains("PO.PACKAGE_NUMBER")
        .contains("ES.ADVERTISING_DATE")
        .contains("PO.OFFER_WITHDRAWAL_DATE")
        .contains("EEA.ORG_UNIT_NO")
        .contains("PO.OFFER_WITHDRAWAL_DATE IS NULL")
        .contains("EEA.EXPORT_JURISDICTION_CODE = 'P'")
        .contains("ORDER BY ES.ADVERTISING_DATE DESC")
        .doesNotContain("v.");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "2026-01-01",
            "2026-01-31",
            "2026-02-01",
            "2026-02-28",
            "1904",
            "00055667",
            "00055667",
            "00088999");
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.search(
        new PurchaseOfferSearchCriteria(
            null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("EEA.ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  private static final class TestPurchaseOfferRepository extends PurchaseOfferRepository {
    private String whereSql;
    private List<String> bindValues;

    TestPurchaseOfferRepository() {
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

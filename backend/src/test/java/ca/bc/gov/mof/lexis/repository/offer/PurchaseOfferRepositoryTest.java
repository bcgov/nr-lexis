package ca.bc.gov.mof.lexis.repository.offer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.SearchPage;
import java.sql.CallableStatement;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
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

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<PurchaseOfferSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(810001L, 810010L)
            .mapToObj(PurchaseOfferRepositoryTest::offerResult)
            .toList();
    TestPurchaseOfferRepository repository =
        new TestPurchaseOfferRepository(List.<List<?>>of(firstPage, List.of(offerResult(810011L))));

    SearchPage<PurchaseOfferSearchResultDto> results =
        repository.search(
            new PurchaseOfferSearchCriteria(
                null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.results())
        .extracting(PurchaseOfferSearchResultDto::offerNumber)
        .containsExactly(810001L, 810002L, 810003L, 810004L, 810005L, 810006L, 810007L, 810008L, 810009L, 810010L);
    assertThat(results.total()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  private static PurchaseOfferSearchResultDto offerResult(long offerNumber) {
    return new PurchaseOfferSearchResultDto(offerNumber, 900123L, "PKG-1", null, "Region", null);
  }

  @Test
  void insertShouldBindBlankManufacturingFacilityDefaultWhenInputIsBlank() throws Exception {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.insertOffer(
        new PurchaseOfferRepository.PurchaseOfferInsertRecord(
            null,
            "Example Lumber",
            "Alex Example",
            12500.25d,
            LocalDate.of(2026, 3, 2),
            null,
            null,
            "N",
            "Y",
            null,
            "N",
            null,
            "P",
            " ",
            "idir\\jsmith",
            null,
            null,
            "Port Moody",
            null,
            1000456L,
            99.9d));

    verify(repository.callableStatement()).setString(14, " ");
    verify(repository.callableStatement(), never()).setNull(14, java.sql.Types.VARCHAR);
  }

  @Test
  void updateShouldBindBlankManufacturingFacilityDefaultWhenInputIsMissing() throws Exception {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.updateOffer(
        new PurchaseOfferRepository.PurchaseOfferUpdateRecord(
            81001L,
            null,
            "Example Lumber",
            "Alex Example",
            12500.25d,
            LocalDate.of(2026, 3, 2),
            null,
            null,
            "N",
            "Y",
            null,
            "N",
            null,
            "P",
            null,
            "Port Moody",
            null,
            "creator",
            null,
            "idir\\jsmith",
            99.9d));

    verify(repository.callableStatement()).setString(15, " ");
    verify(repository.callableStatement(), never()).setNull(15, java.sql.Types.VARCHAR);
  }

  private static final class TestPurchaseOfferRepository extends PurchaseOfferRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private CallableStatement callableStatement;
    private int pageCalls;

    TestPurchaseOfferRepository() {
      this(List.of());
    }

    TestPurchaseOfferRepository(List<List<?>> pages) {
      super(null);
      this.pages = pages;
    }

    String whereSql() {
      return whereSql;
    }

    List<String> bindValues() {
      return bindValues;
    }

    CallableStatement callableStatement() {
      return callableStatement;
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

    @Override
    protected <T> Optional<T> queryCursorSingle(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      bind(binder);
      return Optional.empty();
    }

    @Override
    protected boolean executeProcedure(String procedureSignature, SqlConsumer<CallableStatement> binder) {
      bind(binder);
      return true;
    }

    private void bind(SqlConsumer<CallableStatement> binder) {
      callableStatement = mock(CallableStatement.class);
      try {
        binder.accept(callableStatement);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }
}

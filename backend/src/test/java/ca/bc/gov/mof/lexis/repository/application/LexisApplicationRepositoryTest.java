package ca.bc.gov.mof.lexis.repository.application;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import org.springframework.data.domain.Page;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | LexisApplicationRepository")
class LexisApplicationRepositoryTest {

  @Test
  void loadExemptionReasonOptionsShouldUseLegacyProcedureName() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    assertThat(repository.loadExemptionReasonOptions())
        .containsExactly(new CodeNameDto("U", "Utilization"));
    assertThat(repository.codeNameProcedureSignature())
        .isEqualTo("LEXIS_CODES.FIND_ALL_EXEMPT_RSN_CODES(?)");
  }

  @Test
  void searchShouldUseProvincialApplicationViewAliasForDynamicCriteria() {
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
        .contains("v.APPLICATION_NUMBER")
        .contains("v.PACKAGE_NUMBER")
        .contains("v.ADVERTISING_DATE")
        .contains("v.EXPORT_JURISDICTION_CODE <> 'F'")
        .contains("ORDER BY v.ADVERTISING_DATE DESC, v.APPLICATION_NUMBER ASC")
        .doesNotContain("EEA.")
        .doesNotContain("EP.")
        .doesNotContain("ES.");
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
    assertThat(repository.whereSql()).doesNotContain("v.ORG_UNIT_NO");
    assertThat(repository.bindValues()).containsExactly("N");
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<LexisApplicationSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(900101L, 900110L)
            .mapToObj(LexisApplicationRepositoryTest::applicationResult)
            .toList();
    TestLexisApplicationRepository repository =
        new TestLexisApplicationRepository(
            List.<List<?>>of(firstPage, List.of(applicationResult(900111L))));

    Page<LexisApplicationSearchResultDto> results =
        repository.search(
            new LexisApplicationSearchCriteria(
                null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(LexisApplicationSearchResultDto::application)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  private static LexisApplicationSearchResultDto applicationResult(long applicationNumber) {
    return new LexisApplicationSearchResultDto(
        applicationNumber, "New", "Client", "00000001", null, null, "Region", 100d, true, false);
  }

  private static final class TestLexisApplicationRepository extends LexisApplicationRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private String codeNameProcedureSignature;
    private int pageCalls;

    TestLexisApplicationRepository() {
      this(List.of());
    }

    TestLexisApplicationRepository(List<List<?>> pages) {
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

    String codeNameProcedureSignature() {
      return codeNameProcedureSignature;
    }

    @Override
    protected List<CodeNameDto> loadCodeNameOptions(String procedureSignature) {
      codeNameProcedureSignature = procedureSignature;
      return List.of(new CodeNameDto("U", "Utilization"));
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

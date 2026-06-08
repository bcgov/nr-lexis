package ca.bc.gov.mof.lexis.repository.oracle;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | OracleRepositorySupport")
class OracleRepositorySupportTest {

  @Test
  void queryDynamicPageShouldLoadOnlyRequestedLegacyPage() {
    List<String> firstPage =
        List.of(
            "row-1",
            "row-2",
            "row-3",
            "row-4",
            "row-5",
            "row-6",
            "row-7",
            "row-8",
            "row-9",
            "row-10");
    TestRepository repository = new TestRepository(List.of(firstPage, List.of("row-11")));

    DynamicSearchPage<String> results = repository.loadPage(0, 10);

    assertThat(results.results()).containsExactlyElementsOf(firstPage);
    assertThat(results.total()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void queryDynamicPageShouldSpanLegacyPagesForLargerPageSize() {
    List<String> firstPage =
        List.of(
            "row-1",
            "row-2",
            "row-3",
            "row-4",
            "row-5",
            "row-6",
            "row-7",
            "row-8",
            "row-9",
            "row-10");
    List<String> secondPage = List.of("row-11", "row-12", "row-13");
    TestRepository repository = new TestRepository(List.of(firstPage, secondPage));

    DynamicSearchPage<String> results = repository.loadPage(0, 20);

    assertThat(results.results()).containsExactlyElementsOf(concat(firstPage, secondPage));
    assertThat(results.total()).isEqualTo(13);
    assertThat(repository.pageCalls()).isEqualTo(2);
  }

  @Test
  void queryDynamicPageShouldOffsetWithinLegacyPage() {
    TestRepository repository =
        new TestRepository(
            List.of(
                List.of(
                    "row-1",
                    "row-2",
                    "row-3",
                    "row-4",
                    "row-5",
                    "row-6",
                    "row-7",
                    "row-8",
                    "row-9",
                    "row-10")));

    DynamicSearchPage<String> results = repository.loadPage(1, 5);

    assertThat(results.results()).containsExactly("row-6", "row-7", "row-8", "row-9", "row-10");
    assertThat(results.total()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void loadCodeNameOptionsShouldFallbackWhenCodePackageReturnsEmpty() {
    TestRepository repository = new TestRepository(List.of());

    List<CodeNameDto> options = repository.loadApplicationStatuses();

    assertThat(options)
        .extracting(CodeNameDto::code)
        .contains("NEW", "APP", "PND", "REJ", "WDN", "EXE", "EXP", "PMT");
  }

  @Test
  void loadCodeNameOptionsShouldFallbackForReportOptionCodesWhenCodePackageReturnsEmpty() {
    TestRepository repository = new TestRepository(List.of());

    assertThat(repository.loadExemptionReasons())
        .containsExactly(
            new CodeNameDto("S", "Surplus"),
            new CodeNameDto("U", "Utilization"),
            new CodeNameDto("E", "Economic"));
    assertThat(repository.loadGrowthTypes())
        .containsExactly(
            new CodeNameDto("O", "Old Growth"),
            new CodeNameDto("S", "Second Growth"));
    assertThat(repository.loadCountries())
        .extracting(CodeNameDto::code)
        .containsExactly("US", "JP", "CN", "NZ");
    assertThat(repository.loadPorts())
        .containsExactly(
            new CodeNameDto("VAN", "Vancouver"),
            new CodeNameDto("OT", "Other"));
  }

  @Test
  void fallbackCodeDescriptionShouldReturnStaticLegacyDescriptions() {
    TestRepository repository = new TestRepository(List.of());

    assertThat(repository.loadGrowthTypeDescription("s")).contains("Second Growth");
    assertThat(repository.loadPackageStatusDescription("ACT")).contains("Active");
    assertThat(repository.loadPackageStatusDescription("SHT")).contains("Shutout");
    assertThat(repository.loadProductTypeDescription("T")).contains("Unmanufactured Timber");
    assertThat(repository.loadProductTypeDescription("unknown")).isEmpty();
  }

  @Test
  void auditUserOrDefaultShouldNeverReturnBlankUser() {
    TestRepository repository = new TestRepository(List.of());

    assertThat(repository.auditUser(null)).isEqualTo("system");
    assertThat(repository.auditUser("  ")).isEqualTo("system");
    assertThat(repository.auditUser(" idir\\jsmith ")).isEqualTo("idir\\jsmith");
    assertThat(repository.auditUser("12345678-1234-1234-1234-123456789012"))
        .isEqualTo("12345678-1234-1234-1234-123456");
  }

  @Test
  void loadOrgUnitOptionsShouldFallbackWhenCodePackageReturnsEmpty() {
    TestRepository repository = new TestRepository(List.of());

    List<CodeNameDto> options = repository.loadRegions();

    assertThat(options)
        .contains(
            new CodeNameDto("1833", "RNI"),
            new CodeNameDto("1908", "RSK"),
            new CodeNameDto("1910", "RWC"));
  }

  private static final class TestRepository extends OracleRepositorySupport {
    private final List<List<String>> pages;
    private int pageCalls;

    TestRepository(List<List<String>> pages) {
      super(null);
      this.pages = pages;
    }

    DynamicSearchPage<String> loadPage(int page, int size) {
      return queryDynamicPage("LEXIS_GROUP_5.FIND_TEST(?,?,?,?,?)", " WHERE 1=1", List.of(), page, size, rs -> "");
    }

    List<CodeNameDto> loadApplicationStatuses() {
      return loadCodeNameOptions(LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)");
    }

    List<CodeNameDto> loadRegions() {
      return loadOrgUnitOptions(false);
    }

    List<CodeNameDto> loadExemptionReasons() {
      return loadCodeNameOptions(LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_RSN_CODES(?)");
    }

    List<CodeNameDto> loadGrowthTypes() {
      return loadCodeNameOptions(LEXIS_CODES_PACKAGE + "FIND_ALL_GROWTH_TYPE_CODES(?)");
    }

    List<CodeNameDto> loadCountries() {
      return loadCodeNameOptions(LEXIS_CODES_PACKAGE + "FIND_ALL_COUNTRY_CODES(?)");
    }

    List<CodeNameDto> loadPorts() {
      return loadCodeNameOptions(LEXIS_CODES_PACKAGE + "FIND_ALL_PORT_CODES(?)");
    }

    Optional<String> loadGrowthTypeDescription(String code) {
      return fallbackCodeDescription(LEXIS_CODES_PACKAGE + "FIND_GROWTH_TYPE_CODE(?,?)", code);
    }

    Optional<String> loadPackageStatusDescription(String code) {
      return fallbackCodeDescription(LEXIS_CODES_PACKAGE + "FIND_PACKAGE_STATUS_CODE(?,?)", code);
    }

    Optional<String> loadProductTypeDescription(String code) {
      return fallbackCodeDescription(LEXIS_CODES_PACKAGE + "FIND_PRODUCT_TYPE_CODE(?,?)", code);
    }

    String auditUser(String userId) {
      return auditUserOrDefault(userId);
    }

    int pageCalls() {
      return pageCalls;
    }

    @Override
    protected <T> List<T> queryCursorProcedure(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return List.of();
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      pageCalls++;
      if (page >= pages.size()) {
        return List.of();
      }
      return (List<T>) pages.get(page);
    }
  }

  private static List<String> concat(List<String> first, List<String> second) {
    return java.util.stream.Stream.concat(first.stream(), second.stream()).toList();
  }
}

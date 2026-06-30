package ca.bc.gov.mof.lexis.repository.oracle;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Slice;

@DisplayName("Unit Test | OracleRepositorySupport")
class OracleRepositorySupportTest {

  @Test
  void queryLegacyDynamicPageShouldReturnExactTotalForFirstPage() {
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

    Page<String> results = repository.loadPage(0, 10);

    assertThat(results.getContent()).containsExactlyElementsOf(firstPage);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(2);
    assertThat(repository.requestedPages()).containsExactly(0, 1);
  }

  @Test
  void queryLegacyDynamicPageShouldSpanLegacyPagesForLargerPageSize() {
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

    Page<String> results = repository.loadPage(0, 20);

    assertThat(results.getContent()).containsExactlyElementsOf(concat(firstPage, secondPage));
    assertThat(results.getTotalElements()).isEqualTo(13);
    assertThat(repository.pageCalls()).isEqualTo(2);
  }

  @Test
  void queryLegacyDynamicPageShouldOffsetWithinLegacyPage() {
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

    Page<String> results = repository.loadPage(1, 5);

    assertThat(results.getContent()).containsExactly("row-6", "row-7", "row-8", "row-9", "row-10");
    assertThat(results.getTotalElements()).isEqualTo(10);
    assertThat(repository.pageCalls()).isEqualTo(2);
    assertThat(repository.requestedPages()).containsExactly(0, 1);
  }

  @Test
  void queryLegacyDynamicPageShouldReturnExactTotalForSecondUiPage() {
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
    List<String> secondPage =
        List.of(
            "row-11",
            "row-12",
            "row-13",
            "row-14",
            "row-15",
            "row-16",
            "row-17",
            "row-18",
            "row-19",
            "row-20");
    TestRepository repository = new TestRepository(List.of(firstPage, secondPage, List.of("row-21")));

    Page<String> results = repository.loadPage(1, 10);

    assertThat(results.getContent()).containsExactlyElementsOf(secondPage);
    assertThat(results.getTotalElements()).isEqualTo(21);
    assertThat(repository.pageCalls()).isEqualTo(3);
    assertThat(repository.requestedPages()).containsExactly(0, 1, 2);
  }

  @Test
  void queryLegacyDynamicPageShouldReturnExactTotalForLargeResultSets() {
    List<List<String>> pages = new java.util.ArrayList<>();
    for (int page = 0; page < 50; page++) {
      List<String> rows = new java.util.ArrayList<>();
      for (int row = 1; row <= 10; row++) {
        rows.add("row-" + ((page * 10) + row));
      }
      pages.add(rows);
    }
    TestRepository repository = new TestRepository(pages);

    Page<String> results = repository.loadPage(0, 10);

    assertThat(results.getContent())
        .containsExactly("row-1", "row-2", "row-3", "row-4", "row-5", "row-6", "row-7", "row-8", "row-9", "row-10");
    assertThat(results.getTotalElements()).isEqualTo(500);
    assertThat(repository.pageCalls()).isEqualTo(51);
    assertThat(repository.requestedPages().get(0)).isZero();
    assertThat(repository.requestedPages().get(50)).isEqualTo(50);
  }

  @Test
  void queryLegacyDynamicPageWithTotalShouldFetchOnlyRequiredLegacyPages() {
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
    List<String> secondPage =
        List.of(
            "row-11",
            "row-12",
            "row-13",
            "row-14",
            "row-15",
            "row-16",
            "row-17",
            "row-18",
            "row-19",
            "row-20");
    TestRepository repository = new TestRepository(List.of(firstPage, secondPage, List.of("row-21")));

    Page<String> results = repository.loadPageWithTotal(1, 10, 21);

    assertThat(results.getContent()).containsExactlyElementsOf(secondPage);
    assertThat(results.getTotalElements()).isEqualTo(21);
    assertThat(repository.pageCalls()).isEqualTo(1);
    assertThat(repository.requestedPages()).containsExactly(1);
  }

  @Test
  void queryLegacyDynamicPageWithTotalShouldFetchLargeUiPagesFromRequiredLegacyWindow() {
    List<List<String>> pages = new java.util.ArrayList<>();
    for (int page = 0; page < 10; page++) {
      List<String> rows = new java.util.ArrayList<>();
      for (int row = 1; row <= 10; row++) {
        rows.add("row-" + ((page * 10) + row));
      }
      pages.add(rows);
    }
    TestRepository repository = new TestRepository(pages);

    Page<String> results = repository.loadPageWithTotal(0, 100, 100);

    assertThat(results.getContent()).hasSize(100);
    assertThat(results.getContent().get(0)).isEqualTo("row-1");
    assertThat(results.getContent().get(99)).isEqualTo("row-100");
    assertThat(results.getTotalElements()).isEqualTo(100);
    assertThat(repository.pageCalls()).isEqualTo(10);
    assertThat(repository.requestedPages())
        .containsExactlyInAnyOrder(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
  }

  @Test
  void queryLegacyDynamicPageWithTotalShouldPreserveOffsetAcrossRequiredLegacyWindow() {
    List<List<String>> pages = new java.util.ArrayList<>();
    for (int page = 0; page < 5; page++) {
      List<String> rows = new java.util.ArrayList<>();
      for (int row = 1; row <= 10; row++) {
        rows.add("row-" + ((page * 10) + row));
      }
      pages.add(rows);
    }
    TestRepository repository = new TestRepository(pages);

    Page<String> results = repository.loadPageWithTotal(1, 25, 50);

    assertThat(results.getContent())
        .containsExactly(
            "row-26",
            "row-27",
            "row-28",
            "row-29",
            "row-30",
            "row-31",
            "row-32",
            "row-33",
            "row-34",
            "row-35",
            "row-36",
            "row-37",
            "row-38",
            "row-39",
            "row-40",
            "row-41",
            "row-42",
            "row-43",
            "row-44",
            "row-45",
            "row-46",
            "row-47",
            "row-48",
            "row-49",
            "row-50");
    assertThat(results.getTotalElements()).isEqualTo(50);
    assertThat(repository.pageCalls()).isEqualTo(3);
    assertThat(repository.requestedPages()).containsExactlyInAnyOrder(2, 3, 4);
  }

  @Test
  void queryLegacyDynamicPageWithTotalShouldNotFetchWhenOffsetExceedsKnownTotal() {
    TestRepository repository = new TestRepository(List.of(List.of("row-1")));

    Page<String> results = repository.loadPageWithTotal(10, 10, 20);

    assertThat(results.getContent()).isEmpty();
    assertThat(results.getTotalElements()).isEqualTo(20);
    assertThat(repository.pageCalls()).isZero();
    assertThat(repository.requestedPages()).isEmpty();
  }

  @Test
  void queryLegacyDynamicSliceShouldStopAfterPreviewWindow() {
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
    List<String> secondPage =
        List.of(
            "row-11",
            "row-12",
            "row-13",
            "row-14",
            "row-15",
            "row-16",
            "row-17",
            "row-18",
            "row-19",
            "row-20");
    TestRepository repository = new TestRepository(List.of(firstPage, secondPage, List.of("row-21")));

    Slice<String> results = repository.loadSlice(0, 5);

    assertThat(results.getContent()).containsExactly("row-1", "row-2", "row-3", "row-4", "row-5");
    assertThat(results.hasNext()).isTrue();
    assertThat(repository.requestedPages()).containsExactly(0);
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
        .containsExactly(
            new CodeNameDto("1903", "Cariboo Natural Resource Region"),
            new CodeNameDto("1904", "Kootenay-Boundary Natural Resource Region"),
            new CodeNameDto("1905", "Northeast Natural Resource Region"),
            new CodeNameDto("1906", "Omineca Natural Resource Region"),
            new CodeNameDto("1907", "Thompson-Okanagan Natural Resource Region"),
            new CodeNameDto("1908", "Skeena Natural Resource Region"),
            new CodeNameDto("1909", "South Coast Natural Resource Region"),
            new CodeNameDto("1910", "West Coast Natural Resource Region"));
  }

  @Test
  void loadOrgUnitOptionsShouldFallbackWhenCodePackageReturnsNoNaturalResourceRegions() {
    TestRepository repository =
        new TestRepository(
            List.of(),
            List.of(
                new CodeNameDto("12", "Coast"),
                new CodeNameDto("24", "Skeena")));

    List<CodeNameDto> options = repository.loadRegions();

    assertThat(options)
        .containsExactly(
            new CodeNameDto("1903", "Cariboo Natural Resource Region"),
            new CodeNameDto("1904", "Kootenay-Boundary Natural Resource Region"),
            new CodeNameDto("1905", "Northeast Natural Resource Region"),
            new CodeNameDto("1906", "Omineca Natural Resource Region"),
            new CodeNameDto("1907", "Thompson-Okanagan Natural Resource Region"),
            new CodeNameDto("1908", "Skeena Natural Resource Region"),
            new CodeNameDto("1909", "South Coast Natural Resource Region"),
            new CodeNameDto("1910", "West Coast Natural Resource Region"));
  }

  private static final class TestRepository extends OracleRepositorySupport {
    private final List<List<String>> pages;
    private final List<CodeNameDto> orgUnitOptions;
    private final List<Integer> requestedPages = Collections.synchronizedList(new java.util.ArrayList<>());
    private final AtomicInteger pageCalls = new AtomicInteger();

    TestRepository(List<List<String>> pages) {
      this(pages, List.of());
    }

    TestRepository(List<List<String>> pages, List<CodeNameDto> orgUnitOptions) {
      super(null);
      this.pages = pages;
      this.orgUnitOptions = orgUnitOptions;
    }

    Page<String> loadPage(int page, int size) {
      return queryLegacyDynamicPage("LEXIS_GROUP_5.FIND_TEST(?,?,?,?,?)", " WHERE 1=1", List.of(), page, size, rs -> "");
    }

    Page<String> loadPageWithTotal(int page, int size, int totalElements) {
      return queryLegacyDynamicPage(
          "LEXIS_GROUP_5.FIND_TEST(?,?,?,?,?)",
          " WHERE 1=1",
          List.of(),
          page,
          size,
          totalElements,
          rs -> "");
    }

    Slice<String> loadSlice(int page, int size) {
      return queryLegacyDynamicSlice("LEXIS_GROUP_5.FIND_TEST(?,?,?,?,?)", " WHERE 1=1", List.of(), page, size, rs -> "");
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
      return pageCalls.get();
    }

    List<Integer> requestedPages() {
      synchronized (requestedPages) {
        return List.copyOf(requestedPages);
      }
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryCursorProcedure(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if ((LEXIS_CODES_PACKAGE + "FIND_ALL_ORG_UNITS(?)").equals(procedureSignature)) {
        return (List<T>) orgUnitOptions;
      }
      return List.of();
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryLegacyDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      pageCalls.incrementAndGet();
      requestedPages.add(page);
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

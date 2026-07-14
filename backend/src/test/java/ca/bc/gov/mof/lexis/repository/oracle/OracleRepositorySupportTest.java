package ca.bc.gov.mof.lexis.repository.oracle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.configuration.OracleLegacyDynamicFetchExecutorConfiguration;
import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Slice;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

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
    String firstLongIdentity = "SERVICE\\shared-machine-client-prefix-one";
    String secondLongIdentity = "SERVICE\\shared-machine-client-prefix-two";

    assertThat(repository.auditUser(null)).isEqualTo("system");
    assertThat(repository.auditUser("  ")).isEqualTo("system");
    assertThat(repository.auditUser(" idir\\jsmith ")).isEqualTo("idir\\jsmith");
    assertThat(repository.auditUser(firstLongIdentity))
        .startsWith("SERVICE\\shared-ma~")
        .isNotEqualTo(repository.auditUser(secondLongIdentity));
  }

  @Test
  void requiredCursorQueryShouldPropagateDependencyFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    doThrow(failure)
        .when(jdbcTemplate)
        .execute(anyString(), any(CallableStatementCallback.class));
    RequiredRepository repository = new RequiredRepository(jdbcTemplate);

    assertThat(repository.loadOptional()).isEmpty();
    assertThatThrownBy(repository::loadFailClosed).isSameAs(failure);
    assertThatThrownBy(repository::loadRequired).isSameAs(failure);
    assertThatThrownBy(repository::mutateRequired).isSameAs(failure);
  }

  @Test
  void requiredCursorQueryShouldRejectMissingRefCursorWhileOptionalQueryStaysSoft() {
    CallableStatement statement = mock(CallableStatement.class);
    RequiredRepository repository =
        new RequiredRepository(jdbcTemplateExecuting(statement));

    assertThatThrownBy(repository::loadRequired)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("returned no cursor");
    assertThatThrownBy(repository::loadFailClosed)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("returned no cursor");
    assertThat(repository.loadOptional()).isEmpty();
  }

  @Test
  void requiredCursorQueryShouldKeepAnEmptyRefCursorAsAValidEmptyResult() throws Exception {
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(statement.getObject(1)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(false);
    RequiredRepository repository =
        new RequiredRepository(jdbcTemplateExecuting(statement));

    assertThat(repository.loadRequired()).isEmpty();
    assertThat(repository.loadFailClosed()).isEmpty();
  }

  @Test
  void requiredCursorQueryShouldRejectMissingColumnsWhileOptionalQueryStaysSoft()
      throws Exception {
    CallableStatement requiredStatement = mock(CallableStatement.class);
    ResultSet requiredResultSet = mock(ResultSet.class);
    when(requiredStatement.getObject(1)).thenReturn(requiredResultSet);
    when(requiredResultSet.next()).thenReturn(true, false);
    when(requiredResultSet.getString("REQUIRED_VALUE"))
        .thenThrow(new SQLException("Invalid column name"));
    RequiredRepository requiredRepository =
        new RequiredRepository(jdbcTemplateExecuting(requiredStatement));

    assertThatThrownBy(requiredRepository::loadRequiredColumn)
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("REQUIRED_VALUE");

    CallableStatement optionalStatement = mock(CallableStatement.class);
    ResultSet optionalResultSet = mock(ResultSet.class);
    when(optionalStatement.getObject(1)).thenReturn(optionalResultSet);
    when(optionalResultSet.next()).thenReturn(true, false);
    when(optionalResultSet.getString("REQUIRED_VALUE"))
        .thenThrow(new SQLException("Invalid column name"));
    RequiredRepository optionalRepository =
        new RequiredRepository(jdbcTemplateExecuting(optionalStatement));

    assertThat(optionalRepository.loadOptionalColumn()).containsExactly((String) null);

    CallableStatement failClosedStatement = mock(CallableStatement.class);
    ResultSet failClosedResultSet = mock(ResultSet.class);
    when(failClosedStatement.getObject(1)).thenReturn(failClosedResultSet);
    when(failClosedResultSet.next()).thenReturn(true, false);
    when(failClosedResultSet.getString("REQUIRED_VALUE"))
        .thenThrow(new SQLException("Invalid column name"));
    RequiredRepository failClosedRepository =
        new RequiredRepository(jdbcTemplateExecuting(failClosedStatement));

    assertThat(failClosedRepository.loadFailClosedColumn()).containsExactly((String) null);
  }

  @Test
  void dynamicPageAndCountShouldPropagateDependencyFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    doThrow(failure)
        .when(jdbcTemplate)
        .execute(anyString(), any(CallableStatementCallback.class));
    DynamicRepository repository = new DynamicRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadDynamicPage).isSameAs(failure);
    assertThatThrownBy(repository::loadDynamicCount).isSameAs(failure);
  }

  @Test
  void dynamicPageShouldRejectMissingCursor() {
    CallableStatement statement = mock(CallableStatement.class);
    JdbcTemplate jdbcTemplate = jdbcTemplateExecuting(statement);
    DynamicRepository repository = new DynamicRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadDynamicPage)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("page cursor");
  }

  @Test
  void dynamicPageShouldRejectMissingJdbcResult() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class))).thenReturn(null);
    DynamicRepository repository = new DynamicRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadDynamicPage)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("page result");
  }

  @Test
  void dynamicPageShouldKeepEmptyCursorAsLegitimateZeroResults() throws Exception {
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(statement.getObject(5)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(false);
    DynamicRepository repository = new DynamicRepository(jdbcTemplateExecuting(statement));

    assertThat(repository.loadDynamicPage()).isEmpty();
  }

  @Test
  void dynamicCountShouldRejectMissingCursorRowAndValue() throws Exception {
    CallableStatement missingCursorStatement = mock(CallableStatement.class);
    DynamicRepository missingCursorRepository =
        new DynamicRepository(jdbcTemplateExecuting(missingCursorStatement));

    assertThatThrownBy(missingCursorRepository::loadDynamicCount)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("count cursor");

    CallableStatement missingRowStatement = mock(CallableStatement.class);
    ResultSet emptyResultSet = mock(ResultSet.class);
    when(missingRowStatement.getObject(4)).thenReturn(emptyResultSet);
    when(emptyResultSet.next()).thenReturn(false);
    DynamicRepository missingRowRepository =
        new DynamicRepository(jdbcTemplateExecuting(missingRowStatement));

    assertThatThrownBy(missingRowRepository::loadDynamicCount)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("count row");

    CallableStatement nullValueStatement = mock(CallableStatement.class);
    ResultSet nullValueResultSet = mock(ResultSet.class);
    when(nullValueStatement.getObject(4)).thenReturn(nullValueResultSet);
    when(nullValueResultSet.next()).thenReturn(true);
    when(nullValueResultSet.getLong("RESULTS_COUNT")).thenReturn(0L);
    when(nullValueResultSet.wasNull()).thenReturn(true);
    DynamicRepository nullValueRepository =
        new DynamicRepository(jdbcTemplateExecuting(nullValueStatement));

    assertThatThrownBy(nullValueRepository::loadDynamicCount)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("count value");
  }

  @Test
  void dynamicCountShouldRejectMissingJdbcResult() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class))).thenReturn(null);
    DynamicRepository repository = new DynamicRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadDynamicCount)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("count result");
  }

  @Test
  void dynamicCountShouldKeepDatabaseZeroAsLegitimateZeroResults() throws Exception {
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(statement.getObject(4)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(true);
    when(resultSet.getLong("RESULTS_COUNT")).thenReturn(0L);
    when(resultSet.wasNull()).thenReturn(false);
    DynamicRepository repository = new DynamicRepository(jdbcTemplateExecuting(statement));

    assertThat(repository.loadDynamicCount()).isZero();
  }

  @Test
  void parallelDynamicPageFailureShouldPropagateInsteadOfReturningPartialPage() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle page unavailable");
    ParallelFailureRepository repository = new ParallelFailureRepository(failure);

    assertThatThrownBy(repository::loadPage).isSameAs(failure);
  }

  @Test
  void saturatedDynamicPageExecutorShouldFailFastWithoutUsingCallerThread() throws Exception {
    ThreadPoolTaskExecutor executor =
        new OracleLegacyDynamicFetchExecutorConfiguration().oracleLegacyDynamicFetchExecutor();
    executor.initialize();
    CountDownLatch workersStarted = new CountDownLatch(4);
    CountDownLatch releaseWorkers = new CountDownLatch(1);

    try {
      Runnable blockingTask =
          () -> {
            workersStarted.countDown();
            await(releaseWorkers);
          };
      for (int task = 0; task < 4; task++) {
        executor.execute(blockingTask);
      }
      assertThat(workersStarted.await(5, TimeUnit.SECONDS)).isTrue();
      for (int task = 0; task < 16; task++) {
        executor.execute(() -> await(releaseWorkers));
      }
      assertThat(executor.getQueueSize()).isEqualTo(16);

      TestRepository repository =
          new TestRepository(List.of(Collections.nCopies(10, "row")));
      repository.setLegacyDynamicFetchExecutor(executor);

      assertThatThrownBy(() -> repository.loadPageWithTotal(0, 50, 50))
          .isInstanceOf(TaskRejectedException.class);
      assertThat(repository.pageCalls()).isZero();
    } finally {
      releaseWorkers.countDown();
      executor.shutdown();
    }
  }

  private static final class TestRepository extends OracleRepositorySupport {
    private final List<List<String>> pages;
    private final List<Integer> requestedPages = Collections.synchronizedList(new java.util.ArrayList<>());
    private final AtomicInteger pageCalls = new AtomicInteger();

    TestRepository(List<List<String>> pages) {
      super(null);
      this.pages = pages;
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
    protected <T> List<T> queryCursorProcedure(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
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

  private static final class RequiredRepository extends OracleRepositorySupport {

    RequiredRepository(JdbcTemplate jdbcTemplate) {
      super(jdbcTemplate);
    }

    List<String> loadOptional() {
      return queryCursorProcedure("LEXIS_GROUP_5.FIND_TEST(?)", null, 1, rs -> "row");
    }

    List<String> loadRequired() {
      return queryCursorProcedureRequired(
          "LEXIS_GROUP_5.FIND_TEST(?)", null, 1, rs -> "row");
    }

    List<String> loadFailClosed() {
      return queryCursorProcedureFailClosed(
          "LEXIS_GROUP_5.FIND_TEST(?)", null, 1, rs -> "row");
    }

    List<String> loadOptionalColumn() {
      return queryCursorProcedure(
          "LEXIS_GROUP_5.FIND_TEST(?)", null, 1, rs -> getString(rs, "REQUIRED_VALUE"));
    }

    List<String> loadRequiredColumn() {
      return queryCursorProcedureRequired(
          "LEXIS_GROUP_5.FIND_TEST(?)", null, 1, rs -> getString(rs, "REQUIRED_VALUE"));
    }

    List<String> loadFailClosedColumn() {
      return queryCursorProcedureFailClosed(
          "LEXIS_GROUP_5.FIND_TEST(?)", null, 1, rs -> getString(rs, "REQUIRED_VALUE"));
    }

    void mutateRequired() {
      executeProcedureRequired("LEXIS_GROUP_9.UPDATE_TEST(?)", null);
    }
  }

  private static final class DynamicRepository extends OracleRepositorySupport {

    DynamicRepository(JdbcTemplate jdbcTemplate) {
      super(jdbcTemplate);
    }

    List<String> loadDynamicPage() {
      return queryLegacyDynamicPagedProcedure(
          "LEXIS_GROUP_5.FIND_TEST(?,?,?,?,?)",
          " WHERE 1=1",
          List.of(),
          0,
          rs -> "row");
    }

    int loadDynamicCount() {
      return queryLegacyDynamicCountProcedure(
          "LEXIS_GROUP_5.COUNT_TEST(?,?,?,?)", " WHERE 1=1", List.of());
    }
  }

  private static final class ParallelFailureRepository extends OracleRepositorySupport {
    private final DataAccessResourceFailureException failure;

    ParallelFailureRepository(DataAccessResourceFailureException failure) {
      super(null);
      this.failure = failure;
    }

    Page<String> loadPage() {
      return queryLegacyDynamicPage(
          "LEXIS_GROUP_5.FIND_TEST(?,?,?,?,?)",
          " WHERE 1=1",
          List.of(),
          0,
          50,
          50,
          rs -> "row");
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryLegacyDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      if (page == 2) {
        throw failure;
      }
      return (List<T>) Collections.nCopies(10, "row-" + page);
    }
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private static JdbcTemplate jdbcTemplateExecuting(CallableStatement statement) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback callback = invocation.getArgument(1);
              return callback.doInCallableStatement(statement);
            });
    return jdbcTemplate;
  }

  private static List<String> concat(List<String> first, List<String> second) {
    return java.util.stream.Stream.concat(first.stream(), second.stream()).toList();
  }

  private static void await(CountDownLatch latch) {
    try {
      latch.await();
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
    }
  }
}

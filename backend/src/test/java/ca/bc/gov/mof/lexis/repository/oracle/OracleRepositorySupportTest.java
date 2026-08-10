package ca.bc.gov.mof.lexis.repository.oracle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Slice;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | OracleRepositorySupport")
class OracleRepositorySupportTest {

  @Test
  @SuppressWarnings("unchecked")
  void queryDirectPageShouldUseOneBoundOffsetFetchQuery() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of("row-11", "row-12"));
    DirectRepository repository = new DirectRepository(jdbcTemplate);

    Page<String> results = repository.loadPage(1, 10, 12);

    assertThat(results.getContent()).containsExactly("row-11", "row-12");
    assertThat(results.getTotalElements()).isEqualTo(12);
    assertThat(results.getNumber()).isEqualTo(1);
    assertThat(results.getSize()).isEqualTo(10);
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), binds.capture());
    assertThat(sql.getValue())
        .contains("SELECT VALUE FROM TEST_VALUES")
        .contains("WHERE 1=1 AND CODE = ? ORDER BY VALUE ASC")
        .endsWith("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    assertThat(binds.getValue()).containsExactly("ACTIVE", 10L, 10);
  }

  @Test
  @SuppressWarnings("unchecked")
  void queryDirectPageShouldSkipTheDatabaseWhenOffsetExceedsKnownTotal() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DirectRepository repository = new DirectRepository(jdbcTemplate);

    Page<String> results = repository.loadPage(2, 10, 12);

    assertThat(results.getContent()).isEmpty();
    assertThat(results.getTotalElements()).isEqualTo(12);
    verify(jdbcTemplate, never())
        .query(anyString(), any(RowMapper.class), any(Object[].class));
  }

  @Test
  @SuppressWarnings("unchecked")
  void queryDirectPageWithTailShouldPageBeforeTheFinalProjection() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of("row-11", "row-12"));
    DirectRepository repository = new DirectRepository(jdbcTemplate);

    Page<String> results = repository.loadPageWithTail(1, 10, 12);

    assertThat(results.getContent()).containsExactly("row-11", "row-12");
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), binds.capture());
    assertThat(sql.getValue())
        .startsWith("WITH PAGE_VALUES AS (SELECT VALUE FROM TEST_VALUES")
        .contains("WHERE 1=1 AND CODE = ? ORDER BY VALUE ASC")
        .contains("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY)")
        .endsWith("SELECT VALUE FROM PAGE_VALUES ORDER BY VALUE ASC");
    assertThat(binds.getValue()).containsExactly("ACTIVE", 10L, 10);
  }

  @Test
  @SuppressWarnings("unchecked")
  void queryDirectSliceShouldFetchOneLookAheadRowWithOneQuery() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of("row-11", "row-12", "row-13", "row-14", "row-15", "row-16"));
    DirectRepository repository = new DirectRepository(jdbcTemplate);

    Slice<String> results = repository.loadSlice(2, 5);

    assertThat(results.getContent())
        .containsExactly("row-11", "row-12", "row-13", "row-14", "row-15");
    assertThat(results.hasNext()).isTrue();
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), binds.capture());
    assertThat(sql.getValue()).endsWith("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    assertThat(binds.getValue()).containsExactly("ACTIVE", 10L, 6);
  }

  @Test
  void queryDirectCountShouldBindCriteriaAndClampToIntegerRange() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.queryForObject(
            anyString(), eq(Long.class), any(Object[].class)))
        .thenReturn((long) Integer.MAX_VALUE + 10L);
    DirectRepository repository = new DirectRepository(jdbcTemplate);

    int result = repository.loadCount();

    assertThat(result).isEqualTo(Integer.MAX_VALUE);
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).queryForObject(sql.capture(), eq(Long.class), binds.capture());
    assertThat(sql.getValue())
        .isEqualTo("SELECT COUNT(*) FROM TEST_VALUES WHERE 1=1 AND CODE = ?");
    assertThat(binds.getValue()).containsExactly("ACTIVE");
  }

  @Test
  void queryDirectCountShouldRejectMissingDatabaseResult() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.queryForObject(
            anyString(), eq(Long.class), any(Object[].class)))
        .thenReturn(null);
    DirectRepository repository = new DirectRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadCount)
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("returned no result");
  }

  @Test
  void loadCodeNameOptionsShouldFallbackWhenCodePackageReturnsEmpty() {
    TestRepository repository = new TestRepository();

    List<CodeNameDto> options = repository.loadApplicationStatuses();

    assertThat(options)
        .extracting(CodeNameDto::code)
        .contains("NEW", "APP", "PND", "REJ", "WDN", "EXE", "EXP", "PMT");
  }

  @Test
  void loadCodeNameOptionsShouldFallbackForReportOptionCodesWhenCodePackageReturnsEmpty() {
    TestRepository repository = new TestRepository();

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
    TestRepository repository = new TestRepository();

    assertThat(repository.loadGrowthTypeDescription("s")).contains("Second Growth");
    assertThat(repository.loadPackageStatusDescription("ACT")).contains("Active");
    assertThat(repository.loadPackageStatusDescription("SHT")).contains("Shutout");
    assertThat(repository.loadProductTypeDescription("T")).contains("Unmanufactured Timber");
    assertThat(repository.loadProductTypeDescription("unknown")).isEmpty();
  }

  @Test
  void auditUserOrDefaultShouldNeverReturnBlankUser() {
    TestRepository repository = new TestRepository();
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

  private static final class DirectRepository extends OracleRepositorySupport {

    DirectRepository(JdbcTemplate jdbcTemplate) {
      super(jdbcTemplate);
    }

    Page<String> loadPage(int page, int size, int totalElements) {
      return queryDirectPage(
          "SELECT VALUE FROM TEST_VALUES",
          pageCriteria(),
          page,
          size,
          totalElements,
          rs -> rs.getString("VALUE"));
    }

    Page<String> loadPageWithTail(int page, int size, int totalElements) {
      return queryDirectPageWithTail(
          "WITH PAGE_VALUES AS (SELECT VALUE FROM TEST_VALUES",
          pageCriteria(),
          ") SELECT VALUE FROM PAGE_VALUES ORDER BY VALUE ASC",
          page,
          size,
          totalElements,
          rs -> rs.getString("VALUE"));
    }

    Slice<String> loadSlice(int page, int size) {
      return queryDirectSlice(
          "SELECT VALUE FROM TEST_VALUES",
          pageCriteria(),
          page,
          size,
          rs -> rs.getString("VALUE"));
    }

    int loadCount() {
      DirectSqlBuilder where = newDirectSqlBuilder();
      where.addEquals("CODE", "ACTIVE");
      return queryDirectCount("SELECT COUNT(*) FROM TEST_VALUES", where.build(""));
    }

    private DirectSql pageCriteria() {
      DirectSqlBuilder where = newDirectSqlBuilder();
      where.addEquals("CODE", "ACTIVE");
      return where.build(" ORDER BY VALUE ASC");
    }
  }

  private static final class TestRepository extends OracleRepositorySupport {

    TestRepository() {
      super(null);
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

    @Override
    protected <T> List<T> queryCursorProcedure(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return List.of();
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
}

package ca.bc.gov.mof.lexis.repository.oracle;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | OracleRepositorySupport")
class OracleRepositorySupportTest {

  @Test
  void queryDynamicAllPagesShouldStopAfterShortFinalPage() {
    TestRepository repository = new TestRepository(List.of(List.of("row")));

    List<String> results = repository.loadAllPages();

    assertThat(results).containsExactly("row");
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

    List<String> loadAllPages() {
      return queryDynamicAllPages("LEXIS_GROUP_5.FIND_TEST(?,?,?,?,?)", " WHERE 1=1", List.of(), rs -> "");
    }

    List<CodeNameDto> loadApplicationStatuses() {
      return loadCodeNameOptions(LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)");
    }

    List<CodeNameDto> loadRegions() {
      return loadOrgUnitOptions(false);
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
}

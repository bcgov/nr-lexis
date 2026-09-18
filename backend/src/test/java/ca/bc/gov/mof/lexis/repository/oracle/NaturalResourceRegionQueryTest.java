package ca.bc.gov.mof.lexis.repository.oracle;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ORG_UNIT_BY_NUMBER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class NaturalResourceRegionQueryTest {

  @ParameterizedTest
  @CsvSource({"true,ORG_UNIT_NAME,RCB", "false,ORG_UNIT_CODE,Cariboo"})
  @SuppressWarnings("unchecked")
  void regionDisplayShouldRetainOptionalColumnCompatibility(
      boolean displayName, String missingColumn, String expectedName) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet row = mock(ResultSet.class);
    when(row.getLong("ORG_UNIT_NO")).thenReturn(1903L);
    when(row.getString("ORG_UNIT_CODE"))
        .thenAnswer(
            invocation -> {
              if (missingColumn.equals("ORG_UNIT_CODE")) {
                throw new SQLException("Column unavailable");
              }
              return " RCB ";
            });
    when(row.getString("ORG_UNIT_NAME"))
        .thenAnswer(
            invocation -> {
              if (missingColumn.equals("ORG_UNIT_NAME")) {
                throw new SQLException("Column unavailable");
              }
              return " Cariboo ";
            });
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              Object[] binds = (Object[]) invocation.getRawArguments()[2];
              if (!"1903".equals(binds[0])) {
                return List.of();
              }
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(row, 0));
            });

    assertThat(new RegionRepository(jdbcTemplate).regions(displayName))
        .containsExactly(new CodeNameDto("1903", expectedName));
  }

  @Test
  @SuppressWarnings("unchecked")
  void regionLookupShouldSelectFirstMatchingNumberAndOmitUnresolvedNumbers() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), any(Object[].class)))
        .thenReturn(
            List.of(
                new CodeNameDto("9999", "Different region"),
                new CodeNameDto("1903", "First match"),
                new CodeNameDto("1903", "Second match")))
        .thenReturn(List.of());

    assertThat(new RegionRepository(jdbcTemplate).regions(true))
        .containsExactly(new CodeNameDto("1903", "First match"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void regionLookupShouldPropagateDatabaseFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Org units unavailable");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), any(Object[].class)))
        .thenThrow(failure);

    assertThatThrownBy(() -> new RegionRepository(jdbcTemplate).regions(true)).isSameAs(failure);
  }

  private static final class RegionRepository extends OracleRepositorySupport {
    private RegionRepository(JdbcTemplate jdbcTemplate) {
      super(jdbcTemplate);
    }

    private List<CodeNameDto> regions(boolean displayName) {
      return loadOrgUnitOptionsRequired(displayName);
    }
  }
}

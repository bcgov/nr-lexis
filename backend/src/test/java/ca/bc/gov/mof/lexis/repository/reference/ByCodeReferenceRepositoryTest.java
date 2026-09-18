package ca.bc.gov.mof.lexis.repository.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class ByCodeReferenceRepositoryTest {

  @ParameterizedTest(name = "{0}, permit={1}")
  @MethodSource("descriptionCallers")
  void descriptionsShouldBindTrimmedStringsAndPreferTheFirstOracleLabel(
      CodeType type, boolean permit) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    stubRows(jdbcTemplate, type.sql, type.code, 2, " Oracle label ", "Later label");

    assertThat(type.describe(jdbcTemplate, permit, " " + type.code + " "))
        .contains("Oracle label");

    verify(jdbcTemplate).query(eq(type.sql), any(RowMapper.class), eq(type.code));
    verifyNoMoreInteractions(jdbcTemplate);
  }

  @ParameterizedTest(name = "{0}, permit={1}")
  @MethodSource("descriptionCallers")
  void descriptionsShouldRejectNullOrBlankCodesWithoutQuerying(CodeType type, boolean permit) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);

    assertThat(type.describe(jdbcTemplate, permit, null)).isEmpty();
    assertThat(type.describe(jdbcTemplate, permit, "")).isEmpty();
    assertThat(type.describe(jdbcTemplate, permit, " \t ")).isEmpty();

    verifyNoInteractions(jdbcTemplate);
  }

  @ParameterizedTest(name = "{0}, permit={1}, code={2}")
  @MethodSource("fallbackCases")
  @SuppressWarnings("unchecked")
  void descriptionsShouldRetainEveryStaticFallbackWhenTheFirstRowIsUnusableOrOracleFails(
      CodeType type, boolean permit, String code, String fallback) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    String lowerCode = code.toLowerCase(Locale.ROOT);
    Optional<String> expected = Optional.ofNullable(fallback);

    for (String[] descriptions :
        new String[][] {
          {}, {null}, {" \t "}, {"\u2003"}, {null, "Later label"}, {" ", "Later label"}
        }) {
      stubRows(jdbcTemplate, type.sql, lowerCode, 2, descriptions);
      assertThat(type.describe(jdbcTemplate, permit, " " + lowerCode + " "))
          .as("first-row fallback for %s", Arrays.toString(descriptions))
          .isEqualTo(expected);
    }

    when(jdbcTemplate.query(eq(type.sql), any(RowMapper.class), eq(lowerCode)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    assertThat(type.describe(jdbcTemplate, permit, lowerCode)).isEqualTo(expected);

    for (boolean failureOnLaterRow : List.of(false, true)) {
      ResultSet unreadable = mock(ResultSet.class);
      SQLException failure = new SQLException("Missing description column");
      if (failureOnLaterRow) {
        when(unreadable.getString(2)).thenReturn("First Oracle label").thenThrow(failure);
      } else {
        when(unreadable.getString(2)).thenThrow(failure);
      }
      doAnswer(
              invocation -> {
                RowMapper<String> mapper = invocation.getArgument(1);
                try {
                  return Arrays.asList(mapper.mapRow(unreadable, 0), mapper.mapRow(unreadable, 1));
                } catch (SQLException ex) {
                  // JdbcTemplate translates mapper SQLExceptions before the repository sees them.
                  throw new UncategorizedSQLException("code description", type.sql, ex);
                }
              })
          .when(jdbcTemplate)
          .query(eq(type.sql), any(RowMapper.class), eq(lowerCode));
      assertThat(type.describe(jdbcTemplate, permit, lowerCode))
          .as("column failure on %s row", failureOnLaterRow ? "later" : "first")
          .isEqualTo(expected);
    }
  }

  @SuppressWarnings("unchecked")
  private static void stubRows(
      JdbcTemplate jdbcTemplate, String sql, String code, int column, String... values)
      throws SQLException {
    ResultSet resultSet = mock(ResultSet.class);
    if (values.length > 0) {
      when(resultSet.getString(column))
          .thenReturn(values[0], Arrays.copyOfRange(values, 1, values.length));
    }
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), eq(code)))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              List<String> mapped = new ArrayList<>();
              for (int index = 0; index < values.length; index++) {
                mapped.add(mapper.mapRow(resultSet, index));
              }
              return mapped;
            });
  }

  private static Stream<Arguments> descriptionCallers() {
    return Arrays.stream(CodeType.values())
        .flatMap(type -> Stream.of(Arguments.of(type, false), Arguments.of(type, true)));
  }

  private static Stream<Arguments> fallbackCases() {
    return Stream.of(false, true)
        .flatMap(
            permit ->
                Stream.of(
                    Arguments.of(CodeType.GROWTH, permit, "O", "Old Growth"),
                    Arguments.of(CodeType.GROWTH, permit, "S", "Second Growth"),
                    Arguments.of(CodeType.GROWTH, permit, "unknown", null),
                    Arguments.of(CodeType.PRODUCT, permit, "H", "Harvested Timber"),
                    Arguments.of(CodeType.PRODUCT, permit, "S", "Standing Timber"),
                    Arguments.of(CodeType.PRODUCT, permit, "T", "Unmanufactured Timber"),
                    Arguments.of(CodeType.PRODUCT, permit, "unknown", null),
                    Arguments.of(CodeType.PACKAGE_STATUS, permit, "ACT", "Active"),
                    Arguments.of(CodeType.PACKAGE_STATUS, permit, "SHT", "Shutout"),
                    Arguments.of(CodeType.PACKAGE_STATUS, permit, "unknown", null)));
  }

  private enum CodeType {
    GROWTH(LexisCodeQueries.GROWTH_TYPE_BY_CODE, "S"),
    PRODUCT(LexisCodeQueries.PRODUCT_TYPE_BY_CODE, "T"),
    PACKAGE_STATUS(LexisCodeQueries.PACKAGE_STATUS_BY_CODE, "ACT");

    private final String sql;
    private final String code;

    CodeType(String sql, String code) {
      this.sql = sql;
      this.code = code;
    }

    Optional<String> describe(JdbcTemplate jdbcTemplate, boolean permit, String value) {
      if (permit) {
        PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);
        return switch (this) {
          case GROWTH -> repository.findGrowthTypeDescription(value);
          case PRODUCT -> repository.findProductTypeDescription(value);
          case PACKAGE_STATUS -> repository.findPackageStatusDescription(value);
        };
      }
      ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);
      return switch (this) {
        case GROWTH -> repository.findGrowthTypeDescription(value);
        case PRODUCT -> repository.findProductTypeDescription(value);
        case PACKAGE_STATUS -> repository.findPackageStatusDescription(value);
      };
    }
  }
}

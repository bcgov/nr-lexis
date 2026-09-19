package ca.bc.gov.mof.lexis.repository.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.CodeRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class ScaleCodeReferenceRepositoryTest {

  @ParameterizedTest(name = "{0}, required={1}")
  @MethodSource("applicationCallers")
  void applicationLookupsShouldBindTrimmedStringsAndPreserveFirstRowMetadata(
      CodeType type, boolean required) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet first = codeRow(" First ", " First description ", 2L, 7L);
    ResultSet later = codeRow("Later", "Later description", 1L, 1L);
    stubQuery(jdbcTemplate, type.sql, first, later);

    assertThat(type.applicationLookup(jdbcTemplate, required, " cOde "))
        .contains(new CodeRow("First", "First description", 2L, 7L));

    verify(jdbcTemplate).query(eq(type.sql), any(RowMapper.class), eq("cOde"));
    verifyNoMoreInteractions(jdbcTemplate);
    verify(later).getString("CODE");
    verify(later).getString("DESCRIPTION");
  }

  @ParameterizedTest(name = "{0}, required={1}")
  @MethodSource("applicationCallers")
  void applicationLookupsShouldKeepNullableFirstRowAndZeroNullMetadata(
      CodeType type, boolean required) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    stubQuery(
        jdbcTemplate,
        type.sql,
        codeRow(null, " \t ", null, null),
        codeRow("cOde", "Later valid description", 3L, 4L));

    assertThat(type.applicationLookup(jdbcTemplate, required, "cOde"))
        .contains(new CodeRow(null, null, 0L, 0L));
  }

  @ParameterizedTest(name = "{0}, required={1}")
  @MethodSource("applicationCallers")
  void applicationLookupsShouldRejectNullAndBlankInputsWithoutQuerying(
      CodeType type, boolean required) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);

    for (String code : Arrays.asList(null, "", " \t ")) {
      assertThat(type.applicationLookup(jdbcTemplate, required, code)).isEmpty();
    }
    verifyNoInteractions(jdbcTemplate);
  }

  @ParameterizedTest(name = "{0}, required={1}")
  @MethodSource("applicationCallers")
  @SuppressWarnings("unchecked")
  void applicationLookupsShouldPreserveEmptyRowsAndCallerSpecificQueryFailureBehavior(
      CodeType type, boolean required) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(type.sql), any(RowMapper.class), eq("cOde")))
        .thenReturn(List.of())
        .thenThrow(failure);

    assertThat(type.applicationLookup(jdbcTemplate, required, "cOde")).isEmpty();
    if (required) {
      assertThatThrownBy(() -> type.applicationLookup(jdbcTemplate, true, "cOde"))
          .isSameAs(failure);
    } else {
      assertThat(type.applicationLookup(jdbcTemplate, false, "cOde")).isEmpty();
    }
  }

  @ParameterizedTest(name = "{0}, required={1}, column={2}")
  @MethodSource("applicationColumnCases")
  void applicationColumnFailuresShouldRetainSoftRowsAndFailRequiredLookups(
      CodeType type, boolean required, String column) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet row = codeRow("cOde", "Description", 2L, 7L);
    SQLException failure = new SQLException("Missing " + column);
    if (column.equals("CODE") || column.equals("DESCRIPTION")) {
      when(row.getString(column)).thenThrow(failure);
    } else {
      when(row.getLong(column)).thenThrow(failure);
    }
    stubQuery(jdbcTemplate, type.sql, row);

    if (required) {
      assertThatThrownBy(() -> type.applicationLookup(jdbcTemplate, true, "cOde"))
          .isInstanceOf(DataRetrievalFailureException.class)
          .hasMessageContaining(column)
          .hasCause(failure);
    } else {
      assertThat(type.applicationLookup(jdbcTemplate, false, "cOde"))
          .contains(
              new CodeRow(
                  column.equals("CODE") ? null : "cOde",
                  column.equals("DESCRIPTION") ? null : "Description",
                  column.equals("GROUP_BY") ? 0L : 2L,
                  column.equals("ORDER_BY") ? 0L : 7L));
    }
  }

  @ParameterizedTest(name = "{0}, required={1}")
  @MethodSource("applicationCallers")
  void applicationLookupsShouldMapLaterRowsBeforeChoosingTheFirst(
      CodeType type, boolean required) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet first = codeRow("First", "First description", 2L, 7L);
    ResultSet later = codeRow("Later", "Later description", 3L, 4L);
    SQLException failure = new SQLException("Missing later description");
    when(later.getString("DESCRIPTION")).thenThrow(failure);
    stubQuery(jdbcTemplate, type.sql, first, later);

    if (required) {
      assertThatThrownBy(() -> type.applicationLookup(jdbcTemplate, true, "cOde"))
          .isInstanceOf(DataRetrievalFailureException.class)
          .hasCause(failure);
    } else {
      assertThat(type.applicationLookup(jdbcTemplate, false, "cOde"))
          .contains(new CodeRow("First", "First description", 2L, 7L));
    }
    verify(later).getString("DESCRIPTION");
  }

  @ParameterizedTest
  @EnumSource(value = CodeType.class, names = {"SPECIES", "GRADE"})
  void permitLookupsShouldRejectBlankInputsWithoutQuerying(CodeType type) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);

    for (String code : Arrays.asList(null, "", " \t ")) {
      assertThat(type.permitDescription(jdbcTemplate, code)).isEmpty();
      assertThat(type.permitValidation(jdbcTemplate, code)).isFalse();
    }
    verifyNoInteractions(jdbcTemplate);
  }

  @ParameterizedTest
  @EnumSource(value = CodeType.class, names = {"SPECIES", "GRADE"})
  void permitDescriptionsShouldBindTrimmedStringsAndChooseOnlyTheFirstDescription(CodeType type)
      throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    stubQuery(jdbcTemplate, type.sql, descriptionRow(" First label "), descriptionRow("Later"));

    assertThat(type.permitDescription(jdbcTemplate, " cOde ")).contains("First label");
    verify(jdbcTemplate).query(eq(type.sql), any(RowMapper.class), eq("cOde"));
    verifyNoMoreInteractions(jdbcTemplate);

    for (String first : Arrays.asList(null, " \t ", "\u2003")) {
      stubQuery(jdbcTemplate, type.sql, descriptionRow(first), descriptionRow("Later valid label"));
      assertThat(type.permitDescription(jdbcTemplate, "cOde")).isEmpty();
    }
  }

  @ParameterizedTest
  @EnumSource(value = CodeType.class, names = {"SPECIES", "GRADE"})
  @SuppressWarnings("unchecked")
  void permitDescriptionsShouldReturnEmptyOnAbsenceAndQueryOrColumnFailures(CodeType type)
      throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(eq(type.sql), any(RowMapper.class), eq("cOde")))
        .thenReturn(List.of())
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    assertThat(type.permitDescription(jdbcTemplate, "cOde")).isEmpty();
    assertThat(type.permitDescription(jdbcTemplate, "cOde")).isEmpty();

    ResultSet unreadable = mock(ResultSet.class);
    when(unreadable.getString(2)).thenThrow(new SQLException("Description unavailable"));
    stubQuery(jdbcTemplate, type.sql, unreadable);
    assertThat(type.permitDescription(jdbcTemplate, "cOde")).isEmpty();
    stubQuery(jdbcTemplate, type.sql, descriptionRow("First label"), unreadable);
    assertThat(type.permitDescription(jdbcTemplate, "cOde")).isEmpty();
  }

  @ParameterizedTest
  @EnumSource(value = CodeType.class, names = {"SPECIES", "GRADE"})
  @SuppressWarnings("unchecked")
  void permitDescriptionsShouldNotBorrowStaticFallbacksFromOtherCodeFamilies(CodeType type) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(eq(type.sql), any(RowMapper.class), eq("S")))
        .thenReturn(List.of());

    assertThat(type.permitDescription(jdbcTemplate, "S")).isEmpty();
  }

  @ParameterizedTest
  @EnumSource(value = CodeType.class, names = {"SPECIES", "GRADE"})
  void permitValidationShouldAcceptAnyRowWithoutReadingItsColumns(CodeType type) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet nullCode = mock(ResultSet.class);
    ResultSet mismatchedCode = mock(ResultSet.class);
    when(mismatchedCode.getString("CODE")).thenReturn("OTHER");
    when(mismatchedCode.getString(1)).thenReturn("OTHER");
    stubQuery(jdbcTemplate, type.sql, nullCode);

    assertThat(type.permitValidation(jdbcTemplate, " cOde ")).isTrue();
    verify(jdbcTemplate).query(eq(type.sql), any(RowMapper.class), eq("cOde"));
    verifyNoMoreInteractions(jdbcTemplate);

    stubQuery(jdbcTemplate, type.sql, mismatchedCode);
    assertThat(type.permitValidation(jdbcTemplate, "cOde")).isTrue();
    verifyNoInteractions(nullCode, mismatchedCode);
    stubQuery(jdbcTemplate, type.sql);
    assertThat(type.permitValidation(jdbcTemplate, "cOde")).isFalse();
  }

  @ParameterizedTest
  @EnumSource(value = CodeType.class, names = {"SPECIES", "GRADE"})
  @SuppressWarnings("unchecked")
  void permitValidationShouldPropagateQueryFailure(CodeType type) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(type.sql), any(RowMapper.class), eq("cOde")))
        .thenThrow(failure);

    assertThatThrownBy(() -> type.permitValidation(jdbcTemplate, "cOde")).isSameAs(failure);
  }

  private static ResultSet codeRow(String code, String description, Long group, Long order)
      throws SQLException {
    ResultSet row = mock(ResultSet.class);
    when(row.getString("CODE")).thenReturn(code);
    when(row.getString("DESCRIPTION")).thenReturn(description);
    when(row.getLong("GROUP_BY")).thenReturn(group == null ? 0L : group);
    when(row.getLong("ORDER_BY")).thenReturn(order == null ? 0L : order);
    when(row.wasNull()).thenReturn(group == null, order == null);
    return row;
  }

  private static ResultSet descriptionRow(String description) throws SQLException {
    ResultSet row = mock(ResultSet.class);
    when(row.getString(2)).thenReturn(description);
    return row;
  }

  @SuppressWarnings("unchecked")
  private static void stubQuery(JdbcTemplate jdbcTemplate, String sql, ResultSet... rows) {
    doAnswer(
            invocation -> {
              RowMapper<Object> mapper = invocation.getArgument(1);
              List<Object> mapped = new ArrayList<>();
              try {
                for (int index = 0; index < rows.length; index++) {
                  mapped.add(mapper.mapRow(rows[index], index));
                }
              } catch (SQLException ex) {
                // Match JdbcTemplate's translation of exceptions thrown by positional mappers.
                throw new UncategorizedSQLException("scale code lookup", sql, ex);
              }
              return mapped;
            })
        .when(jdbcTemplate)
        .query(eq(sql), any(RowMapper.class), eq("cOde"));
  }

  private static Stream<Arguments> applicationCallers() {
    return Arrays.stream(CodeType.values())
        .flatMap(type -> Stream.of(Arguments.of(type, false), Arguments.of(type, true)));
  }

  private static Stream<Arguments> applicationColumnCases() {
    return Arrays.stream(CodeType.values())
        .flatMap(
            type ->
                Stream.of(false, true)
                    .flatMap(
                        required ->
                            Stream.of("CODE", "DESCRIPTION", "GROUP_BY", "ORDER_BY")
                                .map(column -> Arguments.of(type, required, column))));
  }

  private enum CodeType {
    SPECIES(LexisCodeQueries.SPECIES_BY_CODE),
    GRADE(LexisCodeQueries.GRADE_BY_CODE),
    END_USE(LexisCodeQueries.END_USE_BY_CODE);

    private final String sql;

    CodeType(String sql) {
      this.sql = sql;
    }

    Optional<CodeRow> applicationLookup(JdbcTemplate jdbc, boolean required, String code) {
      ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbc);
      return switch (this) {
        case SPECIES ->
            required ? repository.findSpeciesCodeRequired(code) : repository.findSpeciesCode(code);
        case GRADE ->
            required ? repository.findGradeCodeRequired(code) : repository.findGradeCode(code);
        case END_USE ->
            required ? repository.findEndUseCodeRequired(code) : repository.findEndUseCode(code);
      };
    }

    Optional<String> permitDescription(JdbcTemplate jdbc, String code) {
      PermitRpcRepository repository = new PermitRpcRepository(jdbc);
      return switch (this) {
        case SPECIES -> repository.findSpeciesDescription(code);
        case GRADE -> repository.findGradeDescription(code);
        case END_USE -> throw new IllegalArgumentException("No permit end-use description lookup");
      };
    }

    boolean permitValidation(JdbcTemplate jdbc, String code) {
      PermitRpcRepository repository = new PermitRpcRepository(jdbc);
      return switch (this) {
        case SPECIES -> repository.isSpeciesCodeValidRequired(code);
        case GRADE -> repository.isGradeCodeValidRequired(code);
        case END_USE -> throw new IllegalArgumentException("No permit end-use code validation");
      };
    }
  }
}

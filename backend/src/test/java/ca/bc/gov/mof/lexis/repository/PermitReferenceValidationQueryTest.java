package ca.bc.gov.mof.lexis.repository;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.COUNTRY_BY_CODE;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.PERMIT_STATUS_BY_CODE;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.SCALE_METHOD_BY_CODE;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.TRANSPORT_TYPE_BY_CODE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.federal.FederalPermitDetailRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.BiPredicate;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class PermitReferenceValidationQueryTest {

  @ParameterizedTest(name = "{0}")
  @MethodSource("validators")
  void shouldRejectBlankCodesWithoutQuerying(Validator validator) {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);

    assertThat(validator.lookup().test(jdbc, null)).isFalse();
    assertThat(validator.lookup().test(jdbc, "")).isFalse();
    assertThat(validator.lookup().test(jdbc, " \t ")).isFalse();
    verifyNoInteractions(jdbc);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("validators")
  @SuppressWarnings("unchecked")
  void shouldDistinguishNoRowsFromQueryFailure(Validator validator) {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Reference validation unavailable");
    when(jdbc.query(eq(validator.sql()), any(RowMapper.class), eq(validator.code())))
        .thenReturn(List.of())
        .thenThrow(failure);

    assertThat(validator.lookup().test(jdbc, validator.code())).isFalse();
    assertThatThrownBy(() -> validator.lookup().test(jdbc, validator.code())).isSameAs(failure);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("permitValidators")
  @SuppressWarnings("unchecked")
  void permitValidationShouldBindTrimmedCaseUnchangedAndAcceptAnyReturnedRows(Validator validator)
      throws Exception {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    ResultSet rs = mock(ResultSet.class);
    when(jdbc.query(eq(validator.sql()), any(RowMapper.class), eq(validator.code())))
        .thenAnswer(
            invocation -> {
              RowMapper<Boolean> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(rs, 0), mapper.mapRow(rs, 1));
            });

    assertThat(validator.lookup().test(jdbc, " " + validator.code() + " ")).isTrue();
    verify(jdbc).query(eq(validator.sql()), any(RowMapper.class), eq(validator.code()));
    verifyNoInteractions(rs);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("federalValidators")
  @SuppressWarnings("unchecked")
  void federalValidationShouldFindAnyTrimmedMatchingCodeIncludingAfterNullRows(Validator validator)
      throws Exception {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    ResultSet rs = mock(ResultSet.class);
    when(rs.getString("CODE"))
        .thenReturn(
            null, "different", " " + validator.code().toUpperCase(Locale.ROOT) + " ",
            null, "different");
    when(jdbc.query(eq(validator.sql()), any(RowMapper.class), eq(validator.code())))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(
                  mapper.mapRow(rs, 0), mapper.mapRow(rs, 1), mapper.mapRow(rs, 2));
            })
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(rs, 0), mapper.mapRow(rs, 1));
            });

    assertThat(validator.lookup().test(jdbc, " " + validator.code() + " ")).isTrue();
    assertThat(validator.lookup().test(jdbc, validator.code())).isFalse();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("federalValidators")
  @SuppressWarnings("unchecked")
  void federalValidationShouldPropagateRequiredCodeColumnFailure(Validator validator)
      throws Exception {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    ResultSet rs = mock(ResultSet.class);
    SQLException failure = new SQLException("Missing CODE");
    when(rs.getString("CODE")).thenThrow(failure);
    when(jdbc.query(eq(validator.sql()), any(RowMapper.class), eq(validator.code())))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(rs, 0));
            });

    assertThatThrownBy(() -> validator.lookup().test(jdbc, validator.code())).isSameAs(failure);
  }

  private static Stream<Validator> validators() {
    return Stream.concat(permitValidators(), federalValidators());
  }

  private static Stream<Validator> permitValidators() {
    return Stream.of(
        new Validator(
            "permit country", COUNTRY_BY_CODE, "uS",
            (jdbc, code) -> new PermitRpcRepository(jdbc).isCountryCodeValidRequired(code)),
        new Validator(
            "permit transport", TRANSPORT_TYPE_BY_CODE, "s",
            (jdbc, code) -> new PermitRpcRepository(jdbc).isTransportTypeCodeValidRequired(code)),
        new Validator(
            "permit status", PERMIT_STATUS_BY_CODE, "aCt",
            (jdbc, code) -> new PermitRpcRepository(jdbc).isPermitStatusCodeValidRequired(code)),
        new Validator(
            "permit scale method", SCALE_METHOD_BY_CODE, "w",
            (jdbc, code) -> new PermitRpcRepository(jdbc).isScaleMethodCodeValidRequired(code)));
  }

  private static Stream<Validator> federalValidators() {
    return Stream.of(
        new Validator(
            "federal country", COUNTRY_BY_CODE, "uS",
            (jdbc, code) -> new FederalPermitDetailRepository(jdbc).countryCodeExistsRequired(code)),
        new Validator(
            "federal transport", TRANSPORT_TYPE_BY_CODE, "s",
            (jdbc, code) ->
                new FederalPermitDetailRepository(jdbc).transportTypeCodeExistsRequired(code)));
  }

  private record Validator(
      String name, String sql, String code, BiPredicate<JdbcTemplate, String> lookup) {
    @Override
    public String toString() {
      return name;
    }
  }
}

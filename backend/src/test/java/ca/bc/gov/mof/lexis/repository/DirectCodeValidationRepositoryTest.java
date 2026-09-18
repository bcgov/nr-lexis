package ca.bc.gov.mof.lexis.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class DirectCodeValidationRepositoryTest {

  @ParameterizedTest(name = "{0}")
  @MethodSource("validators")
  void blankInputsShouldAvoidOracle(ValidationCase validation) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    Predicate<String> validator = validation.factory().apply(jdbcTemplate);

    assertThat(validator.test(null)).isFalse();
    assertThat(validator.test("")).isFalse();
    assertThat(validator.test(" \t ")).isFalse();
    verifyNoInteractions(jdbcTemplate);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("validators")
  @SuppressWarnings("unchecked")
  void lookupShouldBindTrimmedCaseUnchangedAndCompareOnlyFirstNullableCode(
      ValidationCase validation) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    if (validation.namedColumn()) {
      when(resultSet.getString("CODE"))
          .thenReturn(" CoDe ", "different", "other", "CODE", null, "CODE", " ", "CODE");
    } else {
      when(resultSet.getString(1))
          .thenReturn(" CoDe ", "different", "other", "CODE", null, "CODE", " ", "CODE");
    }
    when(jdbcTemplate.query(eq(validation.sql()), any(RowMapper.class), eq("cOde")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    Predicate<String> validator = validation.factory().apply(jdbcTemplate);

    assertThat(validator.test(" cOde ")).isTrue();
    assertThat(validator.test(" cOde ")).isFalse();
    assertThat(validator.test(" cOde ")).isFalse();
    assertThat(validator.test(" cOde ")).isFalse();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("validators")
  @SuppressWarnings("unchecked")
  void lookupShouldDistinguishAbsenceFromOracleFailure(ValidationCase validation) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(validation.sql()), any(RowMapper.class), eq("CODE")))
        .thenReturn(List.of())
        .thenThrow(failure);
    Predicate<String> validator = validation.factory().apply(jdbcTemplate);

    assertThat(validator.test("CODE")).isFalse();
    assertThatThrownBy(() -> validator.test("CODE")).isSameAs(failure);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("validators")
  @SuppressWarnings("unchecked")
  void lookupShouldPropagateCodeColumnFailure(ValidationCase validation) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    SQLException failure = new SQLException("Code column unavailable");
    if (validation.namedColumn()) {
      when(resultSet.getString("CODE")).thenThrow(failure);
    } else {
      when(resultSet.getString(1)).thenThrow(failure);
    }
    when(jdbcTemplate.query(eq(validation.sql()), any(RowMapper.class), eq("CODE")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return java.util.Collections.singletonList(mapper.mapRow(resultSet, 0));
            });
    Predicate<String> validator = validation.factory().apply(jdbcTemplate);

    if (validation.namedColumn()) {
      assertThatThrownBy(() -> validator.test("CODE"))
          .isInstanceOf(DataRetrievalFailureException.class)
          .hasMessageContaining("CODE")
          .hasCause(failure);
    } else {
      assertThatThrownBy(() -> validator.test("CODE")).isSameAs(failure);
    }
  }

  private static Stream<ValidationCase> validators() {
    return Stream.of(
        new ValidationCase(
            "growth type", LexisCodeQueries.GROWTH_TYPE_BY_CODE, false,
            jdbc -> new ApplicationDetailsRpcRepository(jdbc)::isGrowthTypeCodeValidRequired),
        new ValidationCase(
            "product type", LexisCodeQueries.PRODUCT_TYPE_BY_CODE, false,
            jdbc -> new ApplicationDetailsRpcRepository(jdbc)::isProductTypeCodeValidRequired),
        new ValidationCase(
            "package status", LexisCodeQueries.PACKAGE_STATUS_BY_CODE, false,
            jdbc -> new ApplicationDetailsRpcRepository(jdbc)::isPackageStatusCodeValidRequired),
        new ValidationCase(
            "application status", LexisCodeQueries.APPLICATION_STATUS_BY_CODE, false,
            jdbc -> new ApplicationDetailsRpcRepository(jdbc)::isApplicationStatusCodeValidRequired),
        new ValidationCase(
            "exemption reason", LexisCodeQueries.EXEMPTION_REASON_BY_CODE, false,
            jdbc -> new ApplicationDetailsRpcRepository(jdbc)::isExemptionReasonCodeValidRequired),
        new ValidationCase(
            "applicant type", LexisCodeQueries.APPLICANT_TYPE_BY_CODE, false,
            jdbc -> new ApplicationDetailsRpcRepository(jdbc)::isApplicantTypeCodeValidRequired),
        new ValidationCase(
            "jurisdiction", LexisCodeQueries.JURISDICTION_BY_CODE, false,
            jdbc -> new ApplicationDetailsRpcRepository(jdbc)::isJurisdictionCodeValidRequired),
        new ValidationCase(
            "exemption type", LexisCodeQueries.EXEMPTION_TYPE_BY_CODE, false,
            jdbc -> new ExemptionDetailsRpcRepository(jdbc)::isExemptionTypeCodeValidRequired),
        new ValidationCase(
            "exemption status", LexisCodeQueries.EXEMPTION_STATUS_BY_CODE, false,
            jdbc -> new ExemptionDetailsRpcRepository(jdbc)::isExemptionStatusCodeValidRequired),
        new ValidationCase(
            "file type", LexisCodeQueries.FILE_TYPE_BY_CODE, true,
            jdbc -> new UploadRepository(jdbc)::isFileTypeCodeValidRequired));
  }

  private record ValidationCase(
      String name,
      String sql,
      boolean namedColumn,
      Function<JdbcTemplate, Predicate<String>> factory) {
    @Override
    public String toString() {
      return name;
    }
  }
}

package ca.bc.gov.mof.lexis.repository.reference;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.SPECIES_GRADE_END_USES_BY_REGION;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.SPECIES_GRADE_END_USES_BY_REGION_SPECIES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class RegionSpeciesEndUseRepositoryTest {

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  @SuppressWarnings("unchecked")
  void lookupsShouldBindTrimmedStringsWithoutChangingCaseOrLeadingZeroes(boolean bySpecies) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(eq(sql(bySpecies)), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of());
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(lookup(repository, bySpecies, " 0011 ", " hE ")).isEmpty();

    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).query(eq(sql(bySpecies)), any(RowMapper.class), binds.capture());
    if (bySpecies) {
      assertThat(binds.getValue()).containsExactly("0011", "hE");
    } else {
      assertThat(binds.getValue()).containsExactly("0011");
    }
    verifyNoMoreInteractions(jdbcTemplate);
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void lookupsShouldRejectEachNullOrBlankInputWithoutQuerying(boolean bySpecies) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    for (String blank : Arrays.asList(null, "", " \t ")) {
      assertThat(lookup(repository, bySpecies, blank, "HE")).isEmpty();
      if (bySpecies) {
        assertThat(lookup(repository, true, "0011", blank)).isEmpty();
      }
    }
    verifyNoInteractions(jdbcTemplate);
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void lookupsShouldPreserveOrderDuplicatesAndCallerSpecificGradeFiltering(boolean bySpecies)
      throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet first = row(" hE ", " B ", " Lu ", " hE/B/Lu ", 11L);
    ResultSet blankGrade = row("HE", " \t ", "LU", "HE//LU", 11L);
    ResultSet nullGrade = row(null, null, null, null, null);
    ResultSet nullableWithGrade = row(null, " A ", null, " ", null);
    stubRows(jdbcTemplate, bySpecies, first, blankGrade, nullGrade, nullableWithGrade, first);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);
    SpeciesGradeEndUseRow firstExpected =
        new SpeciesGradeEndUseRow("hE", "B", "Lu", "hE/B/Lu", 11L);
    SpeciesGradeEndUseRow nullableExpected =
        new SpeciesGradeEndUseRow(null, "A", null, null, null);

    List<SpeciesGradeEndUseRow> actual = lookup(repository, bySpecies, "0011", "hE");

    if (bySpecies) {
      assertThat(actual).containsExactly(firstExpected, nullableExpected, firstExpected);
    } else {
      assertThat(actual)
          .containsExactly(
              firstExpected,
              new SpeciesGradeEndUseRow("HE", null, "LU", "HE//LU", 11L),
              new SpeciesGradeEndUseRow(null, null, null, null, null),
              nullableExpected,
              firstExpected);
    }
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  @SuppressWarnings("unchecked")
  void lookupsShouldDistinguishEmptyResultsFromOracleFailure(boolean bySpecies) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(sql(bySpecies)), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of())
        .thenThrow(failure);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(lookup(repository, bySpecies, "0011", "hE")).isEmpty();
    assertThatThrownBy(() -> lookup(repository, bySpecies, "0011", "hE")).isSameAs(failure);
  }

  @ParameterizedTest(name = "bySpecies={0}, column={1}")
  @MethodSource("columnFailures")
  void lookupsShouldFailForEveryUnreadableColumnBeforeFilteringBlankGrades(
      boolean bySpecies, String column) throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet valid = row("HE", "A", "LU", "HE/A/LU", 11L);
    ResultSet unreadable = row("HE", " ", "LU", "HE//LU", 11L);
    SQLException failure = new SQLException("Missing " + column);
    if (column.equals("ORG_UNIT_NO")) {
      when(unreadable.getLong(column)).thenThrow(failure);
    } else {
      when(unreadable.getString(column)).thenThrow(failure);
    }
    stubRows(jdbcTemplate, bySpecies, valid, unreadable);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> lookup(repository, bySpecies, "0011", "hE"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining(column)
        .hasCause(failure);
  }

  private static ResultSet row(
      String species, String grade, String endUse, String translation, Long orgUnit)
      throws SQLException {
    ResultSet row = mock(ResultSet.class);
    when(row.getString("EXPORT_SPECIES_CODE")).thenReturn(species);
    when(row.getString("EXPORT_GRADE_CODE")).thenReturn(grade);
    when(row.getString("EXPORT_END_USE_CODE")).thenReturn(endUse);
    when(row.getString("EXCOL_TRANSLATION_VALUE")).thenReturn(translation);
    when(row.getLong("ORG_UNIT_NO")).thenReturn(orgUnit == null ? 0L : orgUnit);
    when(row.wasNull()).thenReturn(orgUnit == null);
    return row;
  }

  @SuppressWarnings("unchecked")
  private static void stubRows(JdbcTemplate jdbcTemplate, boolean bySpecies, ResultSet... rows) {
    when(jdbcTemplate.query(eq(sql(bySpecies)), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<SpeciesGradeEndUseRow> mapper = invocation.getArgument(1);
              List<SpeciesGradeEndUseRow> mapped = new ArrayList<>();
              for (int index = 0; index < rows.length; index++) {
                mapped.add(mapper.mapRow(rows[index], index));
              }
              return mapped;
            });
  }

  private static String sql(boolean bySpecies) {
    return bySpecies
        ? SPECIES_GRADE_END_USES_BY_REGION_SPECIES
        : SPECIES_GRADE_END_USES_BY_REGION;
  }

  private static List<SpeciesGradeEndUseRow> lookup(
      ApplicationDetailsRpcRepository repository, boolean bySpecies, String region, String species) {
    return bySpecies
        ? repository.findSpeciesEndUsesByRegionSpeciesRequired(region, species)
        : repository.findSpeciesEndUsesByRegionRequired(region);
  }

  private static Stream<Arguments> columnFailures() {
    return Stream.of(false, true)
        .flatMap(
            bySpecies ->
                Stream.of(
                        "EXPORT_SPECIES_CODE",
                        "EXPORT_GRADE_CODE",
                        "EXPORT_END_USE_CODE",
                        "EXCOL_TRANSLATION_VALUE",
                        "ORG_UNIT_NO")
                    .map(column -> Arguments.of(bySpecies, column)));
  }
}

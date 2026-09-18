package ca.bc.gov.mof.lexis.repository;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_APPLICATION_STATUSES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_REASONS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_STATUSES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_TYPES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_JURISDICTIONS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_PERMIT_STATUSES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.repository.application.LexisApplicationRepository;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionRepository;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class DirectReferenceCodeOptionsRepositoryTest {

  private static final List<CodeNameDto> RAW_ROWS =
      List.of(
          new CodeNameDto(" f ", " Federal "),
          new CodeNameDto(" O ", " Order "),
          new CodeNameDto(" i ", " Reserve "),
          new CodeNameDto("DAL", " Deleted "),
          new CodeNameDto(" rej ", " Rejected "),
          new CodeNameDto("WDN", " Withdrawn "),
          new CodeNameDto("EXP", "Expired"),
          new CodeNameDto(null, " No code "),
          new CodeNameDto(" ", null),
          new CodeNameDto(" O ", " Order "),
          new CodeNameDto(" f ", " Federal "),
          new CodeNameDto(" rej ", " Rejected "));

  @ParameterizedTest(name = "{0}")
  @MethodSource("optionCases")
  @SuppressWarnings("unchecked")
  void shouldPreserveEachCallersMappingOrderDuplicatesFiltersAndAll(OptionCase option)
      throws Exception {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    when(jdbc.query(eq(option.sql()), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              List<CodeNameDto> mapped = new ArrayList<>();
              for (CodeNameDto raw : RAW_ROWS) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString(1)).thenReturn(raw.code());
                when(rs.getString(2)).thenReturn(raw.name());
                mapped.add(mapper.mapRow(rs, mapped.size()));
              }
              return mapped;
            });

    assertThat(option.loader().apply(jdbc)).containsExactlyElementsOf(option.expected());
    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbc).query(eq(option.sql()), any(RowMapper.class), binds.capture());
    assertThat(binds.getValue()).isEmpty();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("optionCases")
  @SuppressWarnings("unchecked")
  void shouldDistinguishEmptyResultsFromQueryFailure(OptionCase option) {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Reference options unavailable");
    when(jdbc.query(eq(option.sql()), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of())
        .thenThrow(failure);

    assertThat(option.loader().apply(jdbc)).containsExactlyElementsOf(option.whenEmpty());
    assertThatThrownBy(() -> option.loader().apply(jdbc)).isSameAs(failure);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("optionCases")
  @SuppressWarnings("unchecked")
  void shouldPropagateEitherPositionalColumnFailure(OptionCase option) throws Exception {
    for (int column : List.of(1, 2)) {
      JdbcTemplate jdbc = mock(JdbcTemplate.class);
      ResultSet rs = mock(ResultSet.class);
      SQLException failure = new SQLException("Invalid column " + column);
      if (column == 2) {
        when(rs.getString(1)).thenReturn("O");
      }
      when(rs.getString(column)).thenThrow(failure);
      when(jdbc.query(eq(option.sql()), any(RowMapper.class), any(Object[].class)))
          .thenAnswer(
              invocation -> {
                RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(rs, 0));
              });

      assertThatThrownBy(() -> option.loader().apply(jdbc)).isSameAs(failure);
    }
  }

  private static Stream<OptionCase> optionCases() {
    CodeNameDto f = new CodeNameDto("f", "Federal");
    CodeNameDto o = new CodeNameDto("O", "Order");
    CodeNameDto i = new CodeNameDto("i", "Reserve");
    CodeNameDto dal = new CodeNameDto("DAL", "Deleted");
    CodeNameDto rej = new CodeNameDto("rej", "Rejected");
    CodeNameDto wdn = new CodeNameDto("WDN", "Withdrawn");
    CodeNameDto exp = new CodeNameDto("EXP", "Expired");
    CodeNameDto missingCode = new CodeNameDto(null, "No code");
    CodeNameDto blank = new CodeNameDto(null, null);
    CodeNameDto all = new CodeNameDto("", "All");
    CodeNameDto allApplicationTypes = new CodeNameDto("ALL", "All");
    CodeNameDto noApplicationType = new CodeNameDto("NULL", "None");
    List<CodeNameDto> allRows =
        List.of(f, o, i, dal, rej, wdn, exp, missingCode, blank, o, f, rej);
    List<CodeNameDto> leadingAll =
        List.of(all, f, o, i, dal, rej, wdn, exp, missingCode, blank, o, f, rej);
    List<CodeNameDto> trailingAll =
        List.of(f, o, i, dal, rej, wdn, exp, missingCode, blank, o, f, rej, all);
    List<CodeNameDto> reportJurisdictions =
        List.of(all, f, o, dal, rej, wdn, exp, missingCode, blank, o, f, rej);

    return Stream.of(
        new OptionCase(
            "application exemption types", ACTIVE_EXEMPTION_TYPES,
            jdbc -> new LexisApplicationRepository(jdbc).loadExemptionTypeOptions(),
            List.of(allApplicationTypes, noApplicationType, o, i, dal, rej, wdn, exp, missingCode, blank, o, rej),
            List.of(allApplicationTypes, noApplicationType)),
        new OptionCase(
            "application exemption reasons", ACTIVE_EXEMPTION_REASONS,
            jdbc -> new LexisApplicationRepository(jdbc).loadExemptionReasonOptions(),
            allRows, List.of()),
        new OptionCase(
            "application statuses", ACTIVE_APPLICATION_STATUSES,
            jdbc -> new LexisApplicationRepository(jdbc).loadApplicationStatusOptions(),
            leadingAll, List.of(all)),
        new OptionCase(
            "federal application statuses", ACTIVE_APPLICATION_STATUSES,
            jdbc -> new FederalApplicationRepository(jdbc).loadApplicationStatusOptions(),
            List.of(f, o, i, rej, wdn, exp, missingCode, blank, o, f, rej), List.of()),
        new OptionCase(
            "federal exemption types", ACTIVE_EXEMPTION_TYPES,
            jdbc -> new FederalApplicationRepository(jdbc).loadFederalExemptionTypeOptions(),
            List.of(f, f), List.of()),
        new OptionCase(
            "review statuses", ACTIVE_APPLICATION_STATUSES,
            jdbc -> new ApplicationReviewRepository(jdbc).loadReviewStatusOptions(),
            List.of(rej, wdn, exp, rej), List.of()),
        new OptionCase(
            "exemption types", ACTIVE_EXEMPTION_TYPES,
            jdbc -> new ExemptionRepository(jdbc).loadExemptionTypeOptions(),
            List.of(o, i, dal, rej, wdn, exp, o, rej), List.of()),
        new OptionCase(
            "exemption statuses", ACTIVE_EXEMPTION_STATUSES,
            jdbc -> new ExemptionRepository(jdbc).loadExemptionStatusOptions(),
            List.of(f, o, i, dal, rej, wdn, exp, o, f, rej), List.of()),
        new OptionCase(
            "permit statuses", ACTIVE_PERMIT_STATUSES,
            jdbc -> new PermitRepository(jdbc).loadPermitStatusOptions(), allRows, List.of()),
        new OptionCase(
            "report jurisdictions", ACTIVE_JURISDICTIONS,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadReportJurisdictionOptions(),
            reportJurisdictions, List.of(all)),
        new OptionCase(
            "biweekly jurisdictions", ACTIVE_JURISDICTIONS,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadBiweeklyJurisdictionOptions(),
            reportJurisdictions, List.of(all)),
        new OptionCase(
            "TEAC jurisdictions", ACTIVE_JURISDICTIONS,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadTeacJurisdictionOptions(),
            List.of(f, o, dal, rej, wdn, exp, missingCode, blank, o, f, rej), List.of()),
        new OptionCase(
            "report exemption types", ACTIVE_EXEMPTION_TYPES,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadReportExemptionTypeOptions(),
            leadingAll, List.of(all)),
        new OptionCase(
            "tenure exemption types", ACTIVE_EXEMPTION_TYPES,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadTenureExemptionTypeOptions(),
            trailingAll, List.of(all)),
        new OptionCase(
            "report exemption reasons", ACTIVE_EXEMPTION_REASONS,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadReportExemptionReasonOptions(),
            leadingAll, List.of(all)),
        new OptionCase(
            "report exemption statuses", ACTIVE_EXEMPTION_STATUSES,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadReportExemptionStatusOptions(),
            leadingAll, List.of(all)),
        new OptionCase(
            "report permit statuses", ACTIVE_PERMIT_STATUSES,
            jdbc -> new LexisReportScheduleRepository(jdbc).loadReportPermitStatusOptions(),
            leadingAll, List.of(all)));
  }

  private record OptionCase(
      String name,
      String sql,
      Function<JdbcTemplate, List<CodeNameDto>> loader,
      List<CodeNameDto> expected,
      List<CodeNameDto> whenEmpty) {
    @Override
    public String toString() {
      return name;
    }
  }
}

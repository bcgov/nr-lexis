package ca.bc.gov.mof.lexis.repository.report;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_COUNTRIES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_COUNTRIES_BY_GROUP;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_TYPES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_GROWTH_TYPES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_JURISDICTIONS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_PORTS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ORG_UNIT_BY_CODE;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ORG_UNIT_BY_NUMBER;
import static ca.bc.gov.mof.lexis.repository.reference.LexisScheduleQueries.CURRENT_SCHEDULES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisScheduleQueries.NEXT_SCHEDULES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository.CurrentScheduleRow;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class LexisReportScheduleRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;
  @Mock private ResultSet clientResultSet;
  @Mock private ResultSet orgUnitResultSet;
  @Mock private PreparedStatement preparedStatement;
  @Mock private Connection connection;

  @Test
  @SuppressWarnings("unchecked")
  void growthTypeOptionsShouldPrependAllAndPreserveDirectRowOrderAndDuplicates() throws Exception {
    when(resultSet.getString(1)).thenReturn(" S ", "O", " S ", null, " ");
    when(resultSet.getString(2))
        .thenReturn(" Second Growth ", "Old Growth", " Second Growth ", " ", null);
    when(jdbcTemplate.query(eq(ACTIVE_GROWTH_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(
                  mapper.mapRow(resultSet, 0),
                  mapper.mapRow(resultSet, 1),
                  mapper.mapRow(resultSet, 2),
                  mapper.mapRow(resultSet, 3),
                  mapper.mapRow(resultSet, 4));
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.loadReportGrowthTypeOptions())
        .containsExactly(
            new CodeNameDto("", "All"),
            new CodeNameDto("S", "Second Growth"),
            new CodeNameDto("O", "Old Growth"),
            new CodeNameDto("S", "Second Growth"),
            new CodeNameDto(null, null),
            new CodeNameDto(null, null));
    ArgumentCaptor<Object[]> bindCaptor = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate)
        .query(eq(ACTIVE_GROWTH_TYPES), any(RowMapper.class), bindCaptor.capture());
    assertThat(bindCaptor.getValue()).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void growthTypeOptionsShouldReturnOnlyAllForEmptyResultsAndPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(ACTIVE_GROWTH_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of())
        .thenThrow(failure);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.loadReportGrowthTypeOptions()).containsExactly(new CodeNameDto("", "All"));
    assertThatThrownBy(repository::loadReportGrowthTypeOptions).isSameAs(failure);
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 2})
  @SuppressWarnings("unchecked")
  void growthTypeOptionsShouldPropagatePositionalColumnFailure(int column) throws Exception {
    SQLException failure = new SQLException("Invalid column index " + column);
    if (column == 2) {
      when(resultSet.getString(1)).thenReturn("O");
    }
    when(resultSet.getString(column)).thenThrow(failure);
    when(jdbcTemplate.query(eq(ACTIVE_GROWTH_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadReportGrowthTypeOptions).isSameAs(failure);
  }

  @Test
  @SuppressWarnings("unchecked")
  void loadRegionOptionsShouldResolveEachLegacyConfiguredRegionByNumber() throws Exception {
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), anyString()))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    when(resultSet.getLong("ORG_UNIT_NO"))
        .thenReturn(1903L, 1904L, 1905L, 1906L, 1907L, 1908L, 1909L, 1910L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("ORG_UNIT_CODE"))
        .thenReturn("RCB", "RKB", "RNO", "ROM", "RTO", "RSK", "RSC", "RWC");
    when(resultSet.getString("ORG_UNIT_NAME"))
        .thenReturn(
            "Cariboo Natural Resource Region",
            "Kootenay-Boundary Natural Resource Region",
            "Northeast Natural Resource Region",
            "Omineca Natural Resource Region",
            "Thompson-Okanagan Natural Resource Region",
            "Skeena Natural Resource Region",
            "South Coast Natural Resource Region",
            "West Coast Natural Resource Region");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadRegionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(
            tuple("1903", "Cariboo Natural Resource Region"),
            tuple("1904", "Kootenay-Boundary Natural Resource Region"),
            tuple("1905", "Northeast Natural Resource Region"),
            tuple("1906", "Omineca Natural Resource Region"),
            tuple("1907", "Thompson-Okanagan Natural Resource Region"),
            tuple("1908", "Skeena Natural Resource Region"),
            tuple("1909", "South Coast Natural Resource Region"),
            tuple("1910", "West Coast Natural Resource Region"));
    ArgumentCaptor<String> regionBinds = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate, times(8))
        .query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), regionBinds.capture());
    assertThat(regionBinds.getAllValues())
        .containsExactly("1903", "1904", "1905", "1906", "1907", "1908", "1909", "1910");
  }

  @Test
  @SuppressWarnings("unchecked")
  void loadRegionOptionsShouldNotSynthesizeAnUnresolvedRegion() throws Exception {
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), anyString()))
        .thenAnswer(
            invocation -> {
              if (!"1903".equals(invocation.getArgument(2))) {
                return List.of();
              }
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("ORG_UNIT_CODE")).thenReturn("RCB");
    when(resultSet.getString("ORG_UNIT_NAME")).thenReturn("Cariboo Natural Resource Region");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.loadRegionOptions())
        .extracting("code", "name")
        .containsExactly(tuple("1903", "Cariboo Natural Resource Region"));
    verify(jdbcTemplate, times(8))
        .query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), anyString());
  }

  @Test
  void reportExemptionTypeOptionsShouldPrependAllLikeLegacyReportSelects() throws Exception {
    stubDirectCodeOptions(ACTIVE_EXEMPTION_TYPES, 2);
    when(resultSet.getString(1)).thenReturn("F ", "O");
    when(resultSet.getString(2)).thenReturn(" Federal ", "Order In Council");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportExemptionTypeOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"), tuple("F", "Federal"), tuple("O", "Order In Council"));
  }

  @Test
  void tenureExemptionTypeOptionsShouldAppendAllLikeLegacyTenureSelect() throws Exception {
    stubDirectCodeOptions(ACTIVE_EXEMPTION_TYPES, 2);
    when(resultSet.getString(1)).thenReturn("F", "O");
    when(resultSet.getString(2)).thenReturn("Federal", "Order In Council");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadTenureExemptionTypeOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("F", "Federal"), tuple("O", "Order In Council"), tuple("", "All"));
  }

  @Test
  void jurisdictionOptionsShouldRemoveRetiredIndianReserveJurisdiction() throws Exception {
    stubDirectCodeOptions(ACTIVE_JURISDICTIONS, 3);
    when(resultSet.getString(1)).thenReturn("P", "F", "I");
    when(resultSet.getString(2)).thenReturn("Provincial", "Federal", "Reserve");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportJurisdictionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"), tuple("P", "Provincial"), tuple("F", "Federal"));
  }

  @Test
  void biweeklyJurisdictionOptionsShouldPrependAllAndRemoveRetiredIndianReserveJurisdiction()
      throws Exception {
    stubDirectCodeOptions(ACTIVE_JURISDICTIONS, 3);
    when(resultSet.getString(1)).thenReturn("P", "F", "I");
    when(resultSet.getString(2)).thenReturn("Provincial", "Federal", "Reserve");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadBiweeklyJurisdictionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"), tuple("P", "Provincial"), tuple("F", "Federal"));
  }

  @Test
  void teacJurisdictionOptionsShouldRemoveRetiredIndianReserveJurisdictionWithoutAddingAllLikeLegacy()
      throws Exception {
    stubDirectCodeOptions(ACTIVE_JURISDICTIONS, 3);
    when(resultSet.getString(1)).thenReturn("P", "F", "I");
    when(resultSet.getString(2)).thenReturn("Provincial", "Federal", "Reserve");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadTeacJurisdictionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("P", "Provincial"), tuple("F", "Federal"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void destinationCountryOptionsShouldUseLegacyReportShortCountryGroup() throws Exception {
    when(jdbcTemplate.query(eq(ACTIVE_COUNTRIES_BY_GROUP), any(RowMapper.class), eq(1)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(
                  mapper.mapRow(resultSet, 0),
                  mapper.mapRow(resultSet, 1),
                  mapper.mapRow(resultSet, 2));
            });
    when(resultSet.getString("CODE")).thenReturn(" US ", "JP", " US ");
    when(resultSet.getString("DESCRIPTION"))
        .thenReturn(" United States ", "Japan", " United States ");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportDestinationCountryOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(
            tuple("", "All"),
            tuple("US", "United States"),
            tuple("JP", "Japan"),
            tuple("US", "United States"));
    verify(jdbcTemplate).query(eq(ACTIVE_COUNTRIES_BY_GROUP), any(RowMapper.class), eq(1));
  }

  @Test
  @SuppressWarnings("unchecked")
  void destinationCountryOptionsShouldPreserveEmptyResultsAndPropagateQueryFailures() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Country group unavailable");
    when(jdbcTemplate.query(eq(ACTIVE_COUNTRIES_BY_GROUP), any(RowMapper.class), eq(1)))
        .thenReturn(List.of())
        .thenThrow(failure);

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportDestinationCountryOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"));
    assertThatThrownBy(repository::loadReportDestinationCountryOptions).isSameAs(failure);
  }

  @ParameterizedTest
  @ValueSource(strings = {"CODE", "DESCRIPTION"})
  @SuppressWarnings("unchecked")
  void destinationCountryOptionsShouldRetainOptionalColumnCompatibility(String missingColumn)
      throws Exception {
    if (missingColumn.equals("CODE")) {
      when(resultSet.getString("CODE")).thenThrow(new SQLException("Missing code"));
      when(resultSet.getString("DESCRIPTION")).thenReturn(" United States ");
    } else {
      when(resultSet.getString("CODE")).thenReturn(" US ");
      when(resultSet.getString("DESCRIPTION")).thenThrow(new SQLException("Missing description"));
    }
    when(jdbcTemplate.query(eq(ACTIVE_COUNTRIES_BY_GROUP), any(RowMapper.class), eq(1)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.loadReportDestinationCountryOptions())
        .containsExactly(
            new CodeNameDto("", "All"),
            missingColumn.equals("CODE")
                ? new CodeNameDto(null, "United States")
                : new CodeNameDto("US", null));
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void reportCodeOptionsShouldPropagateOracleFailureInsteadOfReturningStaticChoices() {
    when(jdbcTemplate.query(
            eq(ACTIVE_EXEMPTION_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadReportExemptionTypeOptions)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void reportCodeOptionsShouldPreserveLegitimatelyEmptyResults() throws Exception {
    stubDirectCodeOptions(ACTIVE_JURISDICTIONS, 0);

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.loadTeacJurisdictionOptions()).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void allDestinationCountryOptionsShouldPreserveDirectRowsInOrderWithoutAllOrDeduplication()
      throws Exception {
    when(resultSet.getString(1)).thenReturn(" US ", "NZ", " US ", null, " ");
    when(resultSet.getString(2))
        .thenReturn(" United States ", "New Zealand", " United States ", " ", null);
    when(jdbcTemplate.query(eq(ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(
                  mapper.mapRow(resultSet, 0),
                  mapper.mapRow(resultSet, 1),
                  mapper.mapRow(resultSet, 2),
                  mapper.mapRow(resultSet, 3),
                  mapper.mapRow(resultSet, 4));
            });

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadAllReportDestinationCountryOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(
            tuple("US", "United States"),
            tuple("NZ", "New Zealand"),
            tuple("US", "United States"),
            tuple(null, null),
            tuple(null, null));
    ArgumentCaptor<Object[]> bindCaptor = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).query(eq(ACTIVE_COUNTRIES), any(RowMapper.class), bindCaptor.capture());
    assertThat(bindCaptor.getValue()).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void allDestinationCountryOptionsShouldPreserveEmptyResultsAndPropagateQueryFailures() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("countries unavailable");
    when(jdbcTemplate.query(eq(ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of())
        .thenThrow(failure);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.loadAllReportDestinationCountryOptions()).isEmpty();
    assertThatThrownBy(repository::loadAllReportDestinationCountryOptions).isSameAs(failure);
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 2})
  @SuppressWarnings("unchecked")
  void allDestinationCountryOptionsShouldPropagatePositionalColumnFailure(int column)
      throws Exception {
    SQLException failure = new SQLException("Invalid column index " + column);
    if (column == 2) {
      when(resultSet.getString(1)).thenReturn("US");
    }
    when(resultSet.getString(column)).thenThrow(failure);
    when(jdbcTemplate.query(eq(ACTIVE_COUNTRIES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadAllReportDestinationCountryOptions).isSameAs(failure);
  }

  @Test
  @SuppressWarnings("unchecked")
  void portOfExportOptionsShouldUseDirectActivePortQueryAndPrependAll() throws Exception {
    when(jdbcTemplate.query(eq(ACTIVE_PORTS), any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              when(resultSet.getString(1)).thenReturn(" VAN ");
              when(resultSet.getString(2)).thenReturn(" Vancouver ");
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportPortOfExportOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"), tuple("VAN", "Vancouver"));
    verify(jdbcTemplate).query(eq(ACTIVE_PORTS), any(RowMapper.class));
    verify(resultSet).getString(1);
    verify(resultSet).getString(2);
    assertThat(ACTIVE_PORTS)
        .contains("SYSDATE BETWEEN C.EFFECTIVE_DATE AND C.EXPIRY_DATE")
        .doesNotContain("ORDER BY");
  }

  @Test
  @SuppressWarnings("unchecked")
  void portOfExportOptionsShouldPreserveAnEmptyDirectQueryResult() {
    when(jdbcTemplate.query(eq(ACTIVE_PORTS), any(RowMapper.class))).thenReturn(List.of());
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.loadReportPortOfExportOptions())
        .extracting("code", "name")
        .containsExactly(tuple("", "All"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void portOfExportOptionsShouldPropagateDirectQueryFailure() {
    when(jdbcTemplate.query(eq(ACTIVE_PORTS), any(RowMapper.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThatThrownBy(repository::loadReportPortOfExportOptions)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  @SuppressWarnings("unchecked")
  void findDefaultRegionForForestClientNumberShouldUseLegacyClientAcronymFallback() throws Exception {
    stubClientAcronym(" RCO ");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_CODE), any(RowMapper.class), eq("RCO")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return List.of(
                  mapper.mapRow(orgUnitResultSet, 0), mapper.mapRow(orgUnitResultSet, 1));
            });
    when(orgUnitResultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L, 1910L);
    when(orgUnitResultSet.wasNull()).thenReturn(false);

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var defaultRegion = repository.findDefaultRegionForForestClientNumber(" 00077881 ");

    assertThat(defaultRegion).contains("1903");
    verify(callableStatement).setString(1, "00077881");
    verify(jdbcTemplate).query(eq(ORG_UNIT_BY_CODE), any(RowMapper.class), eq("RCO"));
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  @SuppressWarnings("unchecked")
  void defaultRegionShouldRemainEmptyWhenNoOrgUnitMatchesTheClientAcronym() throws Exception {
    stubClientAcronym("RCO");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_CODE), any(RowMapper.class), eq("RCO")))
        .thenReturn(List.of());
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.findDefaultRegionForForestClientNumber("00077881")).isEmpty();
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  @SuppressWarnings("unchecked")
  void defaultRegionShouldPreserveNullFirstRowIncludingOptionalColumnFailure(boolean missingColumn)
      throws Exception {
    stubClientAcronym("RCO");
    if (missingColumn) {
      when(orgUnitResultSet.getLong("ORG_UNIT_NO"))
          .thenThrow(new SQLException("Missing org unit number"))
          .thenReturn(1910L);
      when(orgUnitResultSet.wasNull()).thenReturn(false);
    } else {
      when(orgUnitResultSet.getLong("ORG_UNIT_NO")).thenReturn(0L, 1910L);
      when(orgUnitResultSet.wasNull()).thenReturn(true, false);
    }
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_CODE), any(RowMapper.class), eq("RCO")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(
                  mapper.mapRow(orgUnitResultSet, 0), mapper.mapRow(orgUnitResultSet, 1));
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.findDefaultRegionForForestClientNumber("00077881")).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void defaultRegionShouldPropagateOrgUnitQueryFailure() throws Exception {
    stubClientAcronym("RCO");
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Org units unavailable");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_CODE), any(RowMapper.class), eq("RCO")))
        .thenThrow(failure);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.findDefaultRegionForForestClientNumber("00077881"))
        .isSameAs(failure);
  }

  @Test
  void findDefaultRegionForForestClientNumberShouldReturnEmptyWhenClientHasNoAcronym()
      throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_FOREST_CLIENT(?,?) }", 2);
    when(callableStatement.getObject(2)).thenReturn(clientResultSet);
    when(clientResultSet.next()).thenReturn(true, false);
    when(clientResultSet.getString("CLIENT_ACRONYM")).thenReturn(" ");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var defaultRegion = repository.findDefaultRegionForForestClientNumber("00077881");

    assertThat(defaultRegion).isEmpty();
    verify(callableStatement).setString(1, "00077881");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void scheduleListsShouldMapDirectRowsInDatabaseOrderIncludingNulls(boolean next)
      throws Exception {
    String sql = next ? NEXT_SCHEDULES : CURRENT_SCHEDULES;
    stubDirectScheduleRows(sql, 3);
    when(resultSet.getLong("EXPORT_SCHEDULE_ID")).thenReturn(1002L, 1001L, 0L);
    when(resultSet.wasNull()).thenReturn(false, false, true);
    when(resultSet.getDate("ADVERTISING_DATE"))
        .thenReturn(java.sql.Date.valueOf("2026-07-08"), java.sql.Date.valueOf("2026-07-02"), null);

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var schedules = next ? repository.findNextSchedulesRequired() : repository.findCurrentSchedulesRequired();

    assertThat(schedules)
        .extracting("exportScheduleId", "advertisingDate")
        .containsExactly(
            tuple(1002L, LocalDate.of(2026, 7, 8)),
            tuple(1001L, LocalDate.of(2026, 7, 2)),
            tuple(null, null));
    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).query(eq(sql), any(RowMapper.class), binds.capture());
    assertThat(binds.getValue()).isEmpty();
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  @SuppressWarnings("unchecked")
  void scheduleListsShouldDistinguishEmptyResultsFromQueryFailures(boolean next) {
    String sql = next ? NEXT_SCHEDULES : CURRENT_SCHEDULES;
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Schedules unavailable");
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of())
        .thenThrow(failure);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(next ? repository.findNextSchedulesRequired() : repository.findCurrentSchedulesRequired())
        .isEmpty();
    assertThatThrownBy(
            () -> {
              if (next) {
                repository.findNextSchedulesRequired();
              } else {
                repository.findCurrentSchedulesRequired();
              }
            })
        .isSameAs(failure);
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void scheduleListsShouldPropagateRequiredIdColumnFailure(boolean next)
      throws Exception {
    stubDirectScheduleRows(next ? NEXT_SCHEDULES : CURRENT_SCHEDULES, 1);
    SQLException failure = new SQLException("Missing schedule id");
    when(resultSet.getLong("EXPORT_SCHEDULE_ID")).thenThrow(failure);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> {
              if (next) {
                repository.findNextSchedulesRequired();
              } else {
                repository.findCurrentSchedulesRequired();
              }
            })
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasCause(failure);
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void scheduleListsShouldPropagateAdvertisingDateColumnFailure(boolean next)
      throws Exception {
    stubDirectScheduleRows(next ? NEXT_SCHEDULES : CURRENT_SCHEDULES, 1);
    SQLException failure = new SQLException("Missing advertising date");
    when(resultSet.getDate("ADVERTISING_DATE")).thenThrow(failure);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> {
              if (next) {
                repository.findNextSchedulesRequired();
              } else {
                repository.findCurrentSchedulesRequired();
              }
            })
        .isSameAs(failure);
  }

  @Test
  @SuppressWarnings("unchecked")
  void findUpcomingExportSchedulesPageShouldFilterPastRowsAndBindOffsetLimit() throws Exception {
    when(jdbcTemplate.query(
            any(String.class),
            any(PreparedStatementSetter.class),
            any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              PreparedStatementSetter setter = invocation.getArgument(1);
              setter.setValues(preparedStatement);
              return List.of();
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    repository.findUpcomingExportSchedules(2, 50);

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sqlCaptor.getValue())
        .contains("SYSTIMESTAMP AT TIME ZONE 'America/Vancouver'")
        .contains("ORDER BY ES.ADVERTISING_DATE ASC")
        .contains("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    verify(preparedStatement).setInt(1, 100);
    verify(preparedStatement).setInt(2, 50);
  }

  @Test
  @SuppressWarnings("unchecked")
  void findExportSchedulesPageShouldIncludeAllDatesAndUseWhitelistedSorting() throws Exception {
    when(jdbcTemplate.query(
            any(String.class),
            any(PreparedStatementSetter.class),
            any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              PreparedStatementSetter setter = invocation.getArgument(1);
              setter.setValues(preparedStatement);
              return List.of();
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    repository.findExportSchedules(0, 50, "teacMeetingDate", "desc");

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sqlCaptor.getValue())
        .contains("AS PROVINCIAL_APPLICATION_COUNT")
        .contains("FROM EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("EEA.APPLICATION_NUMBER > TO_NUMBER(0)")
        .contains("EEA.EXPORT_JURISDICTION_CODE <> 'F'")
        .contains("EEA.OIC_INDICATOR = 'N'")
        .contains("FROM EXPORT_APPLICATION_STATUS_CODE EASC")
        .contains("FROM EXPORT_EXEMPTION_REASON_CODE EERC")
        .contains("FROM EXPORT_APPLICANT_TYPE_CODE EATC")
        .doesNotContain("EXPORT_EXEMPTION_APP_VIEW")
        .contains("ORDER BY ES.TEAC_MEETING_DATE DESC, ES.EXPORT_SCHEDULE_ID ASC")
        .doesNotContain("WHERE ES.ADVERTISING_DATE")
        .contains("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    verify(preparedStatement).setInt(1, 0);
    verify(preparedStatement).setInt(2, 50);
  }

  @Test
  @SuppressWarnings("unchecked")
  void findExportSchedulesPageShouldSortApplicationLinksByProvincialCount() throws Exception {
    when(jdbcTemplate.query(
            any(String.class),
            any(PreparedStatementSetter.class),
            any(RowMapper.class)))
        .thenReturn(List.of());
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    repository.findExportSchedules(0, 50, "applicationCount", "desc");

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sqlCaptor.getValue())
        .contains("ORDER BY PROVINCIAL_APPLICATION_COUNT DESC, ES.EXPORT_SCHEDULE_ID ASC");
  }

  @Test
  @SuppressWarnings("unchecked")
  void findExportSchedulesPageShouldFallbackForUnknownSortValues() throws Exception {
    when(jdbcTemplate.query(
            any(String.class),
            any(PreparedStatementSetter.class),
            any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              PreparedStatementSetter setter = invocation.getArgument(1);
              setter.setValues(preparedStatement);
              return List.of();
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    repository.findExportSchedules(0, 50, "ADVERTISING_DATE; DELETE", "DESC; DELETE");

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sqlCaptor.getValue())
        .contains("ORDER BY ES.ADVERTISING_DATE ASC, ES.EXPORT_SCHEDULE_ID ASC")
        .doesNotContain("DELETE");
  }

  @Test
  @SuppressWarnings("unchecked")
  void findExportScheduleByAdvertisingDateShouldBindExactLegacyListDate() throws Exception {
    when(jdbcTemplate.query(
            any(String.class),
            any(PreparedStatementSetter.class),
            any(RowMapper.class)))
        .thenAnswer(
            invocation -> {
              PreparedStatementSetter setter = invocation.getArgument(1);
              setter.setValues(preparedStatement);
              return List.of();
            });
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var result =
        repository.findExportScheduleByAdvertisingDate(LocalDate.of(2026, 1, 16));

    assertThat(result).isEmpty();
    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sqlCaptor.getValue())
        .contains("WHERE TRUNC(ES.ADVERTISING_DATE) = ?")
        .contains("ORDER BY ES.EXPORT_SCHEDULE_ID");
    verify(preparedStatement).setDate(1, java.sql.Date.valueOf("2026-01-16"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void insertExportScheduleShouldUseLegacyInlineSequenceAndBindScheduleDates() throws Exception {
    when(connection.prepareCall(any(String.class))).thenReturn(callableStatement);
    when(callableStatement.getLong(7)).thenReturn(1002L);
    when(callableStatement.wasNull()).thenReturn(false);
    when(jdbcTemplate.execute(any(ConnectionCallback.class)))
        .thenAnswer(
            invocation -> {
              ConnectionCallback<Long> callback = invocation.getArgument(0);
              return callback.doInConnection(connection);
            });
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 29),
            LocalDate.of(2026, 8, 7),
            LocalDate.of(2026, 8, 14),
            LocalDate.of(2026, 8, 4));
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var row = repository.insertExportSchedule(request);

    assertThat(row.exportScheduleId()).isEqualTo(1002L);
    assertThat(row.advertisingDate()).isEqualTo(LocalDate.of(2026, 7, 15));
    verify(jdbcTemplate, never()).execute("LOCK TABLE EXPORT_SCHEDULE IN EXCLUSIVE MODE");
    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(connection).prepareCall(sqlCaptor.capture());
    assertThat(sqlCaptor.getValue())
        .contains("EXPORT_SCHEDULE_SEQ.NEXTVAL")
        .doesNotContain("SELECT EXPORT_SCHEDULE_SEQ.NEXTVAL FROM DUAL");
    verify(callableStatement).setDate(1, java.sql.Date.valueOf("2026-07-15"));
    verify(callableStatement).setDate(2, java.sql.Date.valueOf("2026-07-15"));
    verify(callableStatement).setDate(3, java.sql.Date.valueOf("2026-07-29"));
    verify(callableStatement).setDate(4, java.sql.Date.valueOf("2026-08-07"));
    verify(callableStatement).setDate(5, java.sql.Date.valueOf("2026-08-14"));
    verify(callableStatement).setDate(6, java.sql.Date.valueOf("2026-08-04"));
    verify(callableStatement).registerOutParameter(7, Types.NUMERIC);
  }

  @Test
  void updateExportScheduleShouldBindScheduleDatesAndId() throws Exception {
    when(jdbcTemplate.update(any(String.class), any(PreparedStatementSetter.class)))
        .thenAnswer(
            invocation -> {
              PreparedStatementSetter setter = invocation.getArgument(1);
              setter.setValues(preparedStatement);
              return 1;
            });
    ExportScheduleCreateRequestDto request =
        new ExportScheduleCreateRequestDto(
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 15),
            LocalDate.of(2026, 7, 29),
            LocalDate.of(2026, 8, 7),
            LocalDate.of(2026, 8, 14),
            LocalDate.of(2026, 8, 4));
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var row = repository.updateExportSchedule(1002L, request);

    assertThat(row.exportScheduleId()).isEqualTo(1002L);
    verify(preparedStatement).setDate(1, java.sql.Date.valueOf("2026-07-15"));
    verify(preparedStatement).setDate(2, java.sql.Date.valueOf("2026-07-15"));
    verify(preparedStatement).setDate(3, java.sql.Date.valueOf("2026-07-29"));
    verify(preparedStatement).setDate(4, java.sql.Date.valueOf("2026-08-07"));
    verify(preparedStatement).setDate(5, java.sql.Date.valueOf("2026-08-14"));
    verify(preparedStatement).setDate(6, java.sql.Date.valueOf("2026-08-04"));
    verify(preparedStatement).setLong(7, 1002L);
  }

  @Test
  void countApplicationsForExportScheduleShouldQueryLegacyApplicationTable() {
    when(jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM EXPORT_EXEMPTION_APPLICATION WHERE EXPORT_SCHEDULE_ID = ?",
            Long.class,
            1002L))
        .thenReturn(3L);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    long count = repository.countApplicationsForExportSchedule(1002L);

    assertThat(count).isEqualTo(3L);
  }

  @Test
  void deleteExportScheduleShouldReturnTrueWhenRowDeleted() {
    when(jdbcTemplate.update("DELETE FROM EXPORT_SCHEDULE WHERE EXPORT_SCHEDULE_ID = ?", 1002L))
        .thenReturn(1);
    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    assertThat(repository.deleteExportSchedule(1002L)).isTrue();
  }

  private void stubClientAcronym(String acronym) throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_FOREST_CLIENT(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("CLIENT_ACRONYM")).thenReturn(acronym);
  }

  @SuppressWarnings("unchecked")
  private void stubDirectScheduleRows(String sql, int rowCount) {
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CurrentScheduleRow> mapper = invocation.getArgument(1);
              List<CurrentScheduleRow> rows = new ArrayList<>();
              for (int row = 0; row < rowCount; row++) {
                rows.add(mapper.mapRow(resultSet, row));
              }
              return rows;
            });
  }

  @SuppressWarnings("unchecked")
  private void stubDirectCodeOptions(String sql, int rowCount) throws Exception {
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              List<CodeNameDto> rows = new ArrayList<>();
              for (int row = 0; row < rowCount; row++) {
                rows.add(mapper.mapRow(resultSet, row));
              }
              return rows;
            });
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursorProcedure(String call) throws Exception {
    stubCursorProcedure(call, 1);
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursorProcedure(String call, int cursorOutIndex) throws Exception {
    when(jdbcTemplate.execute(eq(call), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback<?> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(callableStatement);
            });
    when(callableStatement.getObject(cursorOutIndex)).thenReturn(resultSet);
  }
}

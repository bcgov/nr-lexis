package ca.bc.gov.mof.lexis.repository.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Types;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
  void loadRegionOptionsShouldUseOrgUnitNameLabelsLikeLegacyReportSelects() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_ORG_UNITS(?) }");
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L, 1904L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("ORG_UNIT_CODE")).thenReturn("RCB", "RKB");
    when(resultSet.getString("ORG_UNIT_NAME"))
        .thenReturn("Cariboo Natural Resource Region", "Kootenay-Boundary Natural Resource Region");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadRegionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(
            tuple("1903", "Cariboo Natural Resource Region"),
            tuple("1904", "Kootenay-Boundary Natural Resource Region"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void reportExemptionTypeOptionsShouldPrependAllLikeLegacyReportSelects() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_EXEMPTION_TYPE_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString(1)).thenReturn("F ", "O");
    when(resultSet.getString(2)).thenReturn(" Federal ", "Order In Council");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportExemptionTypeOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"), tuple("F", "Federal"), tuple("O", "Order In Council"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void tenureExemptionTypeOptionsShouldAppendAllLikeLegacyTenureSelect() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_EXEMPTION_TYPE_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString(1)).thenReturn("F", "O");
    when(resultSet.getString(2)).thenReturn("Federal", "Order In Council");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadTenureExemptionTypeOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("F", "Federal"), tuple("O", "Order In Council"), tuple("", "All"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void jurisdictionOptionsShouldRemoveReserveReports() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_JURISDICTION_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, true, false);
    when(resultSet.getString(1)).thenReturn("P", "F", "I");
    when(resultSet.getString(2)).thenReturn("Provincial", "Federal", "Reserve");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportJurisdictionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"), tuple("P", "Provincial"), tuple("F", "Federal"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void biweeklyJurisdictionOptionsShouldPrependAllAndRemoveReserveLikeLegacy() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_JURISDICTION_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, true, false);
    when(resultSet.getString(1)).thenReturn("P", "F", "I");
    when(resultSet.getString(2)).thenReturn("Provincial", "Federal", "Reserve");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadBiweeklyJurisdictionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("", "All"), tuple("P", "Provincial"), tuple("F", "Federal"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void teacJurisdictionOptionsShouldRemoveReserveWithoutAddingAllLikeLegacy() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_JURISDICTION_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, true, false);
    when(resultSet.getString(1)).thenReturn("P", "F", "I");
    when(resultSet.getString(2)).thenReturn("Provincial", "Federal", "Reserve");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadTeacJurisdictionOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("P", "Provincial"), tuple("F", "Federal"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void destinationCountryOptionsShouldUseLegacyReportShortCountryGroup() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_COUNTRY_GROUP(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString("CODE")).thenReturn("US", "JP");
    when(resultSet.getString("DESCRIPTION")).thenReturn("United States", "Japan");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportDestinationCountryOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(
            tuple("", "All"),
            tuple("US", "United States"),
            tuple("JP", "Japan"));
    verify(callableStatement).setInt(1, 1);
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void destinationCountryOptionsShouldFallbackWhenCodePackageReturnsEmpty() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_COUNTRY_GROUP(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportDestinationCountryOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(
            tuple("", "All"),
            tuple("US", "United States"),
            tuple("JP", "Japan"),
            tuple("CN", "China"),
            tuple("NZ", "New Zealand"));
    verify(callableStatement).setInt(1, 1);
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void allDestinationCountryOptionsShouldUseLegacyFullCountryProcedureWithoutAll() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString(1)).thenReturn("US", "NZ");
    when(resultSet.getString(2)).thenReturn("United States", "New Zealand");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadAllReportDestinationCountryOptions();

    assertThat(options)
        .extracting("code", "name")
        .containsExactly(tuple("US", "United States"), tuple("NZ", "New Zealand"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void portOfExportOptionsShouldUseLegacyPortProcedureAndPrependAll() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_PORT_CODES(?) }");
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(1)).thenReturn("VAN");
    when(resultSet.getString(2)).thenReturn("Vancouver");

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var options = repository.loadReportPortOfExportOptions();

    assertThat(options).extracting("code", "name").containsExactly(tuple("", "All"), tuple("VAN", "Vancouver"));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void findDefaultRegionForForestClientNumberShouldUseLegacyClientAcronymFallback() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_FOREST_CLIENT(?,?) }", 2);
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ORG_UNIT_BY_CODE(?,?) }", 2);
    when(callableStatement.getObject(2)).thenReturn(clientResultSet, orgUnitResultSet);
    when(clientResultSet.next()).thenReturn(true, false);
    when(clientResultSet.getString("CLIENT_ACRONYM")).thenReturn(" RCO ");
    when(orgUnitResultSet.next()).thenReturn(true, false);
    when(orgUnitResultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L);
    when(orgUnitResultSet.wasNull()).thenReturn(false);

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var defaultRegion = repository.findDefaultRegionForForestClientNumber("00077881");

    assertThat(defaultRegion).contains("1903");
    verify(callableStatement).setString(1, "00077881");
    verify(callableStatement).setString(1, "RCO");
    verify(callableStatement, org.mockito.Mockito.times(2)).registerOutParameter(2, Types.REF_CURSOR);
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

  @Test
  void findCurrentSchedulesShouldUseLegacyCursorProcedureForReportListDates() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_CURRENT_SCHEDULES(?) }");
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getLong("EXPORT_SCHEDULE_ID")).thenReturn(1001L, 1002L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getDate("ADVERTISING_DATE"))
        .thenReturn(java.sql.Date.valueOf("2026-07-02"), java.sql.Date.valueOf("2026-07-08"));

    LexisReportScheduleRepository repository = new LexisReportScheduleRepository(jdbcTemplate);

    var schedules = repository.findCurrentSchedules();

    assertThat(schedules)
        .extracting("exportScheduleId", "advertisingDate")
        .containsExactly(
            tuple(1001L, LocalDate.of(2026, 7, 2)),
            tuple(1002L, LocalDate.of(2026, 7, 8)));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
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
        .contains("WHERE ES.ADVERTISING_DATE >= TRUNC(SYSDATE)")
        .contains("ORDER BY ES.ADVERTISING_DATE ASC")
        .contains("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    verify(preparedStatement).setInt(1, 100);
    verify(preparedStatement).setInt(2, 50);
  }

  @Test
  @SuppressWarnings("unchecked")
  void findExportSchedulesPageShouldSupportPastScopeAndWhitelistedSorting() throws Exception {
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

    repository.findExportSchedules(0, 50, "past", "teacMeetingDate", "desc");

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sqlCaptor.getValue())
        .contains("WHERE ES.ADVERTISING_DATE < TRUNC(SYSDATE)")
        .contains("ORDER BY ES.TEAC_MEETING_DATE DESC, ES.EXPORT_SCHEDULE_ID ASC")
        .contains("OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
    verify(preparedStatement).setInt(1, 0);
    verify(preparedStatement).setInt(2, 50);
  }

  @Test
  @SuppressWarnings("unchecked")
  void findExportSchedulesPageShouldFallbackForUnknownScopeAndSortValues() throws Exception {
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

    repository.findExportSchedules(0, 50, "past' OR 1=1", "ADVERTISING_DATE; DELETE", "DESC; DELETE");

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(PreparedStatementSetter.class), any(RowMapper.class));
    assertThat(sqlCaptor.getValue())
        .contains("WHERE ES.ADVERTISING_DATE >= TRUNC(SYSDATE)")
        .contains("ORDER BY ES.ADVERTISING_DATE ASC, ES.EXPORT_SCHEDULE_ID ASC")
        .doesNotContain("1=1", "DELETE");
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

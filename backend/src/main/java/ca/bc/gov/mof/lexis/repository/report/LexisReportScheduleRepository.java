package ca.bc.gov.mof.lexis.repository.report;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class LexisReportScheduleRepository extends OracleRepositorySupport {

  private static final String RESERVE_JURISDICTION_CODE = "I";
  private static final String FIND_CURRENT_SCHEDULES =
      LEXIS_CODES_PACKAGE + "FIND_CURRENT_SCHEDULES(?)";
  private static final String FIND_ALL_JURISDICTION_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_JURISDICTION_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_REASON_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_RSN_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_STS_CODES(?)";
  private static final String FIND_ALL_GROWTH_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_GROWTH_TYPE_CODES(?)";
  private static final String FIND_ALL_PERMIT_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PERMIT_STATUS_CODES(?)";
  private static final String FIND_COUNTRY_GROUP =
      LEXIS_CODES_PACKAGE + "FIND_COUNTRY_GROUP(?,?)";
  private static final String FIND_ALL_COUNTRY_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_COUNTRY_CODES(?)";
  private static final String FIND_ALL_PORTS_OF_EXPORT =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PORT_CODES(?)";
  private static final String FIND_FOREST_CLIENT = LEXIS_CODES_PACKAGE + "FIND_FOREST_CLIENT(?,?)";
  private static final String FIND_ORG_UNIT_BY_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ORG_UNIT_BY_CODE(?,?)";
  private static final String FIND_UPCOMING_EXPORT_SCHEDULES =
      """
      SELECT EXPORT_SCHEDULE_ID,
             ADVERTISING_DATE,
             APPLICATION_RECEIPT_DATE,
             OFFER_RECEIPT_DATE,
             OFFER_END_DATE,
             OFFER_WITHDRAWAL_DATE,
             TEAC_MEETING_DATE
        FROM EXPORT_SCHEDULE
       WHERE ADVERTISING_DATE >= TRUNC(SYSDATE)
       ORDER BY ADVERTISING_DATE ASC
      """;
  private static final String FIND_DUPLICATE_ADVERTISING_DATE_COUNT =
      "SELECT COUNT(*) FROM EXPORT_SCHEDULE WHERE TRUNC(ADVERTISING_DATE) = ?";
  private static final String NEXT_EXPORT_SCHEDULE_ID =
      "SELECT EXPORT_SCHEDULE_SEQ.NEXTVAL FROM DUAL";
  private static final String INSERT_EXPORT_SCHEDULE =
      """
      INSERT INTO EXPORT_SCHEDULE (
        EXPORT_SCHEDULE_ID,
        ADVERTISING_DATE,
        APPLICATION_RECEIPT_DATE,
        OFFER_RECEIPT_DATE,
        OFFER_END_DATE,
        OFFER_WITHDRAWAL_DATE,
        TEAC_MEETING_DATE
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      """;

  public LexisReportScheduleRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CurrentScheduleRow> findCurrentSchedules() {
    return queryCursorProcedure(
        FIND_CURRENT_SCHEDULES,
        null,
        1,
        rs ->
            new CurrentScheduleRow(
                getLong(rs, "EXPORT_SCHEDULE_ID"), toLocalDate(rs.getDate("ADVERTISING_DATE"))));
  }

  public List<ExportScheduleRowDto> findUpcomingExportSchedules() {
    return jdbcTemplate.query(FIND_UPCOMING_EXPORT_SCHEDULES, this::mapExportScheduleRow);
  }

  public boolean advertisingDateExists(LocalDate advertisingDate) {
    if (advertisingDate == null) {
      return false;
    }
    Integer count =
        jdbcTemplate.queryForObject(
            FIND_DUPLICATE_ADVERTISING_DATE_COUNT,
            Integer.class,
            java.sql.Date.valueOf(advertisingDate));
    return count != null && count > 0;
  }

  public ExportScheduleRowDto insertExportSchedule(ExportScheduleCreateRequestDto request) {
    Long scheduleId = jdbcTemplate.queryForObject(NEXT_EXPORT_SCHEDULE_ID, Long.class);
    long finalScheduleId = scheduleId == null ? 1L : scheduleId;
    jdbcTemplate.update(
        INSERT_EXPORT_SCHEDULE,
        ps -> bindExportScheduleInsert(ps, finalScheduleId, request));
    return new ExportScheduleRowDto(
        finalScheduleId,
        request.advertisingDate(),
        request.applicationReceiptDate(),
        request.offerReceiptDate(),
        request.offerEndDate(),
        request.offerWithdrawalDate(),
        request.teacMeetingDate());
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptions(true);
  }

  public List<CodeNameDto> loadReportJurisdictionOptions() {
    return withAll(withoutReserveJurisdiction(loadCodeNameOptions(FIND_ALL_JURISDICTION_CODES)));
  }

  public List<CodeNameDto> loadBiweeklyJurisdictionOptions() {
    return withAll(withoutReserveJurisdiction(loadCodeNameOptions(FIND_ALL_JURISDICTION_CODES)));
  }

  public List<CodeNameDto> loadTeacJurisdictionOptions() {
    return withoutReserveJurisdiction(loadCodeNameOptions(FIND_ALL_JURISDICTION_CODES));
  }

  public List<CodeNameDto> loadReportExemptionTypeOptions() {
    return withAll(loadCodeNameOptions(FIND_ALL_EXEMPTION_TYPE_CODES));
  }

  public List<CodeNameDto> loadTenureExemptionTypeOptions() {
    return withTrailingAll(loadCodeNameOptions(FIND_ALL_EXEMPTION_TYPE_CODES));
  }

  public List<CodeNameDto> loadReportExemptionReasonOptions() {
    return withAll(loadCodeNameOptions(FIND_ALL_EXEMPTION_REASON_CODES));
  }

  public List<CodeNameDto> loadReportExemptionStatusOptions() {
    return withAll(loadCodeNameOptions(FIND_ALL_EXEMPTION_STATUS_CODES));
  }

  public List<CodeNameDto> loadReportGrowthTypeOptions() {
    return withAll(loadCodeNameOptions(FIND_ALL_GROWTH_TYPE_CODES));
  }

  public List<CodeNameDto> loadReportPermitStatusOptions() {
    return withAll(loadCodeNameOptions(FIND_ALL_PERMIT_STATUS_CODES));
  }

  public List<CodeNameDto> loadReportDestinationCountryOptions() {
    List<CodeNameDto> options =
        queryCursorProcedure(
                FIND_COUNTRY_GROUP,
                cs -> cs.setInt(1, 1),
                2,
                rs ->
                    new CodeNameDto(getString(rs, "CODE"), getString(rs, "DESCRIPTION")))
            .stream()
            .toList();
    if (options.isEmpty()) {
      options = fallbackReportDestinationCountryOptions();
    }
    return withAll(options);
  }

  public List<CodeNameDto> loadAllReportDestinationCountryOptions() {
    return loadCodeNameOptions(FIND_ALL_COUNTRY_CODES);
  }

  public List<CodeNameDto> loadReportPortOfExportOptions() {
    return withAll(loadCodeNameOptions(FIND_ALL_PORTS_OF_EXPORT));
  }

  public Optional<String> findDefaultRegionForForestClientNumber(String forestClientNumber) {
    String normalizedClientNumber = trim(forestClientNumber);
    if (normalizedClientNumber == null) {
      return Optional.empty();
    }

    return findClientAcronym(normalizedClientNumber).flatMap(this::findOrgUnitNumberByCode);
  }

  private ExportScheduleRowDto mapExportScheduleRow(ResultSet rs, int rowNum) throws SQLException {
    return new ExportScheduleRowDto(
        getLong(rs, "EXPORT_SCHEDULE_ID"),
        toLocalDate(rs.getDate("ADVERTISING_DATE")),
        toLocalDate(rs.getDate("APPLICATION_RECEIPT_DATE")),
        toLocalDate(rs.getDate("OFFER_RECEIPT_DATE")),
        toLocalDate(rs.getDate("OFFER_END_DATE")),
        toLocalDate(rs.getDate("OFFER_WITHDRAWAL_DATE")),
        toLocalDate(rs.getDate("TEAC_MEETING_DATE")));
  }

  private void bindExportScheduleInsert(
      PreparedStatement ps,
      long exportScheduleId,
      ExportScheduleCreateRequestDto request)
      throws SQLException {
    ps.setLong(1, exportScheduleId);
    setDateOrNull(ps, 2, request.advertisingDate());
    setDateOrNull(ps, 3, request.applicationReceiptDate());
    setDateOrNull(ps, 4, request.offerReceiptDate());
    setDateOrNull(ps, 5, request.offerEndDate());
    setDateOrNull(ps, 6, request.offerWithdrawalDate());
    setDateOrNull(ps, 7, request.teacMeetingDate());
  }

  private void setDateOrNull(PreparedStatement ps, int index, LocalDate value) throws SQLException {
    if (value == null) {
      ps.setNull(index, java.sql.Types.DATE);
    } else {
      ps.setDate(index, java.sql.Date.valueOf(value));
    }
  }

  private Optional<String> findClientAcronym(String forestClientNumber) {
    return queryCursorSingle(
        FIND_FOREST_CLIENT,
        cs -> cs.setString(1, forestClientNumber),
        2,
        rs -> trim(getString(rs, "CLIENT_ACRONYM")));
  }

  private Optional<String> findOrgUnitNumberByCode(String orgUnitCode) {
    String normalizedOrgUnitCode = trim(orgUnitCode);
    if (normalizedOrgUnitCode == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_ORG_UNIT_BY_CODE,
        cs -> cs.setString(1, normalizedOrgUnitCode),
        2,
        rs -> {
          Long orgUnitNo = getLong(rs, "ORG_UNIT_NO");
          return orgUnitNo == null ? null : orgUnitNo.toString();
        });
  }

  private List<CodeNameDto> withAll(List<CodeNameDto> options) {
    List<CodeNameDto> reportOptions = new ArrayList<>();
    reportOptions.add(new CodeNameDto("", "All"));
    reportOptions.addAll(options);
    return reportOptions;
  }

  private List<CodeNameDto> withTrailingAll(List<CodeNameDto> options) {
    List<CodeNameDto> reportOptions = new ArrayList<>(options);
    reportOptions.add(new CodeNameDto("", "All"));
    return reportOptions;
  }

  private List<CodeNameDto> withoutReserveJurisdiction(List<CodeNameDto> options) {
    return options.stream()
        .filter(option -> !RESERVE_JURISDICTION_CODE.equalsIgnoreCase(option.code()))
        .toList();
  }

  private List<CodeNameDto> fallbackReportDestinationCountryOptions() {
    return List.of(
        new CodeNameDto("US", "United States"),
        new CodeNameDto("JP", "Japan"),
        new CodeNameDto("CN", "China"),
        new CodeNameDto("NZ", "New Zealand"));
  }

  public record CurrentScheduleRow(Long exportScheduleId, LocalDate advertisingDate) {}
}

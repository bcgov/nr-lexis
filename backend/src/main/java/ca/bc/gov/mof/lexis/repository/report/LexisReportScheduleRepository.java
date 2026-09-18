package ca.bc.gov.mof.lexis.repository.report;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_COUNTRIES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_COUNTRIES_BY_GROUP;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_REASONS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_STATUSES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_TYPES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_GROWTH_TYPES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_JURISDICTIONS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_PERMIT_STATUSES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_PORTS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ORG_UNIT_BY_CODE;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleCreateRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class LexisReportScheduleRepository extends OracleRepositorySupport {

  private static final String RETIRED_INDIAN_RESERVE_JURISDICTION_CODE = "I";
  private static final String FIND_CURRENT_SCHEDULES =
      LEXIS_CODES_PACKAGE + "FIND_CURRENT_SCHEDULES(?)";
  private static final String FIND_NEXT_SCHEDULES =
      LEXIS_CODES_PACKAGE + "FIND_NEXT_SCHEDULES(?)";
  private static final String FIND_FOREST_CLIENT = LEXIS_CODES_PACKAGE + "FIND_FOREST_CLIENT(?,?)";
  private static final String EXPORT_SCHEDULE_SELECT =
      """
      SELECT ES.EXPORT_SCHEDULE_ID,
             ES.ADVERTISING_DATE,
             ES.APPLICATION_RECEIPT_DATE,
             ES.OFFER_RECEIPT_DATE,
             ES.OFFER_END_DATE,
             ES.OFFER_WITHDRAWAL_DATE,
             ES.TEAC_MEETING_DATE,
             (SELECT COUNT(*)
               FROM EXPORT_EXEMPTION_APPLICATION EEA
               WHERE EEA.EXPORT_SCHEDULE_ID = ES.EXPORT_SCHEDULE_ID) AS APPLICATION_COUNT,
             (SELECT COUNT(*)
                FROM EXPORT_EXEMPTION_APPLICATION EEA
               WHERE EEA.EXPORT_SCHEDULE_ID = ES.EXPORT_SCHEDULE_ID
                 AND EEA.APPLICATION_NUMBER > TO_NUMBER(0)
                 AND EEA.EXPORT_JURISDICTION_CODE <> 'F'
                 AND EEA.OIC_INDICATOR = 'N'
                 AND EXISTS (
                   SELECT 1
                     FROM EXPORT_APPLICATION_STATUS_CODE EASC
                    WHERE EASC.EXPORT_APPLICATION_STATUS_CODE = EEA.EXPORT_APPLICATION_STATUS_CODE)
                 AND EXISTS (
                   SELECT 1
                     FROM EXPORT_EXEMPTION_REASON_CODE EERC
                    WHERE EERC.EXPORT_EXEMPTION_REASON_CODE = EEA.EXPORT_EXEMPTION_REASON_CODE)
                 AND EXISTS (
                   SELECT 1
                     FROM EXPORT_APPLICANT_TYPE_CODE EATC
                    WHERE EATC.EXPORT_APPLICANT_TYPE_CODE = EEA.EXPORT_APPLICANT_TYPE_CODE))
               AS PROVINCIAL_APPLICATION_COUNT
        FROM EXPORT_SCHEDULE ES
      """;
  private static final String UPCOMING_EXPORT_SCHEDULE_CONDITION =
      "ES.ADVERTISING_DATE >= "
          + "TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Vancouver' AS DATE))";
  private static final String FIND_UPCOMING_EXPORT_SCHEDULES =
      EXPORT_SCHEDULE_SELECT
          + " WHERE "
          + UPCOMING_EXPORT_SCHEDULE_CONDITION
          + " ORDER BY ES.ADVERTISING_DATE ASC";
  private static final String FIND_UPCOMING_EXPORT_SCHEDULES_PAGE =
      FIND_UPCOMING_EXPORT_SCHEDULES + " OFFSET ? ROWS FETCH NEXT ? ROWS ONLY";
  private static final String COUNT_UPCOMING_EXPORT_SCHEDULES =
      """
      SELECT COUNT(*)
        FROM EXPORT_SCHEDULE ES
       WHERE ES.ADVERTISING_DATE >=
             TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Vancouver' AS DATE))
      """;
  private static final String COUNT_EXPORT_SCHEDULES = "SELECT COUNT(*) FROM EXPORT_SCHEDULE";
  private static final String FIND_EXPORT_SCHEDULE_BY_ID =
      EXPORT_SCHEDULE_SELECT + " WHERE ES.EXPORT_SCHEDULE_ID = ?";
  private static final String FIND_EXPORT_SCHEDULE_BY_ADVERTISING_DATE =
      EXPORT_SCHEDULE_SELECT
          + " WHERE TRUNC(ES.ADVERTISING_DATE) = ? ORDER BY ES.EXPORT_SCHEDULE_ID";
  private static final String COUNT_APPLICATIONS_FOR_EXPORT_SCHEDULE =
      "SELECT COUNT(*) FROM EXPORT_EXEMPTION_APPLICATION WHERE EXPORT_SCHEDULE_ID = ?";
  private static final String INSERT_EXPORT_SCHEDULE =
      """
      BEGIN
        INSERT INTO EXPORT_SCHEDULE (
          EXPORT_SCHEDULE_ID,
          ADVERTISING_DATE,
          APPLICATION_RECEIPT_DATE,
          OFFER_RECEIPT_DATE,
          OFFER_END_DATE,
          OFFER_WITHDRAWAL_DATE,
          TEAC_MEETING_DATE
        ) VALUES (EXPORT_SCHEDULE_SEQ.NEXTVAL, ?, ?, ?, ?, ?, ?)
        RETURNING EXPORT_SCHEDULE_ID INTO ?;
      END;
      """;
  private static final String UPDATE_EXPORT_SCHEDULE =
      """
      UPDATE EXPORT_SCHEDULE
         SET ADVERTISING_DATE = ?,
             APPLICATION_RECEIPT_DATE = ?,
             OFFER_RECEIPT_DATE = ?,
             OFFER_END_DATE = ?,
             OFFER_WITHDRAWAL_DATE = ?,
             TEAC_MEETING_DATE = ?
       WHERE EXPORT_SCHEDULE_ID = ?
      """;
  private static final String DELETE_EXPORT_SCHEDULE =
      "DELETE FROM EXPORT_SCHEDULE WHERE EXPORT_SCHEDULE_ID = ?";

  public LexisReportScheduleRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  /**
   * Loads the authoritative current advertising-period boundary without converting an Oracle
   * failure into an empty schedule list.
   */
  public List<CurrentScheduleRow> findCurrentSchedulesRequired() {
    return queryCursorProcedureRequired(
        FIND_CURRENT_SCHEDULES,
        null,
        1,
        rs ->
            new CurrentScheduleRow(
                getLong(rs, "EXPORT_SCHEDULE_ID"), toLocalDate(rs.getDate("ADVERTISING_DATE"))));
  }

  /** Loads the same upcoming listing-date choices used by legacy application creation. */
  public List<CurrentScheduleRow> findNextSchedulesRequired() {
    return queryCursorProcedureRequired(
        FIND_NEXT_SCHEDULES,
        null,
        1,
        rs ->
            new CurrentScheduleRow(
                getLong(rs, "EXPORT_SCHEDULE_ID"), toLocalDate(rs.getDate("ADVERTISING_DATE"))));
  }

  public List<ExportScheduleRowDto> findUpcomingExportSchedules() {
    return jdbcTemplate.query(FIND_UPCOMING_EXPORT_SCHEDULES, this::mapExportScheduleRow);
  }

  public List<ExportScheduleRowDto> findUpcomingExportSchedules(int page, int size) {
    return queryExportSchedulePage(FIND_UPCOMING_EXPORT_SCHEDULES_PAGE, page, size);
  }

  public List<ExportScheduleRowDto> findExportSchedules(
      int page, int size, String sortField, String sortDirection) {
    return queryExportSchedulePage(
        findExportSchedulesPageSql(sortField, sortDirection), page, size);
  }

  private List<ExportScheduleRowDto> queryExportSchedulePage(String sql, int page, int size) {
    int normalizedPage = Math.max(0, page);
    int normalizedSize = Math.max(1, size);
    long offsetLong = (long) normalizedPage * normalizedSize;
    if (offsetLong > Integer.MAX_VALUE) {
      return List.of();
    }
    int offset = (int) offsetLong;
    return jdbcTemplate.query(
        sql,
        ps -> {
          ps.setInt(1, offset);
          ps.setInt(2, normalizedSize);
        },
        this::mapExportScheduleRow);
  }

  public int countUpcomingExportSchedules() {
    Integer count = jdbcTemplate.queryForObject(COUNT_UPCOMING_EXPORT_SCHEDULES, Integer.class);
    return count == null ? 0 : Math.max(0, count);
  }

  public int countExportSchedules() {
    Integer count = jdbcTemplate.queryForObject(COUNT_EXPORT_SCHEDULES, Integer.class);
    return count == null ? 0 : Math.max(0, count);
  }

  public Optional<ExportScheduleRowDto> findExportScheduleById(long exportScheduleId) {
    return jdbcTemplate
        .query(
            FIND_EXPORT_SCHEDULE_BY_ID,
            ps -> ps.setLong(1, exportScheduleId),
            this::mapExportScheduleRow)
        .stream()
        .findFirst();
  }

  public Optional<ExportScheduleRowDto> findExportScheduleByAdvertisingDate(
      LocalDate advertisingDate) {
    if (advertisingDate == null) {
      return Optional.empty();
    }
    return jdbcTemplate
        .query(
            FIND_EXPORT_SCHEDULE_BY_ADVERTISING_DATE,
            ps -> ps.setDate(1, java.sql.Date.valueOf(advertisingDate)),
            this::mapExportScheduleRow)
        .stream()
        .findFirst();
  }

  public long countApplicationsForExportSchedule(long exportScheduleId) {
    Long count =
        jdbcTemplate.queryForObject(
            COUNT_APPLICATIONS_FOR_EXPORT_SCHEDULE, Long.class, exportScheduleId);
    return count == null ? 0L : count;
  }

  public ExportScheduleRowDto insertExportSchedule(ExportScheduleCreateRequestDto request) {
    Long scheduleId =
        jdbcTemplate.execute((Connection connection) -> insertExportSchedule(connection, request));
    if (scheduleId == null) {
      throw new DataRetrievalFailureException("Export schedule insert did not return an id.");
    }
    return new ExportScheduleRowDto(
        scheduleId,
        request.advertisingDate(),
        request.applicationReceiptDate(),
        request.offerReceiptDate(),
        request.offerEndDate(),
        request.offerWithdrawalDate(),
        request.teacMeetingDate());
  }

  public ExportScheduleRowDto updateExportSchedule(
      long exportScheduleId, ExportScheduleCreateRequestDto request) {
    jdbcTemplate.update(
        UPDATE_EXPORT_SCHEDULE, ps -> bindExportScheduleUpdate(ps, exportScheduleId, request));
    return new ExportScheduleRowDto(
        exportScheduleId,
        request.advertisingDate(),
        request.applicationReceiptDate(),
        request.offerReceiptDate(),
        request.offerEndDate(),
        request.offerWithdrawalDate(),
        request.teacMeetingDate());
  }

  public boolean deleteExportSchedule(long exportScheduleId) {
    return jdbcTemplate.update(DELETE_EXPORT_SCHEDULE, exportScheduleId) > 0;
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptionsRequired(true);
  }

  public List<CodeNameDto> loadReportJurisdictionOptions() {
    return withAll(
        withoutRetiredIndianReserveJurisdiction(
            loadCodeNameOptionsDirectRequired(ACTIVE_JURISDICTIONS)));
  }

  public List<CodeNameDto> loadBiweeklyJurisdictionOptions() {
    return withAll(
        withoutRetiredIndianReserveJurisdiction(
            loadCodeNameOptionsDirectRequired(ACTIVE_JURISDICTIONS)));
  }

  public List<CodeNameDto> loadTeacJurisdictionOptions() {
    return withoutRetiredIndianReserveJurisdiction(
        loadCodeNameOptionsDirectRequired(ACTIVE_JURISDICTIONS));
  }

  public List<CodeNameDto> loadReportExemptionTypeOptions() {
    return withAll(loadCodeNameOptionsDirectRequired(ACTIVE_EXEMPTION_TYPES));
  }

  public List<CodeNameDto> loadTenureExemptionTypeOptions() {
    return withTrailingAll(loadCodeNameOptionsDirectRequired(ACTIVE_EXEMPTION_TYPES));
  }

  public List<CodeNameDto> loadReportExemptionReasonOptions() {
    return withAll(loadCodeNameOptionsDirectRequired(ACTIVE_EXEMPTION_REASONS));
  }

  public List<CodeNameDto> loadReportExemptionStatusOptions() {
    return withAll(loadCodeNameOptionsDirectRequired(ACTIVE_EXEMPTION_STATUSES));
  }

  public List<CodeNameDto> loadReportGrowthTypeOptions() {
    return withAll(
        queryDirectRequired(
            ACTIVE_GROWTH_TYPES,
            rs -> new CodeNameDto(trim(rs.getString(1)), trim(rs.getString(2)))));
  }

  public List<CodeNameDto> loadReportPermitStatusOptions() {
    return withAll(loadCodeNameOptionsDirectRequired(ACTIVE_PERMIT_STATUSES));
  }

  public List<CodeNameDto> loadReportDestinationCountryOptions() {
    List<CodeNameDto> options =
        jdbcTemplate.query(
                ACTIVE_COUNTRIES_BY_GROUP,
                (rs, rowNumber) ->
                    new CodeNameDto(getString(rs, "CODE"), getString(rs, "DESCRIPTION")),
                1)
            .stream()
            .toList();
    return withAll(options);
  }

  public List<CodeNameDto> loadAllReportDestinationCountryOptions() {
    return queryDirectRequired(
        ACTIVE_COUNTRIES,
        rs -> new CodeNameDto(trim(rs.getString(1)), trim(rs.getString(2))));
  }

  public List<CodeNameDto> loadReportPortOfExportOptions() {
    return withAll(
        jdbcTemplate.query(
            ACTIVE_PORTS,
            (rs, rowNum) -> new CodeNameDto(trim(rs.getString(1)), trim(rs.getString(2)))));
  }

  public Optional<String> findDefaultRegionForForestClientNumber(String forestClientNumber) {
    String normalizedClientNumber = trim(forestClientNumber);
    if (normalizedClientNumber == null) {
      return Optional.empty();
    }

    return findClientAcronym(normalizedClientNumber).flatMap(this::findOrgUnitNumberByCode);
  }

  private ExportScheduleRowDto mapExportScheduleRow(ResultSet rs, int rowNum) throws SQLException {
    long applicationCount = applicationCount(rs);
    long provincialApplicationCount = provincialApplicationCount(rs);
    return new ExportScheduleRowDto(
        getLong(rs, "EXPORT_SCHEDULE_ID"),
        toLocalDate(rs.getDate("ADVERTISING_DATE")),
        toLocalDate(rs.getDate("APPLICATION_RECEIPT_DATE")),
        toLocalDate(rs.getDate("OFFER_RECEIPT_DATE")),
        toLocalDate(rs.getDate("OFFER_END_DATE")),
        toLocalDate(rs.getDate("OFFER_WITHDRAWAL_DATE")),
        toLocalDate(rs.getDate("TEAC_MEETING_DATE")),
        applicationCount,
        applicationCount == 0L,
        provincialApplicationCount);
  }

  private String findExportSchedulesPageSql(String sortField, String sortDirection) {
    return EXPORT_SCHEDULE_SELECT
        + " ORDER BY "
        + exportScheduleSortColumn(sortField)
        + " "
        + exportScheduleSortDirection(sortDirection)
        + ", ES.EXPORT_SCHEDULE_ID ASC"
        + " OFFSET ? ROWS FETCH NEXT ? ROWS ONLY";
  }

  private String exportScheduleSortColumn(String sortField) {
    if (sortField == null) {
      return "ES.ADVERTISING_DATE";
    }
    return switch (sortField) {
      case "exportScheduleId" -> "ES.EXPORT_SCHEDULE_ID";
      case "applicationReceiptDate" -> "ES.APPLICATION_RECEIPT_DATE";
      case "offerReceiptDate" -> "ES.OFFER_RECEIPT_DATE";
      case "offerEndDate" -> "ES.OFFER_END_DATE";
      case "offerWithdrawalDate" -> "ES.OFFER_WITHDRAWAL_DATE";
      case "teacMeetingDate" -> "ES.TEAC_MEETING_DATE";
      case "applicationCount" -> "PROVINCIAL_APPLICATION_COUNT";
      case "advertisingDate" -> "ES.ADVERTISING_DATE";
      default -> "ES.ADVERTISING_DATE";
    };
  }

  private String exportScheduleSortDirection(String sortDirection) {
    return "desc".equalsIgnoreCase(sortDirection) ? "DESC" : "ASC";
  }

  private void bindExportScheduleInsert(
      PreparedStatement ps, ExportScheduleCreateRequestDto request)
      throws SQLException {
    setDateOrNull(ps, 1, request.advertisingDate());
    setDateOrNull(ps, 2, request.applicationReceiptDate());
    setDateOrNull(ps, 3, request.offerReceiptDate());
    setDateOrNull(ps, 4, request.offerEndDate());
    setDateOrNull(ps, 5, request.offerWithdrawalDate());
    setDateOrNull(ps, 6, request.teacMeetingDate());
  }

  private Long insertExportSchedule(Connection connection, ExportScheduleCreateRequestDto request)
      throws SQLException {
    try (CallableStatement statement = connection.prepareCall(INSERT_EXPORT_SCHEDULE)) {
      bindExportScheduleInsert(statement, request);
      statement.registerOutParameter(7, Types.NUMERIC);
      statement.executeUpdate();
      long exportScheduleId = statement.getLong(7);
      return statement.wasNull() ? null : exportScheduleId;
    }
  }

  private void bindExportScheduleUpdate(
      PreparedStatement ps,
      long exportScheduleId,
      ExportScheduleCreateRequestDto request)
      throws SQLException {
    setDateOrNull(ps, 1, request.advertisingDate());
    setDateOrNull(ps, 2, request.applicationReceiptDate());
    setDateOrNull(ps, 3, request.offerReceiptDate());
    setDateOrNull(ps, 4, request.offerEndDate());
    setDateOrNull(ps, 5, request.offerWithdrawalDate());
    setDateOrNull(ps, 6, request.teacMeetingDate());
    ps.setLong(7, exportScheduleId);
  }

  private long applicationCount(ResultSet rs) throws SQLException {
    long value = rs.getLong("APPLICATION_COUNT");
    return rs.wasNull() ? 0L : value;
  }

  private long provincialApplicationCount(ResultSet rs) throws SQLException {
    long value = rs.getLong("PROVINCIAL_APPLICATION_COUNT");
    return rs.wasNull() ? 0L : value;
  }

  private void setDateOrNull(PreparedStatement ps, int index, LocalDate value) throws SQLException {
    if (value == null) {
      ps.setNull(index, java.sql.Types.DATE);
    } else {
      ps.setDate(index, java.sql.Date.valueOf(value));
    }
  }

  private Optional<String> findClientAcronym(String forestClientNumber) {
    return queryCursorSingleFailClosed(
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

    List<String> orgUnitNumbers =
        jdbcTemplate.query(
            ORG_UNIT_BY_CODE,
            (rs, rowNumber) -> {
              Long orgUnitNo = getLong(rs, "ORG_UNIT_NO");
              return orgUnitNo == null ? null : orgUnitNo.toString();
            },
            normalizedOrgUnitCode);
    return orgUnitNumbers.isEmpty() ? Optional.empty() : Optional.ofNullable(orgUnitNumbers.get(0));
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

  private List<CodeNameDto> withoutRetiredIndianReserveJurisdiction(List<CodeNameDto> options) {
    return options.stream()
        .filter(
            option ->
                !RETIRED_INDIAN_RESERVE_JURISDICTION_CODE.equalsIgnoreCase(option.code()))
        .toList();
  }

  public record CurrentScheduleRow(Long exportScheduleId, LocalDate advertisingDate) {}
}

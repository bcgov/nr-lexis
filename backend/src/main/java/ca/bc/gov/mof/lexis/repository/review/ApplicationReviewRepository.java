package ca.bc.gov.mof.lexis.repository.review;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.CallableStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
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
public class ApplicationReviewRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_PRODUCT_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PRODUCT_TYPE_CODES(?)";
  private static final String FIND_ALL_APPLICATION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)";

  private static final String FIND_APPLICATIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATIONS_BY_CRITERIA(?,?,?,?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String UPDATE_EXEMPTION_APPLICATION =
      LEXIS_GROUP_14_PACKAGE + "UPDATE_EXEMPTION_APPLICATION(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_EXEMPTION_APP_REMARK =
      LEXIS_GROUP_14_PACKAGE + "INSERT_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";

  public ApplicationReviewRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadProductTypeOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    options.add(new CodeNameDto("", "All"));
    options.addAll(loadCodeNameOptions(FIND_ALL_PRODUCT_TYPE_CODES));
    return options;
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptions(false);
  }

  public List<CodeNameDto> loadReviewStatusOptions() {
    return loadCodeNameOptions(FIND_ALL_APPLICATION_STATUS_CODES).stream()
        .filter(option -> option.code() != null)
        .filter(
            option ->
                "REJ".equalsIgnoreCase(option.code())
                    || "WDN".equalsIgnoreCase(option.code())
                    || "EXP".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<ApplicationReviewSearchResultDto> search(ApplicationReviewSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("APPLICATION_NUMBER", criteria.applicationNumber());
    where.addEquals("EXPORT_PRODUCT_TYPE_CODE", criteria.productTypeCode());
    where.addDateGte("RECEIVED_DATE", criteria.receivedFromDate());
    where.addDateLte("RECEIVED_DATE", criteria.receivedToDate());
    where.addDateGte("ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("ADVERTISING_DATE", criteria.listingToDate());
    where.addRaw(" AND (EXPORT_APPLICATION_STATUS_CODE = 'NEW' OR EXPORT_APPLICATION_STATUS_CODE = 'PND')");
    where.addInEqualsNumberOrNoResults("ORG_UNIT_NO", criteria.regionNumbers());

    String orderBy =
        sanitizedSort(
            criteria.sortField(),
            mapOf(
                "applicationNumber", "APPLICATION_NUMBER",
                "volume", "EXEMPTION_APPLICATION_VOLUME",
                "listingDate", "ADVERTISING_DATE",
                "status", "EXPORT_APPLICATION_STATUS_CODE",
                "region", "ORG_UNIT_CODE"),
            "applicationNumber",
            "DESC");

    SqlWhere sqlWhere = where.build(orderBy);

    return queryDynamicAllPages(
        FIND_APPLICATIONS_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
        rs ->
            new ApplicationReviewSearchResultDto(
                getLong(rs, "APPLICATION_NUMBER"),
                firstNonNullDouble(
                    getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"),
                    getDouble(rs, "APPLICATION_VOLUME")),
                firstNonNull(getString(rs, "END_USE_SORT"), getString(rs, "EXPORT_PRODUCT_TYPE_CODE")),
                getLocalDate(rs, "ADVERTISING_DATE"),
                firstNonNull(getString(rs, "STATUS_DESCRIPTION"), getString(rs, "EXPORT_APPLICATION_STATUS_CODE")),
                firstNonNull(getString(rs, "REGION_CODE"), getString(rs, "REGION")),
                "Y".equalsIgnoreCase(getString(rs, "SHOW_INFO_ICON"))));
  }

  public boolean approve(Long applicationNumber, String updateUserId) {
    return updateApplicationStatus(applicationNumber, "APP", null, updateUserId);
  }

  public boolean updateStatus(
      Long applicationNumber, String statusCode, String remark, String updateUserId) {
    return updateApplicationStatus(applicationNumber, statusCode, remark, updateUserId);
  }

  public boolean sendStatusEmail(
      Long applicationNumber, String statusCode, String clientEmailAddress, String remark) {
    String normalizedStatus = trim(statusCode);
    String normalizedEmail = trim(clientEmailAddress);
    if (applicationNumber == null || applicationNumber < 1 || normalizedStatus == null || normalizedEmail == null) {
      return false;
    }

    if (!"REJ".equalsIgnoreCase(normalizedStatus) && !"WDN".equalsIgnoreCase(normalizedStatus)) {
      return false;
    }

    logger.info(
        "Application status email request staged for app {} to {} (status {}, remark present: {}).",
        applicationNumber,
        normalizedEmail,
        normalizedStatus,
        trim(remark) != null);
    return true;
  }

  private boolean updateApplicationStatus(
      Long applicationNumber, String statusCode, String remark, String updateUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }

    String normalizedStatus = trim(statusCode);
    if (normalizedStatus == null) {
      return false;
    }

    Optional<ApplicationUpdateRecord> application = loadApplicationUpdateRecord(applicationNumber);
    if (application.isEmpty()) {
      return false;
    }

    ApplicationUpdateRecord record = application.get();
    String normalizedUpdateUser = trim(updateUserId);
    if (normalizedUpdateUser == null) {
      normalizedUpdateUser = record.entryUserId();
    }

    final String finalUpdateUser = normalizedUpdateUser;
    boolean updated =
        executeProcedure(
            UPDATE_EXEMPTION_APPLICATION,
            cs -> bindApplicationUpdate(cs, record, normalizedStatus, finalUpdateUser));
    if (!updated) {
      return false;
    }

    String normalizedRemark = trim(remark);
    if (normalizedRemark != null) {
      insertRemark(applicationNumber, normalizedRemark, finalUpdateUser);
    }

    return true;
  }

  private Optional<ApplicationUpdateRecord> loadApplicationUpdateRecord(Long applicationNumber) {
    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ApplicationUpdateRecord(
                getLong(rs, "APPLICATION_NUMBER"),
                getLong(rs, "FED_APPLICATION_NUMBER"),
                getLocalDate(rs, "APPLICATION_DATE"),
                getLong(rs, "TERM_DAYS"),
                getLocalDate(rs, "RECEIVED_DATE"),
                firstNonNullDouble(
                    getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"),
                    getDouble(rs, "APPLICATION_VOLUME")),
                getDouble(rs, "AVERAGE_LOG_VOLUME"),
                getString(rs, "PRODUCT_LOCATION"),
                getString(rs, "ENTRY_USERID"),
                safeTimestamp(rs, "ENTRY_TIMESTAMP"),
                getLong(rs, "EXPORT_SCHEDULE_ID"),
                getString(rs, "AGENT_CLIENT_NUMBER"),
                getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                getString(rs, "EXEMPTION_NUMBER"),
                getString(rs, "EXPORT_EXEMPTION_REASON_CODE"),
                getString(rs, "EXPORT_APPLICANT_TYPE_CODE"),
                getLong(rs, "ORG_UNIT_NO"),
                getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
                getString(rs, "EXPORT_JURISDICTION_CODE"),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
                getString(rs, "AGENT_CONTACT_NAME"),
                getString(rs, "OWNER_CONTACT_NAME"),
                getString(rs, "OIC_INDICATOR")));
  }

  private void bindApplicationUpdate(
      CallableStatement cs,
      ApplicationUpdateRecord record,
      String statusCode,
      String updateUserId)
      throws SQLException {
    int index = 1;

    setLongOrNull(cs, index++, record.applicationNumber());
    setLongOrNull(cs, index++, emptyToNull(record.federalApplicationNumber()));
    setDateOrNull(cs, index++, record.applicationDate());
    setLongOrNull(cs, index++, record.termDays());
    setDateOrNull(cs, index++, record.receivedDate());
    setDoubleOrNull(cs, index++, record.exemptionApplicationVolume());
    setDoubleOrNull(cs, index++, record.averageLogVolume());
    setStringOrNull(cs, index++, record.productLocation());
    setStringOrNull(cs, index++, record.entryUserId());
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    setStringOrNull(cs, index++, updateUserId);
    cs.setTimestamp(index++, new Timestamp(System.currentTimeMillis()));
    setLongOrNull(cs, index++, record.exportScheduleId());
    setStringOrNull(cs, index++, record.agentClientNumber());
    setStringOrNull(cs, index++, record.agentClientLocationCode());
    setStringOrNull(cs, index++, record.ownerClientNumber());
    setStringOrNull(cs, index++, record.ownerClientLocationCode());
    setStringOrNull(cs, index++, record.exemptionNumber());
    setStringOrNull(cs, index++, record.exportExemptionReasonCode());
    setStringOrNull(cs, index++, statusCode);
    setStringOrNull(cs, index++, record.exportApplicantTypeCode());
    setLongOrNull(cs, index++, record.orgUnitNo());
    setStringOrNull(cs, index++, record.exportProductTypeCode());
    setStringOrNull(cs, index++, record.exportJurisdictionCode());
    setStringOrNull(cs, index++, record.exportGrowthTypeCode());
    setStringOrNull(cs, index++, record.agentCompanyContact());
    setStringOrNull(cs, index++, record.ownerCompanyContact());
    setStringOrNull(cs, index, record.oicIndicator());
  }

  private void insertRemark(Long applicationNumber, String remark, String updateUserId) {
    queryCursorProcedure(
        INSERT_EXEMPTION_APP_REMARK,
        cs -> {
          cs.setTimestamp(1, new Timestamp(System.currentTimeMillis()));
          cs.setString(2, remark);
          cs.setString(3, updateUserId);
          cs.setTimestamp(4, new Timestamp(System.currentTimeMillis()));
          cs.setString(5, applicationNumber.toString());
        },
        6,
        rs -> null);
  }

  private Timestamp safeTimestamp(java.sql.ResultSet rs, String columnName) {
    try {
      return rs.getTimestamp(columnName);
    } catch (SQLException ex) {
      return null;
    }
  }

  private String firstNonNull(String first, String second) {
    return first != null ? first : second;
  }

  private Double firstNonNullDouble(Double first, Double second) {
    return first != null ? first : second;
  }

  private Long emptyToNull(Long value) {
    return value == null || value <= 0 ? null : value;
  }

  private void setStringOrNull(CallableStatement cs, int index, String value) throws SQLException {
    if (value == null || value.isBlank()) {
      cs.setNull(index, Types.VARCHAR);
    } else {
      cs.setString(index, value);
    }
  }

  private void setLongOrNull(CallableStatement cs, int index, Long value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.NUMERIC);
    } else {
      cs.setLong(index, value);
    }
  }

  private void setDoubleOrNull(CallableStatement cs, int index, Double value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.DOUBLE);
    } else {
      cs.setDouble(index, value);
    }
  }

  private void setDateOrNull(CallableStatement cs, int index, LocalDate value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.DATE);
    } else {
      cs.setDate(index, java.sql.Date.valueOf(value));
    }
  }

  private void setTimestampOrNull(CallableStatement cs, int index, Timestamp value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.TIMESTAMP);
    } else {
      cs.setTimestamp(index, value);
    }
  }

  private record ApplicationUpdateRecord(
      Long applicationNumber,
      Long federalApplicationNumber,
      LocalDate applicationDate,
      Long termDays,
      LocalDate receivedDate,
      Double exemptionApplicationVolume,
      Double averageLogVolume,
      String productLocation,
      String entryUserId,
      Timestamp entryTimestamp,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String exemptionNumber,
      String exportExemptionReasonCode,
      String exportApplicantTypeCode,
      Long orgUnitNo,
      String exportProductTypeCode,
      String exportJurisdictionCode,
      String exportGrowthTypeCode,
      String agentCompanyContact,
      String ownerCompanyContact,
      String oicIndicator) {}
}

package ca.bc.gov.mof.lexis.repository.review;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.positiveOrNull;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Slice;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("oracle")
public class ApplicationReviewRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_PRODUCT_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PRODUCT_TYPE_CODES(?)";
  private static final String FIND_ALL_APPLICATION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)";

  private static final String FIND_APPLICATIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATIONS_BY_CRITERIA(?,?,?,?,?)";
  private static final String COUNT_APPLICATIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "COUNT_APPLICATIONS_BY_CRITERIA(?,?,?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_END_USE_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_APP(?,?)";
  private static final String FIND_CANDIDATE_EXCOL_VALUES =
      LEXIS_CODES_PACKAGE + "FIND_CANDIDATE_EXCOL_VALUES(?,?,?,?,?)";
  private static final String FIND_REMARKS_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_REMARKS_BY_APP(?,?)";
  private static final String UPDATE_EXEMPTION_APPLICATION =
      LEXIS_GROUP_14_PACKAGE + "UPDATE_EXEMPTION_APPLICATION(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_EXEMPTION_APP_REMARK =
      LEXIS_GROUP_14_PACKAGE + "INSERT_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";
  private static final String PRODUCT_TYPE_UNMANUFACTURED = "T";

  public ApplicationReviewRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadProductTypeOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    options.add(new CodeNameDto("", "All"));
    options.addAll(loadCodeNameOptionsRequired(FIND_ALL_PRODUCT_TYPE_CODES));
    return options;
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptionsRequired(true);
  }

  public List<CodeNameDto> loadReviewStatusOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_APPLICATION_STATUS_CODES).stream()
        .filter(option -> option.code() != null)
        .filter(
            option ->
                "REJ".equalsIgnoreCase(option.code())
                    || "WDN".equalsIgnoreCase(option.code())
                    || "EXP".equalsIgnoreCase(option.code()))
        .toList();
  }

  public Page<ApplicationReviewSearchResultDto> search(ApplicationReviewSearchCriteria criteria) {
    return search(criteria, null);
  }

  public Page<ApplicationReviewSearchResultDto> search(
      ApplicationReviewSearchCriteria criteria, Integer knownTotal) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    int totalElements =
        knownTotal == null
            ? queryLegacyDynamicCountProcedure(
                COUNT_APPLICATIONS_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues())
            : Math.max(0, knownTotal);
    Page<ReviewSearchRow> rows =
        queryLegacyDynamicPage(
            FIND_APPLICATIONS_BY_CRITERIA,
            sqlWhere.sql(),
            sqlWhere.bindValues(),
            criteria.page(),
            criteria.size(),
            totalElements,
            this::toReviewSearchRow);
    return rows.map(this::toSearchResult);
  }

  public int count(ApplicationReviewSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    return queryLegacyDynamicCountProcedure(COUNT_APPLICATIONS_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
  }

  public Slice<ApplicationReviewSearchResultDto> slice(ApplicationReviewSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    Slice<ReviewSearchRow> rows =
        queryLegacyDynamicSlice(
            FIND_APPLICATIONS_BY_CRITERIA,
            sqlWhere.sql(),
            sqlWhere.bindValues(),
            criteria.page(),
            criteria.size(),
            this::toReviewSearchRow);
    return rows.map(this::toSearchResult);
  }

  private SqlWhere buildSearchWhere(ApplicationReviewSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("v.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addEquals("v.EXPORT_PRODUCT_TYPE_CODE", criteria.productTypeCode());
    where.addDateGte("v.RECEIVED_DATE", criteria.receivedFromDate());
    where.addDateLte("v.RECEIVED_DATE", criteria.receivedToDate());
    where.addDateGte("v.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("v.ADVERTISING_DATE", criteria.listingToDate());
    where.addRaw(" AND (v.EXPORT_APPLICATION_STATUS_CODE = 'NEW' OR v.EXPORT_APPLICATION_STATUS_CODE = 'PND')");
    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      where.addInEqualsNumberOrNoResults("v.ORG_UNIT_NO", criteria.regionNumbers());
    }

    String orderBy =
        sanitizedSort(
            criteria.sortField(),
            mapOf(
                "applicationNumber", "v.APPLICATION_NUMBER",
                "volume", "v.EXEMPTION_APPLICATION_VOLUME",
                "listingDate", "v.ADVERTISING_DATE",
                "status", "v.EXPORT_APPLICATION_STATUS_CODE",
                "regionCode", "v.ORG_UNIT_CODE",
                "region", "v.ORG_UNIT_CODE"),
            "applicationNumber",
            "DESC");

    return where.build(orderBy);
  }

  @Transactional
  public boolean approve(Long applicationNumber, String updateUserId) {
    return updateApplicationStatus(applicationNumber, "APP", null, updateUserId).updated();
  }

  @Transactional
  public boolean updateStatus(
      Long applicationNumber, String statusCode, String remark, String updateUserId) {
    return updateStatusWithRemark(applicationNumber, statusCode, remark, updateUserId).updated();
  }

  @Transactional
  public ApplicationStatusUpdateRow updateStatusWithRemark(
      Long applicationNumber, String statusCode, String remark, String updateUserId) {
    return updateApplicationStatus(applicationNumber, statusCode, remark, updateUserId);
  }

  /**
   * Reloads the application from the required Oracle cursor immediately before applying a guarded
   * status transition. Callers must state the complete set of allowed authoritative source
   * statuses; an absent, unknown, or changed source status is denied without writing either the
   * application or its remark.
   */
  @Transactional
  public ApplicationStatusTransitionRow updateStatusWithRemarkFromAllowedSources(
      Long applicationNumber,
      String statusCode,
      String remark,
      String updateUserId,
      Collection<String> allowedSourceStatuses) {
    if (applicationNumber == null || applicationNumber < 1) {
      return ApplicationStatusTransitionRow.notFound();
    }

    String normalizedStatus = normalizedStatus(statusCode);
    List<String> normalizedAllowedSources =
        allowedSourceStatuses == null
            ? List.of()
            : allowedSourceStatuses.stream()
                .map(this::normalizedStatus)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
    if (normalizedStatus == null || normalizedAllowedSources.isEmpty()) {
      return ApplicationStatusTransitionRow.notAllowed(null);
    }

    Optional<ApplicationUpdateRecord> application = loadApplicationUpdateRecord(applicationNumber);
    if (application.isEmpty()) {
      return ApplicationStatusTransitionRow.notFound();
    }

    ApplicationUpdateRecord record = application.get();
    String currentStatus = normalizedStatus(record.exportApplicationStatusCode());
    if (currentStatus == null || !normalizedAllowedSources.contains(currentStatus)) {
      return ApplicationStatusTransitionRow.notAllowed(currentStatus);
    }

    ApplicationStatusUpdateRow update =
        updateApplicationStatus(record, normalizedStatus, remark, updateUserId);
    return new ApplicationStatusTransitionRow(
        update.updated(), true, true, currentStatus, update.remark());
  }

  @Transactional(readOnly = true)
  public Optional<String> findAuthoritativeJurisdictionCode(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return loadApplicationUpdateRecord(applicationNumber)
        .map(ApplicationUpdateRecord::exportJurisdictionCode)
        .map(String::trim)
        .filter(value -> !value.isEmpty());
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
        "event=lexis_application_email operation=stage outcome=accepted applicationRef={} status={} remarkPresent={}",
        fingerprint(applicationNumber.toString()),
        controlSafe(normalizedStatus),
        trim(remark) != null);
    return true;
  }

  /**
   * Reloads the application through the required Oracle cursor and selects the client reference
   * belonging to the recorded applicant type. Unknown applicant types and incomplete references
   * fail closed.
   */
  public Optional<ApplicantClientReference> findAuthoritativeApplicantClient(
      Long applicationNumber) {
    return findAuthoritativeApplicantStatusContext(applicationNumber)
        .map(
            context ->
                new ApplicantClientReference(
                    context.clientNumber(), context.locationCode()));
  }

  /** Returns the authoritative workflow status and applicant client from one required read. */
  public Optional<AuthoritativeApplicantStatusContext> findAuthoritativeApplicantStatusContext(
      Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return loadApplicationUpdateRecord(applicationNumber)
        .flatMap(
            record -> {
              String currentStatus = normalizedStatus(record.exportApplicationStatusCode());
              if (currentStatus == null) {
                return Optional.empty();
              }
              String applicantTypeCode = trim(record.exportApplicantTypeCode());
              Optional<ApplicantClientReference> reference =
                  "A".equalsIgnoreCase(applicantTypeCode)
                      ? completeClientReference(
                          record.agentClientNumber(), record.agentClientLocationCode())
                      : "O".equalsIgnoreCase(applicantTypeCode)
                          ? completeClientReference(
                              record.ownerClientNumber(), record.ownerClientLocationCode())
                          : Optional.empty();
              return reference.map(
                  value ->
                      new AuthoritativeApplicantStatusContext(
                          currentStatus,
                          applicantTypeCode,
                          value.clientNumber(),
                          value.locationCode(),
                          record.orgUnitNo()));
            });
  }

  /**
   * Loads the most recently allocated persisted remark through the existing authoritative Oracle
   * package. {@code INSERT_EXEMPTION_APP_REMARK} assigns
   * {@code EXEMPTION_APP_REMARKS_SEQ.NEXTVAL}, so the greatest positive remark number is the latest
   * inserted row without relying on the package cursor's unspecified order.
   */
  @Transactional(readOnly = true)
  public Optional<ReviewRemarkRow> findLatestAuthoritativeRemark(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return queryCursorProcedureRequired(
            FIND_REMARKS_BY_APPLICATION,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            this::mapReviewRemarkRow)
        .stream()
        .filter(java.util.Objects::nonNull)
        .filter(row -> row.remarkId() > 0)
        .filter(row -> java.util.Objects.equals(row.applicationNumber(), applicationNumber))
        .max((left, right) -> Long.compare(left.remarkId(), right.remarkId()));
  }

  private Optional<ApplicantClientReference> completeClientReference(
      String clientNumber, String locationCode) {
    String normalizedClientNumber = trim(clientNumber);
    String normalizedLocationCode = trim(locationCode);
    if (normalizedClientNumber == null || normalizedLocationCode == null) {
      return Optional.empty();
    }
    return Optional.of(
        new ApplicantClientReference(normalizedClientNumber, normalizedLocationCode));
  }

  private ApplicationStatusUpdateRow updateApplicationStatus(
      Long applicationNumber, String statusCode, String remark, String updateUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return ApplicationStatusUpdateRow.notUpdated();
    }

    String normalizedStatus = trim(statusCode);
    if (normalizedStatus == null) {
      return ApplicationStatusUpdateRow.notUpdated();
    }

    Optional<ApplicationUpdateRecord> application = loadApplicationUpdateRecord(applicationNumber);
    if (application.isEmpty()) {
      return ApplicationStatusUpdateRow.notUpdated();
    }

    return updateApplicationStatus(application.get(), normalizedStatus, remark, updateUserId);
  }

  private ApplicationStatusUpdateRow updateApplicationStatus(
      ApplicationUpdateRecord record, String statusCode, String remark, String updateUserId) {
    String normalizedStatus = normalizedStatus(statusCode);
    if (normalizedStatus == null) {
      return ApplicationStatusUpdateRow.notUpdated();
    }

    String normalizedUpdateUser = trim(updateUserId);
    if (normalizedUpdateUser == null) {
      normalizedUpdateUser = record.entryUserId();
    }

    final String finalUpdateUser = normalizedUpdateUser;
    executeProcedureRequired(
        UPDATE_EXEMPTION_APPLICATION,
        cs -> bindApplicationUpdate(cs, record, normalizedStatus, finalUpdateUser));

    String normalizedRemark = trim(remark);
    Optional<ReviewRemarkRow> insertedRemark = Optional.empty();
    if (normalizedRemark != null) {
      insertedRemark =
          insertRemark(record.applicationNumber(), normalizedRemark, finalUpdateUser);
      if (insertedRemark
          .filter(
              row ->
                  matchesInsertedRemark(
                      row,
                      record.applicationNumber(),
                      normalizedRemark,
                      finalUpdateUser))
          .isEmpty()) {
        throw new DataAccessResourceFailureException(
            "Oracle application review remark insert returned no row");
      }
    }

    return new ApplicationStatusUpdateRow(true, insertedRemark.orElse(null));
  }

  private ReviewSearchRow toReviewSearchRow(ResultSet rs) {
    return new ReviewSearchRow(
        getLong(rs, "APPLICATION_NUMBER"),
        firstNonNull(
            getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"),
            getDouble(rs, "APPLICATION_VOLUME")),
        getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
        getLong(rs, "ORG_UNIT_NO"),
        getLocalDate(rs, "ADVERTISING_DATE"),
        firstNonNull(getString(rs, "STATUS_DESCRIPTION"), getString(rs, "EXPORT_APPLICATION_STATUS_CODE")),
        firstNonNull(getString(rs, "REGION_CODE"), getString(rs, "REGION")),
        "Y".equalsIgnoreCase(getString(rs, "SHOW_INFO_ICON")));
  }

  private ApplicationReviewSearchResultDto toSearchResult(ReviewSearchRow row) {
    return new ApplicationReviewSearchResultDto(
        row.applicationNumber(),
        row.volume(),
        legacySpeciesEndUseSort(row.applicationNumber(), row.productTypeCode(), row.orgUnitNo()),
        row.listingDate(),
        row.status(),
        row.region(),
        row.showInfoIcon());
  }

  private String legacySpeciesEndUseSort(
      Long applicationNumber, String productTypeCode, Long orgUnitNo) {
    if (applicationNumber == null || applicationNumber < 1 || orgUnitNo == null || orgUnitNo < 1) {
      return null;
    }

    List<EndUseSortRow> endUses = findEndUsesByApplicationNumber(applicationNumber);
    if (endUses.isEmpty()) {
      return null;
    }

    EndUseSortRow firstEndUse = endUses.get(0);
    List<String> candidates =
        findCandidateExcolCodes(
            endUses.size(), firstEndUse.speciesCode(), firstEndUse.endUseCode(), orgUnitNo);
    if (candidates.size() == 1) {
      return candidates.get(0);
    }

    for (String candidate : candidates) {
      if (matchesLegacyExcolCandidate(candidate, endUses, firstEndUse, productTypeCode)) {
        return candidate;
      }
    }
    return null;
  }

  private List<EndUseSortRow> findEndUsesByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_END_USE_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> new EndUseSortRow(getString(rs, "EXPORT_SPECIES_CODE"), getString(rs, "EXPORT_END_USE_CODE")));
  }

  private List<String> findCandidateExcolCodes(
      int speciesCount, String speciesCode, String endUseCode, Long orgUnitNo) {
    String pattern = excolPattern(speciesCount);
    if (pattern == null
        || speciesCode == null
        || endUseCode == null
        || orgUnitNo == null
        || orgUnitNo < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_CANDIDATE_EXCOL_VALUES,
        cs -> {
          cs.setString(1, pattern);
          cs.setString(2, speciesCode);
          cs.setString(3, endUseCode);
          cs.setLong(4, orgUnitNo);
        },
        5,
        rs -> getString(rs, "EXCOL_TRANSLATION_VALUE"));
  }

  private boolean matchesLegacyExcolCandidate(
      String candidate,
      List<EndUseSortRow> endUses,
      EndUseSortRow firstEndUse,
      String productTypeCode) {
    if (candidate == null || firstEndUse.endUseCode() == null) {
      return false;
    }
    for (EndUseSortRow endUse : endUses) {
      if (endUse.speciesCode() == null || !candidate.contains(endUse.speciesCode())) {
        return false;
      }
    }
    return PRODUCT_TYPE_UNMANUFACTURED.equalsIgnoreCase(productTypeCode)
        || candidate.contains(firstEndUse.endUseCode());
  }

  private String excolPattern(int speciesCount) {
    if (speciesCount < 1) {
      return null;
    }
    StringBuilder pattern = new StringBuilder();
    for (int i = 0; i < speciesCount; i++) {
      pattern.append("__/");
    }
    return pattern.append("__").toString();
  }

  private Optional<ApplicationUpdateRecord> loadApplicationUpdateRecord(Long applicationNumber) {
    return queryCursorSingleRequired(
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
                getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"),
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
                getString(rs, "OIC_INDICATOR"),
                getString(rs, "EXPORT_APPLICATION_STATUS_CODE")));
  }

  private String normalizedStatus(String value) {
    String normalized = trim(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private void bindApplicationUpdate(
      CallableStatement cs,
      ApplicationUpdateRecord record,
      String statusCode,
      String updateUserId)
      throws SQLException {
    int index = 1;

    setLongOrNull(cs, index++, record.applicationNumber());
    setLongOrNull(cs, index++, positiveOrNull(record.federalApplicationNumber()));
    setDateOrNull(cs, index++, record.applicationDate());
    setLongOrNull(cs, index++, record.termDays());
    setDateOrNull(cs, index++, record.receivedDate());
    setDoubleOrNull(cs, index++, record.exemptionApplicationVolume());
    setDoubleOrNull(cs, index++, record.averageLogVolume());
    setStringOrNull(cs, index++, record.productLocation());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    cs.setString(index++, auditUserOrDefault(updateUserId));
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

  private Optional<ReviewRemarkRow> insertRemark(Long applicationNumber, String remark, String updateUserId) {
    return queryCursorSingleRequired(
        INSERT_EXEMPTION_APP_REMARK,
        cs -> {
          cs.setTimestamp(1, new Timestamp(System.currentTimeMillis()));
          cs.setString(2, remark);
          cs.setString(3, auditUserOrDefault(updateUserId));
          cs.setTimestamp(4, new Timestamp(System.currentTimeMillis()));
          cs.setString(5, applicationNumber.toString());
        },
        6,
        this::mapReviewRemarkRow);
  }

  private ReviewRemarkRow mapReviewRemarkRow(ResultSet rs) {
    Long remarkId = getLong(rs, "EXPORT_EXMPTN_APPL_REMARK_NMBR");
    String remark = getString(rs, "REMARK");
    String user = getString(rs, "ENTRY_USERID");
    Timestamp entryTimestamp = safeTimestamp(rs, "ENTRY_TIMESTAMP");
    java.time.Instant date = entryTimestamp == null ? null : entryTimestamp.toInstant();
    return new ReviewRemarkRow(
        remarkId == null ? 0L : remarkId,
        getLong(rs, "APPLICATION_NUMBER"),
        remark == null ? "" : remark,
        user,
        date);
  }

  private boolean matchesInsertedRemark(
      ReviewRemarkRow row,
      Long applicationNumber,
      String remark,
      String updateUserId) {
    return row != null
        && row.remarkId() > 0
        && java.util.Objects.equals(row.applicationNumber(), applicationNumber)
        && java.util.Objects.equals(row.remark(), remark)
        && java.util.Objects.equals(trim(row.user()), trim(auditUserOrDefault(updateUserId)));
  }

  private Timestamp safeTimestamp(java.sql.ResultSet rs, String columnName) {
    try {
      return rs.getTimestamp(columnName);
    } catch (SQLException ex) {
      return null;
    }
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

  private record ReviewSearchRow(
      Long applicationNumber,
      Double volume,
      String productTypeCode,
      Long orgUnitNo,
      LocalDate listingDate,
      String status,
      String region,
      boolean showInfoIcon) {}

  private record EndUseSortRow(String speciesCode, String endUseCode) {}

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
      String oicIndicator,
      String exportApplicationStatusCode) {}

  public record ApplicationStatusUpdateRow(boolean updated, ReviewRemarkRow remark) {
    public static ApplicationStatusUpdateRow notUpdated() {
      return new ApplicationStatusUpdateRow(false, null);
    }
  }

  public record ReviewRemarkRow(
      long remarkId,
      Long applicationNumber,
      String remark,
      String user,
      java.time.Instant date) {
    public ReviewRemarkRow(
        long remarkId, String remark, String user, java.time.Instant date) {
      this(remarkId, null, remark, user, date);
    }
  }

  public record ApplicantClientReference(String clientNumber, String locationCode) {}

  public record AuthoritativeApplicantStatusContext(
      String statusCode,
      String applicantTypeCode,
      String clientNumber,
      String locationCode,
      Long orgUnitNumber) {

    public AuthoritativeApplicantStatusContext(
        String statusCode, String clientNumber, String locationCode) {
      this(statusCode, "O", clientNumber, locationCode, null);
    }

    public AuthoritativeApplicantStatusContext(
        String statusCode, String applicantTypeCode, String clientNumber, String locationCode) {
      this(statusCode, applicantTypeCode, clientNumber, locationCode, null);
    }
  }

  public record ApplicationStatusTransitionRow(
      boolean updated,
      boolean applicationFound,
      boolean transitionAllowed,
      String currentStatus,
      ReviewRemarkRow remark) {
    public static ApplicationStatusTransitionRow notFound() {
      return new ApplicationStatusTransitionRow(false, false, false, null, null);
    }

    public static ApplicationStatusTransitionRow notAllowed(String currentStatus) {
      return new ApplicationStatusTransitionRow(false, true, false, currentStatus, null);
    }
  }
}

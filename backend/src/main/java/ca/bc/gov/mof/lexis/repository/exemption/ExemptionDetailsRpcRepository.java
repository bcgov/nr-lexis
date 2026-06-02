package ca.bc.gov.mof.lexis.repository.exemption;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.io.InputStream;
import java.sql.CallableStatement;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ExemptionDetailsRpcRepository extends OracleRepositorySupport {

  private static final String FIND_APPLICATIONS_BY_EXEMPTION =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_EXEMPTION(?,?)";
  private static final String FIND_PERMITS_BY_EXEMPTION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_EXMP(?,?)";
  private static final String FIND_EXEMPTION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTION_BY_NUMBER(?,?)";
  private static final String FIND_EXEMPTION_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPT_FILE_DETAILS(?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_PURCHASE_OFFERS_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PURCHASE_OFFERS_BY_APP(?,?)";
  private static final String FIND_APPLICATION_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPL_FILE_DETAILS(?,?)";
  private static final String FIND_FILE_ATTACHMENT = LEXIS_GROUP_5_PACKAGE + "FIND_FILE_ATTACHMENT(?,?)";
  private static final String FIND_ATTACHMENT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ATTACH_TYPE_CODE(?,?)";
  private static final String DELETE_EXEMPTION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_EXEMPT_FILE_ATTACHMENT(?)";
  private static final String INSERT_EXEMPTION =
      LEXIS_GROUP_4_PACKAGE + "INSERT_EXEMPTION(?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_EXEMPTION_ORG_UNIT =
      LEXIS_GROUP_4_PACKAGE + "INSERT_EXMPTN_ORG_UNIT(?,?)";
  private static final String UPDATE_EXEMPTION_APPLICATION =
      LEXIS_GROUP_14_PACKAGE + "UPDATE_EXEMPTION_APPLICATION(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

  public ExemptionDetailsRpcRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<ApplicationSummaryRow> findApplicationSummariesByExemptionNumber(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_APPLICATIONS_BY_EXEMPTION,
        cs -> cs.setString(1, normalized),
        2,
        this::mapApplicationSummaryRow);
  }

  public List<PermitSummaryRow> findPermitsByExemptionNumber(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_PERMITS_BY_EXEMPTION,
        cs -> cs.setString(1, normalized),
        2,
        this::mapPermitSummaryRow);
  }

  public Optional<String> findExemptionTypeCodeByExemptionNumber(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
            FIND_EXEMPTION_BY_NUMBER,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(getString(rs, "EXPORT_EXEMPTION_TYPE_CODE")))
        .filter(value -> value != null && !value.isBlank());
  }

  public boolean existsByExemptionNumber(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return false;
    }
    return queryCursorSingle(
            FIND_EXEMPTION_BY_NUMBER,
            cs -> cs.setString(1, normalized),
            2,
            rs -> getString(rs, "EXEMPTION_NUMBER"))
        .isPresent();
  }

  public Optional<ApplicationLinkRecord> findApplicationLinkRecord(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapApplicationLinkRecord);
  }

  public boolean hasActiveValidOffers(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    return queryCursorProcedure(
            FIND_PURCHASE_OFFERS_BY_APPLICATION,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs ->
                "Y".equalsIgnoreCase(getString(rs, "VALID_OFFER_INDICATOR"))
                    && getLocalDate(rs, "OFFER_WITHDRAWAL_DATE") == null)
        .stream()
        .anyMatch(Boolean.TRUE::equals);
  }

  public boolean updateApplicationExemption(ApplicationLinkUpdateRecord record) {
    if (record == null || record.application() == null) {
      return false;
    }
    return executeProcedure(
        UPDATE_EXEMPTION_APPLICATION,
        cs -> bindApplicationLinkUpdate(cs, record));
  }

  public List<DocumentRow> findExemptionDocumentDetailsByExemptionNumber(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_EXEMPTION_FILE_DETAILS,
        cs -> cs.setString(1, normalized),
        2,
        this::mapDocumentRow);
  }

  public List<DocumentRow> findApplicationDocumentDetailsByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_APPLICATION_FILE_DETAILS,
        cs -> cs.setLong(1, applicationNumber),
        2,
        this::mapDocumentRow);
  }

  public Optional<String> findAttachmentTypeDescription(String attachmentTypeCode) {
    String normalized = trim(attachmentTypeCode);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
            FIND_ATTACHMENT_TYPE_CODE,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(getString(rs, "DESCRIPTION")))
        .filter(value -> value != null && !value.isBlank());
  }

  public Optional<byte[]> findFileAttachmentBytes(Long fileId) {
    if (fileId == null || fileId < 1) {
      return Optional.empty();
    }

    String call = "{ call " + FIND_FILE_ATTACHMENT + " }";
    try {
      return jdbcTemplate.execute(
          call,
          (CallableStatementCallback<Optional<byte[]>>)
              cs -> {
                cs.setLong(1, fileId);
                cs.registerOutParameter(2, Types.REF_CURSOR);
                cs.execute();

                try (ResultSet rs = (ResultSet) cs.getObject(2)) {
                  if (rs == null || !rs.next()) {
                    return Optional.empty();
                  }
                  InputStream input = rs.getBinaryStream(1);
                  if (input == null) {
                    return Optional.empty();
                  }
                  try {
                    try {
                      return Optional.of(input.readAllBytes());
                    } catch (java.io.IOException ex) {
                      logger.warn(
                          "Oracle file attachment read failed [{}]: {}",
                          FIND_FILE_ATTACHMENT,
                          ex.getMessage());
                      return Optional.empty();
                    }
                  } finally {
                    try {
                      input.close();
                    } catch (java.io.IOException ignored) {
                      // Ignore close exceptions for read-only attachment lookups.
                    }
                  }
                }
              });
    } catch (DataAccessException ex) {
      logger.warn("Oracle file attachment lookup failed [{}]: {}", FIND_FILE_ATTACHMENT, ex.getMessage());
      return Optional.empty();
    }
  }

  public boolean deleteExemptionFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    return executeProcedure(DELETE_EXEMPTION_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
  }

  public Optional<ExemptionInsertRow> insertExemption(ExemptionInsertRecord record) {
    if (record == null || trim(record.exemptionNumber()) == null) {
      return Optional.empty();
    }

    Optional<ExemptionInsertRow> inserted =
        queryCursorSingle(
            INSERT_EXEMPTION,
            cs -> bindExemptionInsert(cs, record),
            12,
            this::mapExemptionInsertRow);

    if (inserted.isPresent() && record.regionNumbers() != null) {
      record.regionNumbers().stream()
          .filter(region -> region != null && region > 0)
          .distinct()
          .forEach(region -> insertExemptionOrgUnit(inserted.get().exemptionNumber(), region));
    }

    return inserted;
  }

  private void bindExemptionInsert(CallableStatement cs, ExemptionInsertRecord record)
      throws SQLException {
    int index = 1;
    setStringOrNull(cs, index++, record.exemptionNumber());
    setDoubleOrNull(cs, index++, record.approvedVolume());
    setDateOrNull(cs, index++, record.approvalDate());
    setDateOrNull(cs, index++, record.expiryDate());
    setStringOrNull(cs, index++, record.otherConditions() == null ? "" : record.otherConditions());
    setStringOrNull(cs, index++, record.exemptionTypeCode());
    setStringOrNull(cs, index++, record.exemptionStatusCode());
    setStringOrNull(cs, index++, record.entryUserId());
    cs.setTimestamp(index++, Timestamp.from(Instant.now()));
    cs.setNull(index++, Types.VARCHAR);
    cs.setNull(index, Types.TIMESTAMP);
  }

  private void insertExemptionOrgUnit(String exemptionNumber, Long regionNumber) {
    executeProcedure(
        INSERT_EXEMPTION_ORG_UNIT,
        cs -> {
          cs.setString(1, exemptionNumber);
          cs.setLong(2, regionNumber);
        });
  }

  private ApplicationSummaryRow mapApplicationSummaryRow(ResultSet rs) {
    return new ApplicationSummaryRow(
        defaultLong(getLong(rs, "APPLICATION_NUMBER"), 0L),
        defaultDouble(getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"), 0.0d),
        defaultDouble(
            Optional.ofNullable(getDouble(rs, "TOTAL_SCALE_VOLUME"))
                .orElse(getDouble(rs, "SCALE_VOLUME")),
            0.0d),
        valueOrEmpty(getString(rs, "OWNER_CLIENT_NUMBER")),
        valueOrEmpty(getString(rs, "EXPORT_JURISDICTION_CODE")),
        valueOrEmpty(getString(rs, "EXPORT_PRODUCT_TYPE_CODE")));
  }

  private PermitSummaryRow mapPermitSummaryRow(ResultSet rs) {
    Long permitNumber =
        Optional.ofNullable(getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"))
            .orElse(getLong(rs, "EXPORT_PERMIT_NUMBER"));
    return new PermitSummaryRow(
        defaultLong(permitNumber, 0L),
        defaultDouble(getDouble(rs, "PERMIT_VOLUME"), 0.0d),
        defaultDouble(getDouble(rs, "OIC_REQUEST_VOLUME"), 0.0d),
        valueOrEmpty(getString(rs, "STATUS_DESCRIPTION")),
        valueOrEmpty(getString(rs, "EXPORT_PERMIT_STATUS_CODE")),
        getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
        valueOrEmpty(getString(rs, "CLIENT_NUMBER")),
        valueOrEmpty(getString(rs, "AGENT_NUMBER")));
  }

  private DocumentRow mapDocumentRow(ResultSet rs) {
    Long attachmentId = getLong(rs, "EXPORT_ATTACHMENT_ID");
    return new DocumentRow(
        defaultLong(attachmentId, 0L),
        safeFileName(valueOrEmpty(getString(rs, "FILE_NAME"))),
        valueOrEmpty(getString(rs, "DESCRIPTION")),
        valueOrEmpty(getString(rs, "EXPORT_ATTACHMENT_TYPE_CODE")));
  }

  private ExemptionInsertRow mapExemptionInsertRow(ResultSet rs) {
    return new ExemptionInsertRow(valueOrEmpty(getString(rs, "EXEMPTION_NUMBER")));
  }

  private ApplicationLinkRecord mapApplicationLinkRecord(ResultSet rs) {
    return new ApplicationLinkRecord(
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
        getTimestamp(rs, "ENTRY_TIMESTAMP"),
        getLong(rs, "EXPORT_SCHEDULE_ID"),
        getString(rs, "AGENT_CLIENT_NUMBER"),
        getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
        getString(rs, "OWNER_CLIENT_NUMBER"),
        getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
        getString(rs, "EXEMPTION_NUMBER"),
        getString(rs, "EXPORT_EXEMPTION_REASON_CODE"),
        getString(rs, "EXPORT_APPLICATION_STATUS_CODE"),
        getString(rs, "EXPORT_APPLICANT_TYPE_CODE"),
        getLong(rs, "ORG_UNIT_NO"),
        getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
        getString(rs, "EXPORT_JURISDICTION_CODE"),
        getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
        getString(rs, "AGENT_CONTACT_NAME"),
        getString(rs, "OWNER_CONTACT_NAME"),
        getString(rs, "OIC_INDICATOR"),
        getLocalDate(rs, "ADVERTISING_DATE"));
  }

  private void bindApplicationLinkUpdate(CallableStatement cs, ApplicationLinkUpdateRecord record)
      throws SQLException {
    ApplicationLinkRecord app = record.application();
    int index = 1;
    setLongOrNull(cs, index++, app.applicationNumber());
    setLongOrNull(cs, index++, emptyToNull(app.federalApplicationNumber()));
    setDateOrNull(cs, index++, app.applicationDate());
    setLongOrNull(cs, index++, app.termDays());
    setDateOrNull(cs, index++, app.receivedDate());
    setDoubleOrNull(cs, index++, app.exemptionApplicationVolume());
    setDoubleOrNull(cs, index++, app.averageLogVolume());
    setStringOrNull(cs, index++, app.productLocation());
    setStringOrNull(cs, index++, app.entryUserId());
    setTimestampOrNull(cs, index++, app.entryTimestamp());
    setStringOrNull(cs, index++, record.updateUserId());
    cs.setTimestamp(index++, Timestamp.from(Instant.now()));
    setLongOrNull(cs, index++, app.exportScheduleId());
    setStringOrNull(cs, index++, app.agentClientNumber());
    setStringOrNull(cs, index++, app.agentClientLocationCode());
    setStringOrNull(cs, index++, app.ownerClientNumber());
    setStringOrNull(cs, index++, app.ownerClientLocationCode());
    setStringOrNull(cs, index++, record.exemptionNumber());
    setStringOrNull(cs, index++, app.exportExemptionReasonCode());
    setStringOrNull(cs, index++, record.applicationStatusCode());
    setStringOrNull(cs, index++, app.exportApplicantTypeCode());
    setLongOrNull(cs, index++, app.orgUnitNo());
    setStringOrNull(cs, index++, app.exportProductTypeCode());
    setStringOrNull(cs, index++, app.exportJurisdictionCode());
    setStringOrNull(cs, index++, app.exportGrowthTypeCode());
    setStringOrNull(cs, index++, app.agentCompanyContact());
    setStringOrNull(cs, index++, app.ownerCompanyContact());
    setStringOrNull(cs, index, app.oicIndicator());
  }

  private long defaultLong(Long value, long fallback) {
    return value == null ? fallback : value;
  }

  private double defaultDouble(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  private String valueOrEmpty(String value) {
    return value == null ? "" : value;
  }

  private Double firstNonNullDouble(Double first, Double second) {
    return first == null ? second : first;
  }

  private Long emptyToNull(Long value) {
    return value == null || value <= 0 ? null : value;
  }

  private String safeFileName(String value) {
    if (value == null || value.isBlank()) {
      return value;
    }
    int slashIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    if (slashIndex < 0 || slashIndex >= value.length() - 1) {
      return value;
    }
    return value.substring(slashIndex + 1);
  }

  public record ApplicationSummaryRow(
      long applicationNumber,
      double requestedVolume,
      double scaleVolume,
      String ownerClientNumber,
      String jurisdictionCode,
      String productTypeCode) {}

  public record PermitSummaryRow(
      long permitNumber,
      double permitVolume,
      double oicRequestVolume,
      String statusDescription,
      String statusCode,
      LocalDate issueDate,
      String clientNumber,
      String agentNumber) {}

  public record DocumentRow(
      long id, String fileName, String description, String attachmentTypeCode) {}

  public record ExemptionInsertRecord(
      String exemptionNumber,
      Double approvedVolume,
      LocalDate approvalDate,
      LocalDate expiryDate,
      String otherConditions,
      String exemptionTypeCode,
      String exemptionStatusCode,
      String entryUserId,
      List<Long> regionNumbers) {}

  public record ExemptionInsertRow(String exemptionNumber) {}

  public record ApplicationLinkRecord(
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
      String applicationStatusCode,
      String exportApplicantTypeCode,
      Long orgUnitNo,
      String exportProductTypeCode,
      String exportJurisdictionCode,
      String exportGrowthTypeCode,
      String agentCompanyContact,
      String ownerCompanyContact,
      String oicIndicator,
      LocalDate listingDate) {}

  public record ApplicationLinkUpdateRecord(
      ApplicationLinkRecord application,
      String exemptionNumber,
      String applicationStatusCode,
      String updateUserId) {}

  private void setStringOrNull(CallableStatement cs, int index, String value) throws SQLException {
    String normalized = trim(value);
    if (normalized == null) {
      cs.setNull(index, Types.VARCHAR);
    } else {
      cs.setString(index, normalized);
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
      cs.setDate(index, Date.valueOf(value));
    }
  }

  private void setLongOrNull(CallableStatement cs, int index, Long value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.NUMERIC);
    } else {
      cs.setLong(index, value);
    }
  }

  private void setTimestampOrNull(CallableStatement cs, int index, Timestamp value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.TIMESTAMP);
    } else {
      cs.setTimestamp(index, value);
    }
  }

  private Timestamp getTimestamp(ResultSet rs, String column) {
    try {
      return rs.getTimestamp(column);
    } catch (SQLException ex) {
      return null;
    }
  }
}

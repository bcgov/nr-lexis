package ca.bc.gov.mof.lexis.repository.application;

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
import java.util.Comparator;
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
public class ApplicationDetailsRpcRepository extends OracleRepositorySupport {

  private static final String FIND_APPLICATION_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPL_FILE_DETAILS(?,?)";
  private static final String FIND_PERMIT_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_FILE_DETAILS(?,?)";
  private static final String FIND_FILE_ATTACHMENT = LEXIS_GROUP_5_PACKAGE + "FIND_FILE_ATTACHMENT(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_APP(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PKG(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_ID(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_APP(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_ID(?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_END_USE_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_APP(?,?)";
  private static final String FIND_END_USE_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_PACK(?,?)";
  private static final String FIND_ATTACHMENT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ATTACH_TYPE_CODE(?,?)";
  private static final String FIND_ALL_SPECIES_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_SPECIES_CODES(?)";
  private static final String FIND_SPECIES_CODE = LEXIS_CODES_PACKAGE + "FIND_SPECIES_CODE(?,?)";
  private static final String FIND_GRADE_CODE = LEXIS_CODES_PACKAGE + "FIND_GRADE_CODE(?,?)";
  private static final String FIND_END_USE_CODE = LEXIS_CODES_PACKAGE + "FIND_END_USE_CODE(?,?)";
  private static final String FIND_SPECIES_GRADE_BY_REGION_SPECIES =
      LEXIS_CODES_PACKAGE + "FIND_SPEC_GRAD_BY_REG_SPEC(?,?,?)";
  private static final String DELETE_APPLICATION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_APPL_FILE_ATTACHMENT(?)";
  private static final String FIND_REMARK_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_REMARK_BY_NUMBER(?,?)";
  private static final String INSERT_REMARK =
      LEXIS_GROUP_14_PACKAGE + "INSERT_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";
  private static final String UPDATE_REMARK =
      LEXIS_GROUP_14_PACKAGE + "UPDATE_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";
  private static final String INSERT_EXEMPTION_APPLICATION =
      LEXIS_GROUP_13_PACKAGE
          + "INSERT_EXEMPTION_APPLICATION(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

  public ApplicationDetailsRpcRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
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

  public List<DocumentRow> findPermitDocumentDetailsByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_PERMIT_FILE_DETAILS,
        cs -> cs.setLong(1, permitNumber),
        2,
        this::mapDocumentRow);
  }

  public List<Long> findPermitNumbersByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_SCALE_DETAIL_BY_APPLICATION,
            cs -> cs.setLong(1, applicationNumber),
            2,
            rs -> parsePositiveLong(getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER")))
        .stream()
        .filter(value -> value != null && value > 0)
        .distinct()
        .toList();
  }

  public List<ApplicationScaleRow> findScaleDetailsByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_APPLICATION,
        cs -> cs.setLong(1, applicationNumber),
        2,
        rs -> new ApplicationScaleRow(getString(rs, "TIMBER_MARK")));
  }

  public List<ApplicationPermitRow> findPermitsByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_PERMIT_DETAIL_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> new ApplicationPermitRow(getLong(rs, "EXPORT_PERMIT_NUMBER"), getString(rs, "STATUS_DESCRIPTION")));
  }

  public List<ApplicationScaleDetailRow> findScaleDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PACKAGE,
        cs -> cs.setString(1, normalized),
        2,
        this::mapApplicationScaleDetailRow);
  }

  public Optional<ApplicationScaleDetailRow> findScaleDetailById(String scaleDetailId) {
    String normalized = trim(scaleDetailId);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_SCALE_DETAIL_BY_ID,
        cs -> cs.setString(1, normalized),
        2,
        this::mapApplicationScaleDetailRow);
  }

  public Optional<String> findPermitStatusCodeByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
            FIND_PERMIT_DETAIL_BY_ID,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs -> trim(getString(rs, "EXPORT_PERMIT_STATUS_CODE")))
        .filter(value -> value != null && !value.isBlank());
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
                      // Ignore stream close exceptions for read-only download lookups.
                    }
                  }
                }
              });
    } catch (DataAccessException ex) {
      logger.warn("Oracle file attachment lookup failed [{}]: {}", FIND_FILE_ATTACHMENT, ex.getMessage());
      return Optional.empty();
    }
  }

  public boolean deleteApplicationFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    return executeProcedure(DELETE_APPLICATION_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
  }

  public Optional<RemarkRow> findRemarkByNumber(Long remarkId) {
    if (remarkId == null || remarkId < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_REMARK_BY_NUMBER,
        cs -> cs.setLong(1, remarkId),
        2,
        this::mapRemarkRow);
  }

  public Optional<RemarkRow> insertRemark(
      Long applicationNumber, String remarkBody, String entryUserId, Instant remarkDate) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    Timestamp timestamp = Timestamp.from(remarkDate == null ? Instant.now() : remarkDate);
    String remark = normalizeRemarkBody(remarkBody);

    return queryCursorSingle(
        INSERT_REMARK,
        cs -> {
          cs.setTimestamp(1, timestamp);
          cs.setString(2, remark);
          cs.setString(3, trim(entryUserId));
          cs.setTimestamp(4, Timestamp.from(Instant.now()));
          cs.setLong(5, applicationNumber);
        },
        6,
        this::mapRemarkRow);
  }

  public boolean updateRemark(
      Long remarkId, Long applicationNumber, String remarkBody, String updateUserId, Instant remarkDate) {
    if (remarkId == null || remarkId < 1 || applicationNumber == null || applicationNumber < 1) {
      return false;
    }

    Timestamp timestamp = Timestamp.from(remarkDate == null ? Instant.now() : remarkDate);
    String remark = normalizeRemarkBody(remarkBody);

    return executeProcedure(
        UPDATE_REMARK,
        cs -> {
          cs.setLong(1, remarkId);
          cs.setTimestamp(2, timestamp);
          cs.setString(3, remark);
          cs.setString(4, trim(updateUserId));
          cs.setTimestamp(5, Timestamp.from(Instant.now()));
          cs.setLong(6, applicationNumber);
        });
  }

  public Optional<ApplicationInsertRow> insertApplication(ApplicationInsertRecord record) {
    if (record == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        INSERT_EXEMPTION_APPLICATION,
        cs -> bindApplicationInsert(cs, record),
        28,
        this::mapApplicationInsertRow);
  }

  public Optional<ApplicationClientSnapshotRow> findApplicationClientSnapshot(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ApplicationClientSnapshotRow(
                getString(rs, "AGENT_CLIENT_NUMBER"),
                getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
                getString(rs, "AGENT_CONTACT_NAME"),
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                getString(rs, "OWNER_CONTACT_NAME")));
  }

  public List<EndUseRow> findEndUsesByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_END_USE_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapEndUseRow);
  }

  public List<EndUseRow> findEndUsesByPackageNumber(String packageNumber) {
    String normalizedPackageNumber = trim(packageNumber);
    if (normalizedPackageNumber == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_END_USE_BY_PACKAGE,
        cs -> cs.setString(1, normalizedPackageNumber),
        2,
        this::mapEndUseRow);
  }

  public List<CodeRow> findAllSpeciesCodes() {
    return queryCursorProcedure(
            FIND_ALL_SPECIES_CODES,
            null,
            1,
            rs ->
                new CodeRow(
                    getString(rs, "CODE"),
                    getString(rs, "DESCRIPTION"),
                    zeroIfNull(getLong(rs, "GROUP_BY")),
                    zeroIfNull(getLong(rs, "ORDER_BY"))))
        .stream()
        .filter(row -> trim(row.code()) != null && trim(row.description()) != null)
        .sorted(Comparator.comparingLong(CodeRow::groupBy).thenComparingLong(CodeRow::orderBy))
        .toList();
  }

  public Optional<CodeRow> findGradeCode(String gradeCode) {
    String normalized = trim(gradeCode);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_GRADE_CODE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new CodeRow(
                getString(rs, "CODE"),
                getString(rs, "DESCRIPTION"),
                zeroIfNull(getLong(rs, "GROUP_BY")),
                zeroIfNull(getLong(rs, "ORDER_BY"))));
  }

  public Optional<CodeRow> findSpeciesCode(String speciesCode) {
    String normalized = trim(speciesCode);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_SPECIES_CODE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new CodeRow(
                getString(rs, "CODE"),
                getString(rs, "DESCRIPTION"),
                zeroIfNull(getLong(rs, "GROUP_BY")),
                zeroIfNull(getLong(rs, "ORDER_BY"))));
  }

  public Optional<CodeRow> findEndUseCode(String endUseCode) {
    String normalized = trim(endUseCode);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_END_USE_CODE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new CodeRow(
                getString(rs, "CODE"),
                getString(rs, "DESCRIPTION"),
                zeroIfNull(getLong(rs, "GROUP_BY")),
                zeroIfNull(getLong(rs, "ORDER_BY"))));
  }

  public List<SpeciesGradeEndUseRow> findSpeciesEndUsesByRegionSpecies(
      String orgUnitNumber, String speciesCode) {
    String normalizedOrgUnitNumber = trim(orgUnitNumber);
    String normalizedSpeciesCode = trim(speciesCode);
    if (normalizedOrgUnitNumber == null || normalizedSpeciesCode == null) {
      return List.of();
    }
    return queryCursorProcedure(
            FIND_SPECIES_GRADE_BY_REGION_SPECIES,
            cs -> {
              cs.setString(1, normalizedOrgUnitNumber);
              cs.setString(2, normalizedSpeciesCode);
            },
            3,
            rs ->
                new SpeciesGradeEndUseRow(
                    getString(rs, "EXPORT_SPECIES_CODE"),
                    getString(rs, "EXPORT_GRADE_CODE"),
                    getString(rs, "EXPORT_END_USE_CODE"),
                    getString(rs, "EXCOL_TRANSLATION_VALUE"),
                    getLong(rs, "ORG_UNIT_NO")))
        .stream()
        .filter(row -> trim(row.gradeCode()) != null)
        .toList();
  }

  private EndUseRow mapEndUseRow(ResultSet rs) throws SQLException {
    return new EndUseRow(
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_END_USE_CODE"));
  }

  private void bindApplicationInsert(CallableStatement cs, ApplicationInsertRecord record)
      throws SQLException {
    int index = 1;
    setDateOrNull(cs, index++, record.applicationDate());
    setLongOrNull(cs, index++, emptyToNull(record.federalApplicationNumber()));
    setLongOrNull(cs, index++, record.termDays());
    setDateOrNull(cs, index++, record.receivedDate());
    setDoubleOrNull(cs, index++, record.applicationVolume());
    setDoubleOrNull(cs, index++, record.averageLogVolume());
    setStringOrNull(cs, index++, record.productLocation());
    setStringOrNull(cs, index++, record.entryUserId());
    cs.setTimestamp(index++, Timestamp.from(Instant.now()));
    cs.setNull(index++, Types.VARCHAR);
    cs.setNull(index++, Types.TIMESTAMP);
    setLongOrNull(cs, index++, record.exportScheduleId());
    setStringOrNull(cs, index++, record.agentClientNumber());
    setStringOrNull(cs, index++, record.agentClientLocationCode());
    setStringOrNull(cs, index++, record.ownerClientNumber());
    setStringOrNull(cs, index++, record.ownerClientLocationCode());
    setStringOrNull(cs, index++, record.exemptionNumber());
    setStringOrNull(cs, index++, record.exemptionReasonCode());
    setStringOrNull(cs, index++, record.applicationStatusCode());
    setStringOrNull(cs, index++, record.applicantTypeCode());
    setLongOrNull(cs, index++, record.orgUnitNumber());
    setStringOrNull(cs, index++, record.productTypeCode());
    setStringOrNull(cs, index++, record.jurisdictionCode());
    setStringOrNull(cs, index++, record.growthTypeCode());
    setStringOrNull(cs, index++, record.agentContactName());
    setStringOrNull(cs, index++, record.ownerContactName());
    setStringOrNull(cs, index, record.oicIndicator());
  }

  private DocumentRow mapDocumentRow(ResultSet rs) {
    Long attachmentId = getLong(rs, "EXPORT_ATTACHMENT_ID");
    String fileName = safeFileName(getString(rs, "FILE_NAME"));
    String description = trim(getString(rs, "DESCRIPTION"));
    String attachmentTypeCode = getString(rs, "EXPORT_ATTACHMENT_TYPE_CODE");
    return new DocumentRow(
        attachmentId == null ? 0L : attachmentId,
        fileName == null ? "" : fileName,
        description == null ? "" : description,
        attachmentTypeCode);
  }

  private RemarkRow mapRemarkRow(ResultSet rs) {
    Long remarkId = getLong(rs, "EXPORT_EXMPTN_APPL_REMARK_NMBR");
    String remark = getString(rs, "REMARK");
    String user = getString(rs, "ENTRY_USERID");
    Instant date = getInstant(rs, "ENTRY_TIMESTAMP");
    return new RemarkRow(remarkId == null ? 0L : remarkId, remark == null ? "" : remark, user, date);
  }

  private ApplicationInsertRow mapApplicationInsertRow(ResultSet rs) {
    return new ApplicationInsertRow(getLong(rs, "APPLICATION_NUMBER"));
  }

  private ApplicationScaleDetailRow mapApplicationScaleDetailRow(ResultSet rs) {
    return new ApplicationScaleDetailRow(
        getString(rs, "EXPORT_SCALE_DETAIL_ID"),
        getString(rs, "TIMBER_MARK"),
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_GRADE_CODE"),
        zeroIfNull(getDouble(rs, "SPECIES_GRADE_VOLUME")),
        zeroIfNull(getLong(rs, "PIECES_COUNT")),
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
        getString(rs, "PACKAGE_NUMBER"),
        getString(rs, "CASCADE_SPLIT_CODE"));
  }

  private Instant getInstant(ResultSet rs, String column) {
    try {
      Timestamp value = rs.getTimestamp(column);
      return value == null ? null : value.toInstant();
    } catch (SQLException ex) {
      return null;
    }
  }

  private Long parsePositiveLong(String value) {
    String normalized = trim(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String normalizeRemarkBody(String remarkBody) {
    return remarkBody == null ? "" : remarkBody;
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

  public record DocumentRow(
      long id, String fileName, String description, String attachmentTypeCode) {}

  public record RemarkRow(long remarkId, String remark, String user, Instant date) {}

  public record ApplicationInsertRecord(
      LocalDate applicationDate,
      Long federalApplicationNumber,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String productLocation,
      String entryUserId,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String exemptionNumber,
      String exemptionReasonCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator) {}

  public record ApplicationInsertRow(Long applicationNumber) {}

  public record ApplicationClientSnapshotRow(
      String agentClientNumber,
      String agentClientLocationCode,
      String agentContactName,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String ownerContactName) {}

  public record CodeRow(String code, String description, long groupBy, long orderBy) {}

  public record EndUseRow(String speciesCode, String endUseCode) {}

  public record SpeciesGradeEndUseRow(
      String speciesCode,
      String gradeCode,
      String endUseCode,
      String excolTranslationValue,
      Long orgUnitNumber) {}

  public record ApplicationScaleRow(String timberMark) {}

  public record ApplicationPermitRow(Long permitNumber, String statusDescription) {}

  public record ApplicationScaleDetailRow(
      String exportScaleDetailId,
      String timberMark,
      String exportSpeciesCode,
      String exportGradeCode,
      double speciesGradeVolume,
      long piecesCount,
      Long applicationNumber,
      String exportPermitDetailNumber,
      String packageNumber,
      String cascadeSplitCode) {}

  private void setStringOrNull(CallableStatement cs, int index, String value) throws SQLException {
    String normalized = trim(value);
    if (normalized == null) {
      cs.setNull(index, Types.VARCHAR);
    } else {
      cs.setString(index, normalized);
    }
  }

  private long zeroIfNull(Long value) {
    return value == null ? 0L : value;
  }

  private double zeroIfNull(Double value) {
    return value == null ? 0.0d : value;
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
      cs.setDate(index, Date.valueOf(value));
    }
  }

  private Long emptyToNull(Long value) {
    return value == null || value <= 0 ? null : value;
  }
}

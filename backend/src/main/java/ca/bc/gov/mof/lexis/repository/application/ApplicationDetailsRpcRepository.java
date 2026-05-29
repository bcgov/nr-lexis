package ca.bc.gov.mof.lexis.repository.application;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
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
  private static final String FIND_ATTACHMENT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ATTACH_TYPE_CODE(?,?)";
  private static final String FIND_SPECIES_CODE = LEXIS_CODES_PACKAGE + "FIND_SPECIES_CODE(?,?)";
  private static final String FIND_GRADE_CODE = LEXIS_CODES_PACKAGE + "FIND_GRADE_CODE(?,?)";
  private static final String FIND_TIMBER_MARK = LEXIS_CODES_PACKAGE + "FIND_TIMBER_MARK(?,?)";
  private static final String DELETE_APPLICATION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_APPL_FILE_ATTACHMENT(?)";
  private static final String INSERT_SCALE_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "INSERT_SCALE_DETAIL(?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String FIND_REMARK_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_REMARK_BY_NUMBER(?,?)";
  private static final String INSERT_REMARK =
      LEXIS_GROUP_14_PACKAGE + "INSERT_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";
  private static final String UPDATE_REMARK =
      LEXIS_GROUP_14_PACKAGE + "UPDATE_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";

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

  public List<ApplicationScaleDetailRow> findScaleDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PACKAGE,
        cs -> cs.setString(1, normalized),
        2,
        this::mapScaleDetailRow);
  }

  public Optional<ApplicationScaleDetailRow> insertScaleDetail(
      ScaleUploadInsertRow row, String entryUserId) {
    String normalizedEntryUserId = trim(entryUserId);
    if (row == null
        || normalizedEntryUserId == null
        || trim(row.timberMark()) == null
        || trim(row.packageNumber()) == null
        || trim(row.speciesCode()) == null
        || trim(row.gradeCode()) == null
        || row.piecesCount() == null
        || row.speciesGradeVolume() == null) {
      return Optional.empty();
    }

    Timestamp now = new Timestamp(System.currentTimeMillis());
    return queryCursorSingle(
        INSERT_SCALE_DETAIL,
        cs -> {
          cs.setString(1, trim(row.timberMark()));
          setLongOrNull(cs, 2, row.piecesCount());
          cs.setBigDecimal(3, row.speciesGradeVolume());
          cs.setString(4, normalizedEntryUserId);
          cs.setTimestamp(5, now);
          cs.setNull(6, Types.VARCHAR);
          cs.setNull(7, Types.TIMESTAMP);
          cs.setString(8, trim(row.packageNumber()));
          cs.setString(9, trim(row.speciesCode()));
          cs.setString(10, trim(row.gradeCode()));
          cs.setNull(11, Types.NUMERIC);
          if (row.exemptionOverrideRate() == null) {
            cs.setNull(12, Types.NUMERIC);
          } else {
            cs.setBigDecimal(12, row.exemptionOverrideRate());
          }
        },
        13,
        this::mapScaleDetailRow);
  }

  public Optional<String> findSpeciesDescription(String speciesCode) {
    return findCodeDescription(FIND_SPECIES_CODE, speciesCode);
  }

  public Optional<String> findGradeDescription(String gradeCode) {
    return findCodeDescription(FIND_GRADE_CODE, gradeCode);
  }

  public Optional<TimberMarkRow> findTimberMark(String timberMark) {
    String normalized = trim(timberMark);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_TIMBER_MARK,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new TimberMarkRow(
                getString(rs, "TIMBER_MARK"),
                getString(rs, "MARK_STATUS_ST"),
                getString(rs, "FILE_TYPE_CODE")));
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

  private ApplicationScaleDetailRow mapScaleDetailRow(ResultSet rs) {
    return new ApplicationScaleDetailRow(
        getString(rs, "EXPORT_SCALE_DETAIL_ID"),
        getString(rs, "TIMBER_MARK"),
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_GRADE_CODE"),
        coalesce(getDouble(rs, "SPECIES_GRADE_VOLUME"), 0.0d),
        coalesce(getLong(rs, "PIECES_COUNT"), 0L),
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "PACKAGE_NUMBER"));
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

  private Optional<String> findCodeDescription(String procedureSignature, String code) {
    String normalized = trim(code);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
            procedureSignature,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(rs.getString(2)))
        .filter(value -> value != null && !value.isBlank());
  }

  private void setLongOrNull(java.sql.CallableStatement cs, int index, Long value)
      throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.NUMERIC);
      return;
    }
    cs.setLong(index, value);
  }

  private double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  private long coalesce(Long value, long fallback) {
    return value == null ? fallback : value;
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

  public record ApplicationScaleDetailRow(
      String exportScaleDetailId,
      String timberMark,
      String exportSpeciesCode,
      String exportGradeCode,
      double speciesGradeVolume,
      long piecesCount,
      Long applicationNumber,
      String packageNumber) {}

  public record ScaleUploadInsertRow(
      String timberMark,
      Long piecesCount,
      BigDecimal speciesGradeVolume,
      String packageNumber,
      String speciesCode,
      String gradeCode,
      BigDecimal exemptionOverrideRate) {}

  public record TimberMarkRow(String timberMark, String markStatus, String fileTypeCode) {}
}

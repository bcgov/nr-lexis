package ca.bc.gov.mof.lexis.repository.upload;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class UploadRepository extends OracleRepositorySupport {

  private static final String INSERT_APPLICATION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_PERMIT_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "INSERT_PERMIT_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_EXEMPTION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "INSERT_EXEMPT_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_INVOICE_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "INSERT_INVOICE_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String FIND_FILE_TYPE_CODE = LEXIS_CODES_PACKAGE + "FIND_FILE_TYPE_CODE(?,?)";

  public UploadRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public UploadPersistenceResult insertApplicationFile(
      Long applicationNumber,
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      String entryUserId,
      InputStream content,
      long contentLength) {
    if (applicationNumber == null
        || applicationNumber < 1
        || content == null
        || contentLength < 1) {
      return UploadPersistenceResult.failed(UploadFailureReason.INVALID_REQUEST);
    }

    String call = "{ call " + INSERT_APPLICATION_FILE_ATTACHMENT + " }";
    String auditUser = auditUserOrDefault(entryUserId);
    return executeUpload(
        call,
        cs -> {
          cs.setLong(1, applicationNumber);
          cs.setString(2, fileName);
          cs.setString(3, description);
          cs.setString(4, attachmentTypeCode);
          cs.setString(5, fileTypeCode);
          cs.setString(6, auditUser);
          cs.setTimestamp(7, new Timestamp(System.currentTimeMillis()));
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
          cs.setBinaryStream(10, content, contentLength);
          cs.registerOutParameter(11, Types.REF_CURSOR);
        },
        "application",
        11,
        new ExpectedUploadMetadata(
            fileName, description, attachmentTypeCode, fileTypeCode, auditUser));
  }

  public UploadPersistenceResult insertPermitFile(
      Long permitNumber,
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      String entryUserId,
      InputStream content,
      long contentLength) {
    if (permitNumber == null || permitNumber < 1 || content == null || contentLength < 1) {
      return UploadPersistenceResult.failed(UploadFailureReason.INVALID_REQUEST);
    }

    String call = "{ call " + INSERT_PERMIT_FILE_ATTACHMENT + " }";
    String auditUser = auditUserOrDefault(entryUserId);
    return executeUpload(
        call,
        cs -> {
          cs.setLong(1, permitNumber);
          cs.setString(2, fileName);
          cs.setString(3, description);
          cs.setString(4, attachmentTypeCode);
          cs.setString(5, fileTypeCode);
          cs.setString(6, auditUser);
          cs.setTimestamp(7, new Timestamp(System.currentTimeMillis()));
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
          cs.setBinaryStream(10, content, contentLength);
          cs.registerOutParameter(11, Types.REF_CURSOR);
        },
        "permit",
        11,
        new ExpectedUploadMetadata(
            fileName, description, attachmentTypeCode, fileTypeCode, auditUser));
  }

  public UploadPersistenceResult insertExemptionFile(
      String exemptionNumber,
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      String entryUserId,
      InputStream content,
      long contentLength) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (normalizedExemptionNumber == null || content == null || contentLength < 1) {
      return UploadPersistenceResult.failed(UploadFailureReason.INVALID_REQUEST);
    }

    String call = "{ call " + INSERT_EXEMPTION_FILE_ATTACHMENT + " }";
    String auditUser = auditUserOrDefault(entryUserId);
    return executeUpload(
        call,
        cs -> {
          cs.setString(1, normalizedExemptionNumber);
          cs.setString(2, fileName);
          cs.setString(3, description);
          cs.setString(4, attachmentTypeCode);
          cs.setString(5, fileTypeCode);
          cs.setString(6, auditUser);
          cs.setTimestamp(7, new Timestamp(System.currentTimeMillis()));
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
          cs.setBinaryStream(10, content, contentLength);
          cs.registerOutParameter(11, Types.REF_CURSOR);
        },
        "exemption",
        11,
        new ExpectedUploadMetadata(
            fileName, description, attachmentTypeCode, fileTypeCode, auditUser));
  }

  public UploadPersistenceResult insertInvoiceFile(
      Long permitNumber,
      String salesInvoiceNumber,
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String entryUserId,
      InputStream content,
      long contentLength) {
    String normalizedSalesInvoiceNumber = trim(salesInvoiceNumber);
    if (permitNumber == null
        || permitNumber < 1
        || normalizedSalesInvoiceNumber == null
        || content == null
        || contentLength < 1) {
      return UploadPersistenceResult.failed(UploadFailureReason.INVALID_REQUEST);
    }

    String call = "{ call " + INSERT_INVOICE_FILE_ATTACHMENT + " }";
    String auditUser = auditUserOrDefault(entryUserId);
    return executeUpload(
        call,
        cs -> {
          cs.setLong(1, permitNumber);
          cs.setString(2, normalizedSalesInvoiceNumber);
          cs.setString(3, fileName);
          cs.setString(4, description);
          cs.setString(5, attachmentTypeCode);
          cs.setString(6, fileTypeCode);
          cs.setBigDecimal(7, defaultDecimal(exportValue));
          cs.setBigDecimal(8, defaultDecimal(currencyConversionRate));
          cs.setBigDecimal(9, defaultDecimal(feeInLieu));
          cs.setString(10, auditUser);
          cs.setTimestamp(11, new Timestamp(System.currentTimeMillis()));
          cs.setNull(12, Types.VARCHAR);
          cs.setNull(13, Types.TIMESTAMP);
          cs.setBinaryStream(14, content, contentLength);
          cs.registerOutParameter(15, Types.REF_CURSOR);
        },
        "invoice",
        15,
        new ExpectedUploadMetadata(
            fileName, description, attachmentTypeCode, fileTypeCode, auditUser));
  }

  public boolean isFileTypeCodeValidRequired(String fileTypeCode) {
    String normalized = trim(fileTypeCode);
    if (normalized == null) {
      return false;
    }

    return queryCursorSingleRequired(
            FIND_FILE_TYPE_CODE,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(getString(rs, "CODE")))
        .filter(normalized::equalsIgnoreCase)
        .isPresent();
  }

  private UploadPersistenceResult executeUpload(
      String call,
      SqlConsumer<CallableStatement> binder,
      String attachmentSource,
      int cursorOutIndex,
      ExpectedUploadMetadata expectedMetadata) {
    try {
      Boolean result =
          jdbcTemplate.execute(
              call,
              (CallableStatementCallback<Boolean>)
                  cs -> {
                    binder.accept(cs);
                    cs.execute();
                    Object cursor = cs.getObject(cursorOutIndex);
                    if (!(cursor instanceof ResultSet rs)) {
                      return Boolean.FALSE;
                    }
                    try (rs) {
                      return validateUploadResult(rs, expectedMetadata);
                    }
                  });
      if (Boolean.TRUE.equals(result)) {
        return UploadPersistenceResult.success();
      }
      logger.warn(
          "event=lexis_attachment_upload operation=oracle_persist outcome=invalid_result source={}",
          attachmentSource);
      return UploadPersistenceResult.failed(UploadFailureReason.UNKNOWN);
    } catch (DataAccessException ex) {
      logger.warn(
          "event=lexis_attachment_upload operation=oracle_persist outcome=failed source={} failureType={}",
          attachmentSource,
          exceptionType(ex));
      return UploadPersistenceResult.failed(resolveUploadFailureReason(ex));
    }
  }

  private boolean validateUploadResult(ResultSet rs, ExpectedUploadMetadata expectedMetadata)
      throws SQLException {
    if (!rs.next()) {
      return false;
    }

    long attachmentId = rs.getLong("EXPORT_ATTACHMENT_ID");
    boolean validAttachmentId = !rs.wasNull() && attachmentId > 0;
    String returnedFileName = rs.getString("FILE_NAME");
    String returnedDescription = rs.getString("DESCRIPTION");
    String returnedFileTypeCode = rs.getString("EXPORT_FILE_TYPE_CODE");
    String returnedAttachmentTypeCode = rs.getString("EXPORT_ATTACHMENT_TYPE_CODE");
    String returnedMimeTypeCode = rs.getString("EXPORT_FILE_MIME_TYPE_CODE");
    String returnedEntryUserId = rs.getString("ENTRY_USERID");
    Timestamp returnedEntryTimestamp = rs.getTimestamp("ENTRY_TIMESTAMP");
    boolean matchingMetadata =
        validAttachmentId
            && Objects.equals(expectedMetadata.fileName(), returnedFileName)
            && oracleTextEquals(expectedMetadata.description(), returnedDescription)
            && Objects.equals(expectedMetadata.fileTypeCode(), returnedFileTypeCode)
            && Objects.equals(expectedMetadata.attachmentTypeCode(), returnedAttachmentTypeCode)
            && Objects.equals(expectedMetadata.fileTypeCode(), returnedMimeTypeCode)
            && Objects.equals(expectedMetadata.entryUserId(), returnedEntryUserId)
            && returnedEntryTimestamp != null;
    return matchingMetadata && !rs.next();
  }

  private boolean oracleTextEquals(String expected, String actual) {
    return Objects.equals(trim(expected), trim(actual));
  }

  private UploadFailureReason resolveUploadFailureReason(Throwable throwable) {
    String rootMessage = rootCauseMessage(throwable).toLowerCase(Locale.ROOT);
    if (rootMessage.contains("ora-02291") || rootMessage.contains("parent key not found")) {
      return UploadFailureReason.PARENT_NOT_FOUND;
    }
    return UploadFailureReason.UNKNOWN;
  }

  private String rootCauseMessage(Throwable throwable) {
    Throwable root = throwable;
    while (root.getCause() != null && root.getCause() != root) {
      root = root.getCause();
    }
    String message = root.getMessage();
    return root.getClass().getSimpleName() + (message == null ? "" : ": " + message);
  }

  private BigDecimal defaultDecimal(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  private record ExpectedUploadMetadata(
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      String entryUserId) {}

  public enum UploadFailureReason {
    INVALID_REQUEST,
    PARENT_NOT_FOUND,
    UNKNOWN
  }

  public record UploadPersistenceResult(boolean persisted, UploadFailureReason failureReason) {
    public static UploadPersistenceResult success() {
      return new UploadPersistenceResult(true, null);
    }

    public static UploadPersistenceResult failed(UploadFailureReason failureReason) {
      return new UploadPersistenceResult(false, failureReason);
    }
  }
}

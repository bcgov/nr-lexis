package ca.bc.gov.mof.lexis.repository.upload;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.sql.Types;
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

  public boolean insertApplicationFile(
      Long applicationNumber,
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      String entryUserId,
      byte[] bytes) {
    if (applicationNumber == null || applicationNumber < 1 || bytes == null || bytes.length == 0) {
      return false;
    }

    String call = "{ call " + INSERT_APPLICATION_FILE_ATTACHMENT + " }";
    return executeUpload(
        call,
        cs -> {
          cs.setLong(1, applicationNumber);
          cs.setString(2, fileName);
          cs.setString(3, description);
          cs.setString(4, attachmentTypeCode);
          cs.setString(5, fileTypeCode);
          cs.setString(6, auditUserOrDefault(entryUserId));
          cs.setTimestamp(7, new Timestamp(System.currentTimeMillis()));
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
          cs.setBytes(10, bytes);
          cs.registerOutParameter(11, Types.REF_CURSOR);
        },
        INSERT_APPLICATION_FILE_ATTACHMENT,
        11);
  }

  public boolean insertPermitFile(
      Long permitNumber,
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      String entryUserId,
      byte[] bytes) {
    if (permitNumber == null || permitNumber < 1 || bytes == null || bytes.length == 0) {
      return false;
    }

    String call = "{ call " + INSERT_PERMIT_FILE_ATTACHMENT + " }";
    return executeUpload(
        call,
        cs -> {
          cs.setLong(1, permitNumber);
          cs.setString(2, fileName);
          cs.setString(3, description);
          cs.setString(4, attachmentTypeCode);
          cs.setString(5, fileTypeCode);
          cs.setString(6, auditUserOrDefault(entryUserId));
          cs.setTimestamp(7, new Timestamp(System.currentTimeMillis()));
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
          cs.setBytes(10, bytes);
          cs.registerOutParameter(11, Types.REF_CURSOR);
        },
        INSERT_PERMIT_FILE_ATTACHMENT,
        11);
  }

  public boolean insertExemptionFile(
      String exemptionNumber,
      String fileName,
      String description,
      String attachmentTypeCode,
      String fileTypeCode,
      String entryUserId,
      byte[] bytes) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (normalizedExemptionNumber == null || bytes == null || bytes.length == 0) {
      return false;
    }

    String call = "{ call " + INSERT_EXEMPTION_FILE_ATTACHMENT + " }";
    return executeUpload(
        call,
        cs -> {
          cs.setString(1, normalizedExemptionNumber);
          cs.setString(2, fileName);
          cs.setString(3, description);
          cs.setString(4, attachmentTypeCode);
          cs.setString(5, fileTypeCode);
          cs.setString(6, auditUserOrDefault(entryUserId));
          cs.setTimestamp(7, new Timestamp(System.currentTimeMillis()));
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
          cs.setBytes(10, bytes);
          cs.registerOutParameter(11, Types.REF_CURSOR);
        },
        INSERT_EXEMPTION_FILE_ATTACHMENT,
        11);
  }

  public boolean insertInvoiceFile(
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
      byte[] bytes) {
    String normalizedSalesInvoiceNumber = trim(salesInvoiceNumber);
    if (permitNumber == null
        || permitNumber < 1
        || normalizedSalesInvoiceNumber == null
        || bytes == null
        || bytes.length == 0) {
      return false;
    }

    String call = "{ call " + INSERT_INVOICE_FILE_ATTACHMENT + " }";
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
          cs.setString(10, auditUserOrDefault(entryUserId));
          cs.setTimestamp(11, new Timestamp(System.currentTimeMillis()));
          cs.setNull(12, Types.VARCHAR);
          cs.setNull(13, Types.TIMESTAMP);
          cs.setBytes(14, bytes);
          cs.registerOutParameter(15, Types.REF_CURSOR);
        },
        INSERT_INVOICE_FILE_ATTACHMENT,
        15);
  }

  public boolean isFileTypeCodeValid(String fileTypeCode) {
    String normalized = trim(fileTypeCode);
    if (normalized == null) {
      return false;
    }

    return queryCursorSingle(
            FIND_FILE_TYPE_CODE,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(getString(rs, "CODE")))
        .isPresent();
  }

  private boolean executeUpload(
      String call,
      SqlConsumer<CallableStatement> binder,
      String procedureSignature,
      int cursorOutIndex) {
    try {
      Boolean result =
          jdbcTemplate.execute(
              call,
              (CallableStatementCallback<Boolean>)
                  cs -> {
                    binder.accept(cs);
                    cs.execute();
                    try (ResultSet rs = (ResultSet) cs.getObject(cursorOutIndex)) {
                      return Boolean.TRUE;
                    }
                  });
      return Boolean.TRUE.equals(result);
    } catch (DataAccessException ex) {
      logger.warn("Oracle procedure execution failed [{}]: {}", procedureSignature, ex.getMessage());
      return false;
    }
  }

  private BigDecimal defaultDecimal(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }
}

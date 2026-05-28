package ca.bc.gov.mof.lexis.repository.exemption;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.io.InputStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
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
  private static final String FIND_APPLICATION_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPL_FILE_DETAILS(?,?)";
  private static final String FIND_FILE_ATTACHMENT = LEXIS_GROUP_5_PACKAGE + "FIND_FILE_ATTACHMENT(?,?)";
  private static final String FIND_ATTACHMENT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ATTACH_TYPE_CODE(?,?)";
  private static final String DELETE_EXEMPTION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_EXEMPT_FILE_ATTACHMENT(?)";

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

  private long defaultLong(Long value, long fallback) {
    return value == null ? fallback : value;
  }

  private double defaultDouble(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  private String valueOrEmpty(String value) {
    return value == null ? "" : value;
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
}

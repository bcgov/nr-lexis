package ca.bc.gov.mof.lexis.repository.permit;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Low-level Oracle adapter for permit-invoice and GBMS procedures. Callers own transaction, retry,
 * compensation, and reconciliation policy.
 */
@Repository
@Profile("oracle")
public class PermitInvoiceRepository extends OracleRepositorySupport {

  private static final String FIND_PERMIT_INVOICES =
      LEXIS_GROUP_9_PACKAGE + "FIND_EXPORT_PERMIT_INVOICE(?,?)";
  private static final String INSERT_GBMS_FOREST_INVOICE =
      LEXIS_GROUP_9_PACKAGE + "GBMS_INSERT_FRST_INVC_TXN(?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_GBMS_GENERAL_INVOICE =
      LEXIS_GROUP_9_PACKAGE + "GBMS_INSERT_GNRL_INVC_TXN(?,?,?,?,?,?,?)";
  private static final String INSERT_GBMS_INVOICE_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "GBMS_INSERT_INVOICE_DTL_TXN(?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_GBMS_NOTATION =
      LEXIS_GROUP_9_PACKAGE + "GBMS_INSERT_NOTATION_TXN(?,?,?,?,?)";
  private static final String CANCEL_GBMS_INVOICE =
      LEXIS_GROUP_9_PACKAGE + "GBMS_CANCEL_INVOICE(?,?)";
  private static final String SET_GBMS_REPLACEMENT =
      LEXIS_GROUP_9_PACKAGE + "GBMS_SET_REPLACEMENT_INVOICE(?,?,?,?)";
  private static final String INSERT_PERMIT_INVOICE =
      LEXIS_GROUP_9_PACKAGE + "INSERT_EXPORT_PERMIT_INVOICE(?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_PERMIT_INVOICE_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "INSERT_EXPORT_PERMIT_INV_DET(?,?,?,?,?,?,?,?,?,?,?)";
  private static final String UPDATE_PERMIT_INVOICE =
      LEXIS_GROUP_9_PACKAGE + "UPDATE_EXPORT_PERMIT_INVOICE(?,?,?)";

  public PermitInvoiceRepository(
      @Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  /**
   * Finds invoices by export permit detail number.
   *
   * The legacy parameter name says "permit invoice number", but the deployed procedure compares
   * it to {@code EXPORT_PERMIT_DETAIL_NUMBER}. The permit detail number is therefore intentional.
   */
  public List<PermitInvoiceRow> findByPermitDetailNumberRequired(Long permitDetailNumber) {
    requirePositive(permitDetailNumber, "Permit detail number");
    return queryCursorProcedureRequired(
        FIND_PERMIT_INVOICES,
        cs -> cs.setLong(1, permitDetailNumber),
        2,
        this::mapPermitInvoice);
  }

  public GbmsForestInvoiceRow insertGbmsForestInvoiceRequired(
      GbmsForestInvoiceInsert input) {
    requireInput(input, "GBMS forest invoice");
    requireNonBlank(input.entryUserId(), "Entry user id");
    return requireSingleResult(
        queryCursorSingleRequired(
            INSERT_GBMS_FOREST_INVOICE,
            cs -> {
              setStringOrNull(cs, 1, input.billingStatus());
              setBigDecimalOrNull(cs, 2, input.invoiceAmount());
              setStringOrNull(cs, 3, input.invoiceTypeCode());
              setStringOrNull(cs, 4, input.invoiceSubTypeCode());
              setStringOrNull(cs, 5, input.invoiceClassCode());
              setStringOrNull(cs, 6, input.relatedInvoiceNumber());
              setStringOrNull(cs, 7, input.invoiceRelationshipTypeCode());
              setStringOrNull(cs, 8, input.clientNumber());
              setStringOrNull(cs, 9, input.clientLocationCode());
              cs.setString(10, auditUserOrDefault(input.entryUserId()));
            },
            11,
            rs -> new GbmsForestInvoiceRow(requiredGeneratedString(rs, "INVOICE_NUMBER"))),
        "GBMS forest invoice");
  }

  public GbmsGeneralInvoiceRow insertGbmsGeneralInvoiceRequired(
      GbmsGeneralInvoiceInsert input) {
    requireInput(input, "GBMS general invoice");
    requireNonBlank(input.invoiceNumber(), "GBMS invoice number");
    requireNonBlank(input.entryUserId(), "Entry user id");
    return requireSingleResult(
        queryCursorSingleRequired(
            INSERT_GBMS_GENERAL_INVOICE,
            cs -> {
              cs.setString(1, input.invoiceNumber());
              setLongOrNull(cs, 2, input.originOrgNumber());
              setLongOrNull(cs, 3, input.adminOrgNumber());
              setStringOrNull(cs, 4, input.forestFileId());
              setStringOrNull(cs, 5, input.ministryReferenceNumber());
              cs.setString(6, auditUserOrDefault(input.entryUserId()));
            },
            7,
            rs -> new GbmsGeneralInvoiceRow(requiredGeneratedString(rs, "INVOICE_NUMBER"))),
        "GBMS general invoice");
  }

  public GbmsInvoiceDetailRow insertGbmsInvoiceDetailRequired(
      GbmsInvoiceDetailInsert input) {
    requireInput(input, "GBMS invoice detail");
    requireNonBlank(input.invoiceNumber(), "GBMS invoice number");
    requireNonBlank(input.entryUserId(), "Entry user id");
    return requireSingleResult(
        queryCursorSingleRequired(
            INSERT_GBMS_INVOICE_DETAIL,
            cs -> {
              cs.setString(1, input.invoiceNumber());
              setLongOrNull(cs, 2, input.orgUnitNumber());
              setBigDecimalOrNull(cs, 3, input.numberOfUnits());
              setStringOrNull(cs, 4, input.unitOfMeasureCode());
              setBigDecimalOrNull(cs, 5, input.unitRate());
              setBigDecimalOrNull(cs, 6, input.extendedAmount());
              setStringOrNull(cs, 7, input.ocgSupplierNumber());
              setStringOrNull(cs, 8, input.ackMaskAcode());
              cs.setString(9, auditUserOrDefault(input.entryUserId()));
              setStringOrNull(cs, 10, input.lineItemDescription());
              setStringOrNull(cs, 11, input.pstIndicator());
              setStringOrNull(cs, 12, input.gstIndicator());
              setStringOrNull(cs, 13, input.hstIndicator());
            },
            14,
            rs ->
                new GbmsInvoiceDetailRow(
                    requiredGeneratedString(rs, "INVOICE_NUMBER"),
                    requiredGeneratedLong(rs, "LINE_ITEM_NUMBER"))),
        "GBMS invoice detail");
  }

  public GbmsNotationRow insertGbmsNotationRequired(GbmsNotationInsert input) {
    requireInput(input, "GBMS notation");
    requireNonBlank(input.invoiceNumber(), "GBMS invoice number");
    requireNonBlank(input.entryUserId(), "Entry user id");
    return requireSingleResult(
        queryCursorSingleRequired(
            INSERT_GBMS_NOTATION,
            cs -> {
              cs.setString(1, input.invoiceNumber());
              setStringOrNull(cs, 2, input.notationText());
              setStringOrNull(cs, 3, input.internalIndicator());
              cs.setString(4, auditUserOrDefault(input.entryUserId()));
            },
            5,
            rs ->
                new GbmsNotationRow(
                    requiredGeneratedString(rs, "INVOICE_NUMBER"),
                    requiredGeneratedLong(rs, "NOTATION_NUMBER"))),
        "GBMS notation");
  }

  public void cancelGbmsInvoiceRequired(String invoiceNumber, String updateUserId) {
    requireNonBlank(invoiceNumber, "GBMS invoice number");
    requireNonBlank(updateUserId, "Update user id");
    executeProcedureRequired(
        CANCEL_GBMS_INVOICE,
        cs -> {
          cs.setString(1, invoiceNumber);
          cs.setString(2, auditUserOrDefault(updateUserId));
        });
  }

  public GbmsReplacementRow setGbmsReplacementRequired(
      String replacementInvoiceNumber, String originalInvoiceNumber, String updateUserId) {
    requireNonBlank(replacementInvoiceNumber, "Replacement GBMS invoice number");
    requireNonBlank(originalInvoiceNumber, "Original GBMS invoice number");
    requireNonBlank(updateUserId, "Update user id");
    return requireSingleResult(
        queryCursorSingleRequired(
            SET_GBMS_REPLACEMENT,
            cs -> {
              // Oracle expects the new/replacement invoice before the original invoice.
              cs.setString(1, replacementInvoiceNumber);
              cs.setString(2, originalInvoiceNumber);
              cs.setString(3, auditUserOrDefault(updateUserId));
            },
            4,
            rs ->
                new GbmsReplacementRow(
                    requiredGeneratedString(rs, "INVOICE_NUMBER"),
                    requiredGeneratedString(rs, "REPLACED_BY_INVC"))),
        "GBMS replacement invoice");
  }

  public PermitInvoiceRow insertPermitInvoiceRequired(PermitInvoiceInsert input) {
    requireInput(input, "Permit invoice");
    requirePositive(input.permitDetailNumber(), "Permit detail number");
    requireNonBlank(input.submitUserId(), "Submit user id");
    List<PermitInvoiceRow> rows =
        queryCursorProcedureRequired(
            INSERT_PERMIT_INVOICE,
            cs -> {
              cs.setLong(1, input.permitDetailNumber());
              setStringOrNull(cs, 2, input.gbmsInvoiceNumber());
              setBigDecimalOrNull(cs, 3, input.invoiceTotal());
              setStringOrNull(cs, 4, input.clientNumber());
              setStringOrNull(cs, 5, input.clientLocationCode());
              setBigDecimalOrNull(cs, 6, input.exemptionOverrideRate());
              setBigDecimalOrNull(cs, 7, input.permitOverrideAmount());
              setLongOrNull(cs, 8, input.originOrgNumber());
              setLongOrNull(cs, 9, input.adminOrgNumber());
              setStringOrNull(cs, 10, input.ackMaskAcode());
              cs.setString(11, auditUserOrDefault(input.submitUserId()));
            },
            12,
            this::mapPermitInvoice);

    List<PermitInvoiceRow> activeRows =
        rows.stream()
            .filter(row -> row.cancelTimestamp() == null && row.cancelUserId() == null)
            .toList();
    if (activeRows.size() != 1) {
      throw new DataRetrievalFailureException(
          "Oracle permit invoice insert did not return exactly one active invoice.");
    }
    PermitInvoiceRow inserted = activeRows.get(0);
    requirePositiveGenerated(inserted.permitInvoiceNumber(), "Permit invoice number");
    if (!input.permitDetailNumber().equals(inserted.permitDetailNumber())) {
      throw new DataRetrievalFailureException(
          "Oracle permit invoice insert returned a different permit detail number.");
    }
    return inserted;
  }

  /**
   * Inserts one permit invoice detail and returns the complete cursor supplied by the legacy
   * procedure. The procedure returns every detail for the invoice, not only the newly inserted row.
   */
  public List<PermitInvoiceDetailRow> insertPermitInvoiceDetailRequired(
      PermitInvoiceDetailInsert input) {
    requireInput(input, "Permit invoice detail");
    requirePositive(input.permitInvoiceNumber(), "Permit invoice number");
    requireNonBlank(input.entryUserId(), "Entry user id");
    List<PermitInvoiceDetailRow> rows =
        queryCursorProcedureRequired(
            INSERT_PERMIT_INVOICE_DETAIL,
            cs -> {
              cs.setLong(1, input.permitInvoiceNumber());
              setStringOrNull(cs, 2, input.timberMark());
              setStringOrNull(cs, 3, input.speciesCode());
              setStringOrNull(cs, 4, input.gradeCode());
              setBigDecimalOrNull(cs, 5, input.volume());
              setBigDecimalOrNull(cs, 6, input.amount());
              setBigDecimalOrNull(cs, 7, input.amvRate());
              setBigDecimalOrNull(cs, 8, input.feePolicyAdmin());
              setBigDecimalOrNull(cs, 9, input.feePercentage());
              cs.setString(10, auditUserOrDefault(input.entryUserId()));
            },
            11,
            this::mapPermitInvoiceDetail);
    if (rows.isEmpty()) {
      throw new DataRetrievalFailureException(
          "Oracle permit invoice detail insert returned no rows.");
    }
    for (PermitInvoiceDetailRow row : rows) {
      requirePositiveGenerated(row.permitInvoiceDetailNumber(), "Permit invoice detail number");
      if (!input.permitInvoiceNumber().equals(row.permitInvoiceNumber())) {
        throw new DataRetrievalFailureException(
            "Oracle permit invoice detail insert returned a different permit invoice number.");
      }
    }
    return List.copyOf(rows);
  }

  public void updatePermitInvoiceRequired(PermitInvoiceUpdate input) {
    requireInput(input, "Permit invoice update");
    requirePositive(input.permitInvoiceNumber(), "Permit invoice number");
    requireNonBlank(input.cancelUserId(), "Cancel user id");
    executeProcedureRequired(
        UPDATE_PERMIT_INVOICE,
        cs -> {
          cs.setLong(1, input.permitInvoiceNumber());
          setStringOrNull(cs, 2, input.gbmsInvoiceNumber());
          cs.setString(3, auditUserOrDefault(input.cancelUserId()));
        });
  }

  private PermitInvoiceRow mapPermitInvoice(ResultSet rs) throws SQLException {
    return new PermitInvoiceRow(
        nullableLong(rs, "PERMIT_INVOICE_NUMBER"),
        nullableLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
        rs.getString("GBMS_INVOICE_NUMBER"),
        rs.getBigDecimal("INVOICE_TOTAL"),
        rs.getString("CLIENT_NUMBER"),
        rs.getString("CLIENT_LOCN_CODE"),
        rs.getBigDecimal("EXEMPTION_OVERRIDE_RATE"),
        rs.getBigDecimal("PERMIT_OVERRIDE_AMOUNT"),
        nullableLong(rs, "ORIGIN_ORG_NO"),
        nullableLong(rs, "ADMIN_ORG_NO"),
        rs.getString("ACK_MASK_ACODE"),
        toLocalDateTime(rs.getTimestamp("SUBMIT_TIMESTAMP")),
        toLocalDateTime(rs.getTimestamp("CANCEL_TIMESTAMP")),
        rs.getString("SUBMIT_USERID"),
        rs.getString("CANCEL_USERID"));
  }

  private PermitInvoiceDetailRow mapPermitInvoiceDetail(ResultSet rs) throws SQLException {
    return new PermitInvoiceDetailRow(
        nullableLong(rs, "PERMIT_INVOICE_DETAIL_NUMBER"),
        nullableLong(rs, "PERMIT_INVOICE_NUMBER"),
        rs.getString("TIMBER_MARK"),
        rs.getString("EXPORT_SPECIES_CODE"),
        rs.getString("EXPORT_GRADE_CODE"),
        rs.getBigDecimal("VOLUME"),
        rs.getBigDecimal("AMOUNT"),
        rs.getBigDecimal("AMV_RATE"),
        rs.getBigDecimal("FEE_POLICY_ADMIN"),
        rs.getBigDecimal("FEE_PERCENTAGE"));
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    BigDecimal value = rs.getBigDecimal(column);
    return value == null ? null : value.longValueExact();
  }

  private LocalDateTime toLocalDateTime(Timestamp value) {
    return value == null ? null : value.toLocalDateTime();
  }

  private String requiredGeneratedString(ResultSet rs, String column) throws SQLException {
    String value = rs.getString(column);
    if (value == null || value.isBlank()) {
      throw new DataRetrievalFailureException(
          "Oracle procedure returned a blank generated identifier in " + column + ".");
    }
    return value.trim();
  }

  private Long requiredGeneratedLong(ResultSet rs, String column) throws SQLException {
    Long value = nullableLong(rs, column);
    requirePositiveGenerated(value, column);
    return value;
  }

  private <T> T requireSingleResult(Optional<T> result, String description) {
    return result.orElseThrow(
        () ->
            new DataRetrievalFailureException(
                "Oracle " + description + " procedure returned no row."));
  }

  private void requireInput(Object input, String description) {
    if (input == null) {
      throw new IllegalArgumentException(description + " input is required.");
    }
  }

  private void requirePositive(Long value, String description) {
    if (value == null || value < 1) {
      throw new IllegalArgumentException(description + " must be positive.");
    }
  }

  private void requirePositiveGenerated(Long value, String description) {
    if (value == null || value < 1) {
      throw new DataRetrievalFailureException(
          "Oracle procedure returned an invalid generated " + description + ".");
    }
  }

  private void requireNonBlank(String value, String description) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(description + " is required.");
    }
  }

  private void setStringOrNull(CallableStatement cs, int index, String value)
      throws SQLException {
    if (value == null) {
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

  private void setBigDecimalOrNull(CallableStatement cs, int index, BigDecimal value)
      throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.NUMERIC);
    } else {
      cs.setBigDecimal(index, value);
    }
  }

  public record GbmsForestInvoiceInsert(
      String billingStatus,
      BigDecimal invoiceAmount,
      String invoiceTypeCode,
      String invoiceSubTypeCode,
      String invoiceClassCode,
      String relatedInvoiceNumber,
      String invoiceRelationshipTypeCode,
      String clientNumber,
      String clientLocationCode,
      String entryUserId) {}

  public record GbmsForestInvoiceRow(String invoiceNumber) {}

  public record GbmsGeneralInvoiceInsert(
      String invoiceNumber,
      Long originOrgNumber,
      Long adminOrgNumber,
      String forestFileId,
      String ministryReferenceNumber,
      String entryUserId) {}

  public record GbmsGeneralInvoiceRow(String invoiceNumber) {}

  public record GbmsInvoiceDetailInsert(
      String invoiceNumber,
      Long orgUnitNumber,
      BigDecimal numberOfUnits,
      String unitOfMeasureCode,
      BigDecimal unitRate,
      BigDecimal extendedAmount,
      String ocgSupplierNumber,
      String ackMaskAcode,
      String entryUserId,
      String lineItemDescription,
      String pstIndicator,
      String gstIndicator,
      String hstIndicator) {}

  public record GbmsInvoiceDetailRow(String invoiceNumber, Long lineItemNumber) {}

  public record GbmsNotationInsert(
      String invoiceNumber, String notationText, String internalIndicator, String entryUserId) {}

  public record GbmsNotationRow(String invoiceNumber, Long notationNumber) {}

  public record GbmsReplacementRow(
      String originalInvoiceNumber, String replacementInvoiceNumber) {}

  public record PermitInvoiceInsert(
      Long permitDetailNumber,
      String gbmsInvoiceNumber,
      BigDecimal invoiceTotal,
      String clientNumber,
      String clientLocationCode,
      BigDecimal exemptionOverrideRate,
      BigDecimal permitOverrideAmount,
      Long originOrgNumber,
      Long adminOrgNumber,
      String ackMaskAcode,
      String submitUserId) {}

  public record PermitInvoiceRow(
      Long permitInvoiceNumber,
      Long permitDetailNumber,
      String gbmsInvoiceNumber,
      BigDecimal invoiceTotal,
      String clientNumber,
      String clientLocationCode,
      BigDecimal exemptionOverrideRate,
      BigDecimal permitOverrideAmount,
      Long originOrgNumber,
      Long adminOrgNumber,
      String ackMaskAcode,
      LocalDateTime submitTimestamp,
      LocalDateTime cancelTimestamp,
      String submitUserId,
      String cancelUserId) {}

  public record PermitInvoiceDetailInsert(
      Long permitInvoiceNumber,
      String timberMark,
      String speciesCode,
      String gradeCode,
      BigDecimal volume,
      BigDecimal amount,
      BigDecimal amvRate,
      BigDecimal feePolicyAdmin,
      BigDecimal feePercentage,
      String entryUserId) {}

  public record PermitInvoiceDetailRow(
      Long permitInvoiceDetailNumber,
      Long permitInvoiceNumber,
      String timberMark,
      String speciesCode,
      String gradeCode,
      BigDecimal volume,
      BigDecimal amount,
      BigDecimal amvRate,
      BigDecimal feePolicyAdmin,
      BigDecimal feePercentage) {}

  public record PermitInvoiceUpdate(
      Long permitInvoiceNumber, String gbmsInvoiceNumber, String cancelUserId) {}
}

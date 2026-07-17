package ca.bc.gov.mof.lexis.repository.oracle;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Consumer;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Locks aggregate roots and calculates versions from their persisted child rows. */
@Repository
@Profile("oracle")
public class OracleAggregateLockRepository {

  private static final String LOCK_EXEMPTION =
      "SELECT * FROM EXPORT_EXEMPTION "
          + "WHERE EXEMPTION_NUMBER = ? FOR UPDATE WAIT 30";
  private static final String LOCK_APPLICATION =
      "SELECT * FROM EXPORT_EXEMPTION_APPLICATION "
          + "WHERE APPLICATION_NUMBER = ? FOR UPDATE WAIT 30";
  private static final String LOCK_PERMIT =
      "SELECT * FROM EXPORT_PERMIT_DETAIL "
          + "WHERE EXPORT_PERMIT_DETAIL_NUMBER = ? FOR UPDATE WAIT 30";
  private static final String LOCK_OFFER =
      "SELECT * FROM EXPORT_PURCHASE_OFFER "
          + "WHERE EXPORT_PURCHASE_OFFER_NUMBER = ? FOR UPDATE WAIT 30";
  private static final String FIND_EXEMPTION =
      "SELECT * FROM EXPORT_EXEMPTION WHERE EXEMPTION_NUMBER = ?";
  private static final String FIND_APPLICATION =
      "SELECT * FROM EXPORT_EXEMPTION_APPLICATION WHERE APPLICATION_NUMBER = ?";
  private static final String FIND_PERMIT =
      "SELECT * FROM EXPORT_PERMIT_DETAIL WHERE EXPORT_PERMIT_DETAIL_NUMBER = ?";
  private static final String FIND_OFFER =
      "SELECT * FROM EXPORT_PURCHASE_OFFER WHERE EXPORT_PURCHASE_OFFER_NUMBER = ?";

  private static final String APPLICATION_REMARKS =
      "SELECT r.* FROM EXPORT_EXEMPTION_APP_REMARKS r "
          + "WHERE r.APPLICATION_NUMBER = ? "
          + "ORDER BY r.APPLICATION_NUMBER, r.EXPORT_EXMPTN_APPL_REMARK_NMBR";
  private static final String APPLICATION_PACKAGES =
      "SELECT p.* FROM EXPORT_PACKAGE p WHERE p.APPLICATION_NUMBER = ? "
          + "ORDER BY p.PACKAGE_NUMBER";
  private static final String APPLICATION_END_USES =
      "SELECT e.* FROM EXPORT_EXMPTN_APPL_SPCS_ENDUSE e "
          + "WHERE e.APPLICATION_NUMBER = ? OR e.PACKAGE_NUMBER IN ("
          + "SELECT p.PACKAGE_NUMBER FROM EXPORT_PACKAGE p WHERE p.APPLICATION_NUMBER = ?) "
          + "ORDER BY e.APPLICATION_NUMBER NULLS FIRST, e.PACKAGE_NUMBER NULLS FIRST, "
          + "e.EXPORT_SPECIES_CODE, e.EXPORT_END_USE_CODE";
  private static final String APPLICATION_SCALES =
      "SELECT s.* FROM EXPORT_SCALE_DETAIL s "
          + "INNER JOIN EXPORT_PACKAGE p ON p.PACKAGE_NUMBER = s.PACKAGE_NUMBER "
          + "WHERE p.APPLICATION_NUMBER = ? ORDER BY s.EXPORT_SCALE_DETAIL_ID";
  private static final String APPLICATION_ATTACHMENTS =
      "SELECT a.EXPORT_ATTACHMENT_ID AS LINK_ATTACHMENT_ID, a.APPLICATION_NUMBER, "
          + "DBMS_LOB.GETLENGTH(a.EXPORT_EXEMPTION_FILE) AS CONTENT_LENGTH, "
          + "f.EXPORT_ATTACHMENT_ID, f.FILE_NAME, f.DESCRIPTION, f.EXPORT_FILE_TYPE_CODE, "
          + "f.EXPORT_ATTACHMENT_TYPE_CODE, f.EXPORT_FILE_MIME_TYPE_CODE, "
          + "f.ENTRY_USERID, f.ENTRY_TIMESTAMP, f.UPDATE_USERID, f.UPDATE_TIMESTAMP "
          + "FROM EXPORT_APPL_FILE_ATTCHMNT a "
          + "INNER JOIN EXPORT_FILE_ATTACHMENT f "
          + "ON f.EXPORT_ATTACHMENT_ID = a.EXPORT_ATTACHMENT_ID "
          + "WHERE a.APPLICATION_NUMBER = ? ORDER BY a.EXPORT_ATTACHMENT_ID";
  private static final String APPLICATION_FEDERAL_DETAILS =
      "SELECT f.* FROM EXPORT_FEDERAL_PERMIT_DETAIL f "
          + "INNER JOIN EXPORT_PACKAGE p "
          + "ON p.EXPORT_FED_PERMIT_DETAIL_ID = f.EXPORT_FED_PERMIT_DETAIL_ID "
          + "WHERE p.APPLICATION_NUMBER = ? ORDER BY f.EXPORT_FED_PERMIT_DETAIL_ID";
  private static final String APPLICATION_PERMITS =
      "SELECT p.* FROM EXPORT_PERMIT_DETAIL p WHERE p.OIC_APPLICATION_NUMBER = ? "
          + "ORDER BY p.EXPORT_PERMIT_DETAIL_NUMBER";
  private static final String APPLICATION_OFFERS =
      "SELECT o.* FROM EXPORT_PURCHASE_OFFER o WHERE o.APPLICATION_NUMBER = ? "
          + "ORDER BY o.EXPORT_PURCHASE_OFFER_NUMBER";

  private static final String EXEMPTION_RATE =
      "SELECT r.* FROM EXPORT_EXEMPTION_RATE r WHERE r.EXEMPTION_NUMBER = ? "
          + "ORDER BY r.EXEMPTION_NUMBER";
  private static final String EXEMPTION_ORG_UNITS =
      "SELECT o.* FROM OIC_EXEMPTION_ORG_UNIT o WHERE o.EXEMPTION_NUMBER = ? "
          + "ORDER BY o.EXEMPTION_NUMBER, o.ORG_UNIT_NO";
  private static final String EXEMPTION_ATTACHMENTS =
      "SELECT a.EXPORT_ATTACHMENT_ID AS LINK_ATTACHMENT_ID, a.EXEMPTION_NUMBER, "
          + "DBMS_LOB.GETLENGTH(a.EXPORT_EXEMPTION_FILE) AS CONTENT_LENGTH, "
          + "f.EXPORT_ATTACHMENT_ID, f.FILE_NAME, f.DESCRIPTION, f.EXPORT_FILE_TYPE_CODE, "
          + "f.EXPORT_ATTACHMENT_TYPE_CODE, f.EXPORT_FILE_MIME_TYPE_CODE, "
          + "f.ENTRY_USERID, f.ENTRY_TIMESTAMP, f.UPDATE_USERID, f.UPDATE_TIMESTAMP "
          + "FROM EXPORT_EXEMPT_FILE_ATTCHMNT a "
          + "INNER JOIN EXPORT_FILE_ATTACHMENT f "
          + "ON f.EXPORT_ATTACHMENT_ID = a.EXPORT_ATTACHMENT_ID "
          + "WHERE a.EXEMPTION_NUMBER = ? ORDER BY a.EXPORT_ATTACHMENT_ID";
  private static final String EXEMPTION_APPLICATIONS =
      "SELECT a.* FROM EXPORT_EXEMPTION_APPLICATION a WHERE a.EXEMPTION_NUMBER = ? "
          + "ORDER BY a.APPLICATION_NUMBER";
  private static final String EXEMPTION_PERMITS =
      "SELECT p.* FROM EXPORT_PERMIT_DETAIL p WHERE p.EXEMPTION_NUMBER = ? "
          + "ORDER BY p.EXPORT_PERMIT_DETAIL_NUMBER";

  private static final String PERMIT_END_USES =
      "SELECT e.* FROM EXPORT_PERMIT_APPL_SPCS_ENDUSE e "
          + "WHERE e.EXPORT_PERMIT_DETAIL_NUMBER = ? "
          + "ORDER BY e.EXPORT_PERMIT_DETAIL_NUMBER, e.EXPORT_SPECIES_CODE, "
          + "e.EXPORT_END_USE_CODE";
  private static final String PERMIT_SCALES =
      "SELECT s.* FROM EXPORT_SCALE_DETAIL s "
          + "WHERE s.EXPORT_PERMIT_DETAIL_NUMBER = ? ORDER BY s.EXPORT_SCALE_DETAIL_ID";
  private static final String PERMIT_ATTACHMENTS =
      "SELECT a.EXPORT_ATTACHMENT_ID AS LINK_ATTACHMENT_ID, "
          + "a.EXPORT_PERMIT_DETAIL_NUMBER, "
          + "DBMS_LOB.GETLENGTH(a.EXPORT_PERMIT_FILE) AS CONTENT_LENGTH, "
          + "f.EXPORT_ATTACHMENT_ID, f.FILE_NAME, f.DESCRIPTION, f.EXPORT_FILE_TYPE_CODE, "
          + "f.EXPORT_ATTACHMENT_TYPE_CODE, f.EXPORT_FILE_MIME_TYPE_CODE, "
          + "f.ENTRY_USERID, f.ENTRY_TIMESTAMP, f.UPDATE_USERID, f.UPDATE_TIMESTAMP "
          + "FROM EXPORT_PERMIT_FILE_ATTACHMENT a "
          + "INNER JOIN EXPORT_FILE_ATTACHMENT f "
          + "ON f.EXPORT_ATTACHMENT_ID = a.EXPORT_ATTACHMENT_ID "
          + "WHERE a.EXPORT_PERMIT_DETAIL_NUMBER = ? ORDER BY a.EXPORT_ATTACHMENT_ID";
  private static final String PERMIT_SALES_INVOICES =
      "SELECT i.* FROM EXPORT_SALES_INVOICE i "
          + "WHERE i.EXPORT_PERMIT_DETAIL_NUMBER = ? "
          + "ORDER BY i.EXPORT_SALES_INVOICE_NUMBER";
  private static final String PERMIT_SALES_INVOICE_ATTACHMENTS =
      "SELECT a.EXPORT_ATTACHMENT_ID AS LINK_ATTACHMENT_ID, "
          + "a.EXPORT_SALES_INVOICE_NUMBER, a.EXPORT_PERMIT_DETAIL_NUMBER, "
          + "DBMS_LOB.GETLENGTH(a.EXPORT_INVOICE_FILE) AS CONTENT_LENGTH, "
          + "f.EXPORT_ATTACHMENT_ID, f.FILE_NAME, f.DESCRIPTION, f.EXPORT_FILE_TYPE_CODE, "
          + "f.EXPORT_ATTACHMENT_TYPE_CODE, f.EXPORT_FILE_MIME_TYPE_CODE, "
          + "f.ENTRY_USERID, f.ENTRY_TIMESTAMP, f.UPDATE_USERID, f.UPDATE_TIMESTAMP "
          + "FROM EXPORT_SALES_INVCE_FILE_ATTACH a "
          + "INNER JOIN EXPORT_FILE_ATTACHMENT f "
          + "ON f.EXPORT_ATTACHMENT_ID = a.EXPORT_ATTACHMENT_ID "
          + "WHERE a.EXPORT_PERMIT_DETAIL_NUMBER = ? ORDER BY a.EXPORT_ATTACHMENT_ID";
  private static final String PERMIT_INVOICES =
      "SELECT i.* FROM EXPORT_PERMIT_INVOICE i "
          + "WHERE i.EXPORT_PERMIT_DETAIL_NUMBER = ? ORDER BY i.PERMIT_INVOICE_NUMBER";
  private static final String PERMIT_INVOICE_DETAILS =
      "SELECT d.* FROM EXPORT_PERMIT_INVOICE_DETAIL d "
          + "INNER JOIN EXPORT_PERMIT_INVOICE i "
          + "ON i.PERMIT_INVOICE_NUMBER = d.PERMIT_INVOICE_NUMBER "
          + "WHERE i.EXPORT_PERMIT_DETAIL_NUMBER = ? "
          + "ORDER BY d.PERMIT_INVOICE_DETAIL_NUMBER";
  private static final String PERMIT_PACKAGES =
      "SELECT p.* FROM EXPORT_PACKAGE p WHERE p.PACKAGE_NUMBER IN ("
          + "SELECT s.PACKAGE_NUMBER FROM EXPORT_SCALE_DETAIL s "
          + "WHERE s.EXPORT_PERMIT_DETAIL_NUMBER = ?) "
          + "OR p.APPLICATION_NUMBER = (SELECT d.OIC_APPLICATION_NUMBER "
          + "FROM EXPORT_PERMIT_DETAIL d WHERE d.EXPORT_PERMIT_DETAIL_NUMBER = ?) "
          + "ORDER BY p.PACKAGE_NUMBER";
  private static final String PERMIT_PACKAGE_END_USES =
      "SELECT e.* FROM EXPORT_EXMPTN_APPL_SPCS_ENDUSE e WHERE e.PACKAGE_NUMBER IN ("
          + "SELECT p.PACKAGE_NUMBER FROM EXPORT_PACKAGE p WHERE p.PACKAGE_NUMBER IN ("
          + "SELECT s.PACKAGE_NUMBER FROM EXPORT_SCALE_DETAIL s "
          + "WHERE s.EXPORT_PERMIT_DETAIL_NUMBER = ?) "
          + "OR p.APPLICATION_NUMBER = (SELECT d.OIC_APPLICATION_NUMBER "
          + "FROM EXPORT_PERMIT_DETAIL d WHERE d.EXPORT_PERMIT_DETAIL_NUMBER = ?)) "
          + "OR e.APPLICATION_NUMBER = (SELECT d.OIC_APPLICATION_NUMBER "
          + "FROM EXPORT_PERMIT_DETAIL d WHERE d.EXPORT_PERMIT_DETAIL_NUMBER = ?) "
          + "ORDER BY e.APPLICATION_NUMBER NULLS FIRST, e.PACKAGE_NUMBER NULLS FIRST, "
          + "e.EXPORT_SPECIES_CODE, e.EXPORT_END_USE_CODE";

  private final JdbcTemplate jdbcTemplate;

  public OracleAggregateLockRepository(
      @Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Optional<RootRecordSnapshot> lockExemption(String exemptionNumber) {
    return readExemption(LOCK_EXEMPTION, exemptionNumber);
  }

  public Optional<RootRecordSnapshot> lockApplication(Long applicationNumber) {
    return readApplication(LOCK_APPLICATION, applicationNumber);
  }

  public Optional<RootRecordSnapshot> lockPermit(Long permitNumber) {
    return readPermit(LOCK_PERMIT, permitNumber);
  }

  public Optional<RootRecordSnapshot> lockOffer(Long offerNumber) {
    return readRootOnly(LOCK_OFFER, "EXPORT_PURCHASE_OFFER", offerNumber);
  }

  public Optional<RootRecordSnapshot> findExemptionVersion(String exemptionNumber) {
    return readExemption(FIND_EXEMPTION, exemptionNumber);
  }

  public Optional<RootRecordSnapshot> findApplicationVersion(Long applicationNumber) {
    return readApplication(FIND_APPLICATION, applicationNumber);
  }

  public Optional<RootRecordSnapshot> findPermitVersion(Long permitNumber) {
    return readPermit(FIND_PERMIT, permitNumber);
  }

  public Optional<RootRecordSnapshot> findOfferVersion(Long offerNumber) {
    return readRootOnly(FIND_OFFER, "EXPORT_PURCHASE_OFFER", offerNumber);
  }

  private Optional<RootRecordSnapshot> readApplication(String rootSql, Long applicationNumber) {
    return readAggregate(
        rootSql,
        "EXPORT_EXEMPTION_APPLICATION",
        applicationNumber,
        rowSets -> {
          rowSets.add(
              readRows(
                  "EXPORT_EXEMPTION_APP_REMARKS",
                  APPLICATION_REMARKS,
                  applicationNumber));
          rowSets.add(readRows("EXPORT_PACKAGE", APPLICATION_PACKAGES, applicationNumber));
          rowSets.add(
              readRows(
                  "EXPORT_EXMPTN_APPL_SPCS_ENDUSE",
                  APPLICATION_END_USES,
                  applicationNumber,
                  applicationNumber));
          rowSets.add(readRows("EXPORT_SCALE_DETAIL", APPLICATION_SCALES, applicationNumber));
          rowSets.add(
              readRows("EXPORT_APPL_FILE_ATTCHMNT", APPLICATION_ATTACHMENTS, applicationNumber));
          rowSets.add(
              readRows(
                  "EXPORT_FEDERAL_PERMIT_DETAIL",
                  APPLICATION_FEDERAL_DETAILS,
                  applicationNumber));
          rowSets.add(readRows("EXPORT_PERMIT_DETAIL", APPLICATION_PERMITS, applicationNumber));
          rowSets.add(readRows("EXPORT_PURCHASE_OFFER", APPLICATION_OFFERS, applicationNumber));
        });
  }

  private Optional<RootRecordSnapshot> readExemption(String rootSql, String exemptionNumber) {
    return readAggregate(
        rootSql,
        "EXPORT_EXEMPTION",
        exemptionNumber,
        rowSets -> {
          rowSets.add(readRows("EXPORT_EXEMPTION_RATE", EXEMPTION_RATE, exemptionNumber));
          rowSets.add(readRows("OIC_EXEMPTION_ORG_UNIT", EXEMPTION_ORG_UNITS, exemptionNumber));
          rowSets.add(
              readRows("EXPORT_EXEMPT_FILE_ATTCHMNT", EXEMPTION_ATTACHMENTS, exemptionNumber));
          rowSets.add(
              readRows(
                  "EXPORT_EXEMPTION_APPLICATION",
                  EXEMPTION_APPLICATIONS,
                  exemptionNumber));
          rowSets.add(readRows("EXPORT_PERMIT_DETAIL", EXEMPTION_PERMITS, exemptionNumber));
        });
  }

  private Optional<RootRecordSnapshot> readPermit(String rootSql, Long permitNumber) {
    return readAggregate(
        rootSql,
        "EXPORT_PERMIT_DETAIL",
        permitNumber,
        rowSets -> {
          rowSets.add(readRows("EXPORT_PERMIT_APPL_SPCS_ENDUSE", PERMIT_END_USES, permitNumber));
          rowSets.add(readRows("EXPORT_SCALE_DETAIL", PERMIT_SCALES, permitNumber));
          rowSets.add(
              readRows("EXPORT_PERMIT_FILE_ATTACHMENT", PERMIT_ATTACHMENTS, permitNumber));
          rowSets.add(readRows("EXPORT_SALES_INVOICE", PERMIT_SALES_INVOICES, permitNumber));
          rowSets.add(
              readRows(
                  "EXPORT_SALES_INVCE_FILE_ATTACH",
                  PERMIT_SALES_INVOICE_ATTACHMENTS,
                  permitNumber));
          rowSets.add(readRows("EXPORT_PERMIT_INVOICE", PERMIT_INVOICES, permitNumber));
          rowSets.add(
              readRows("EXPORT_PERMIT_INVOICE_DETAIL", PERMIT_INVOICE_DETAILS, permitNumber));
          rowSets.add(readRows("EXPORT_PACKAGE", PERMIT_PACKAGES, permitNumber, permitNumber));
          rowSets.add(
              readRows(
                  "EXPORT_EXMPTN_APPL_SPCS_ENDUSE",
                  PERMIT_PACKAGE_END_USES,
                  permitNumber,
                  permitNumber,
                  permitNumber));
        });
  }

  private Optional<RootRecordSnapshot> readRootOnly(
      String rootSql, String rootName, Object identifier) {
    return readAggregate(rootSql, rootName, identifier, ignored -> {});
  }

  private Optional<RootRecordSnapshot> readAggregate(
      String rootSql,
      String rootName,
      Object identifier,
      Consumer<List<RowSetSnapshot>> childReader) {
    List<RowSnapshot> roots = jdbcTemplate.query(rootSql, this::readRow, identifier);
    if (roots.isEmpty()) {
      return Optional.empty();
    }

    List<RowSetSnapshot> rowSets = new ArrayList<>();
    rowSets.add(new RowSetSnapshot(rootName, roots));
    childReader.accept(rowSets);

    LastSaved lastSaved = latestSaved(rowSets);
    return Optional.of(
        new RootRecordSnapshot(
            fingerprint(rowSets), lastSaved.savedAt(), lastSaved.updatedBy()));
  }

  private RowSetSnapshot readRows(String name, String sql, Object... arguments) {
    return new RowSetSnapshot(name, jdbcTemplate.query(sql, this::readRow, arguments));
  }

  private RowSnapshot readRow(ResultSet resultSet, int rowNumber) throws SQLException {
    ResultSetMetaData metadata = resultSet.getMetaData();
    List<ColumnSnapshot> columns = new ArrayList<>(metadata.getColumnCount());
    Instant entryTimestamp = null;
    Instant updateTimestamp = null;
    String entryUser = null;
    String updateUser = null;

    for (int index = 1; index <= metadata.getColumnCount(); index++) {
      String label = metadata.getColumnLabel(index).toUpperCase(Locale.ROOT);
      columns.add(new ColumnSnapshot(label, scalarValue(resultSet, metadata, index)));
      if ("ENTRY_TIMESTAMP".equals(label)) {
        entryTimestamp = timestamp(resultSet, index);
      } else if ("UPDATE_TIMESTAMP".equals(label)) {
        updateTimestamp = timestamp(resultSet, index);
      } else if ("ENTRY_USERID".equals(label)) {
        entryUser = resultSet.getString(index);
      } else if ("UPDATE_USERID".equals(label)) {
        updateUser = resultSet.getString(index);
      }
    }

    return new RowSnapshot(
        List.copyOf(columns),
        updateTimestamp == null ? entryTimestamp : updateTimestamp,
        updateUser == null || updateUser.isBlank() ? entryUser : updateUser);
  }

  private String scalarValue(ResultSet resultSet, ResultSetMetaData metadata, int index)
      throws SQLException {
    return switch (metadata.getColumnType(index)) {
      case Types.NUMERIC, Types.DECIMAL -> {
        var value = resultSet.getBigDecimal(index);
        yield value == null ? null : value.stripTrailingZeros().toPlainString();
      }
      case Types.DATE, Types.TIMESTAMP -> {
        Timestamp value = resultSet.getTimestamp(index);
        yield value == null ? null : value.toLocalDateTime().toString();
      }
      case Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY -> {
        byte[] value = resultSet.getBytes(index);
        yield value == null ? null : HexFormat.of().formatHex(value);
      }
      case Types.BLOB ->
          throw new IllegalStateException(
              "Aggregate version queries must represent BLOBs by metadata and length.");
      default -> resultSet.getString(index);
    };
  }

  private Instant timestamp(ResultSet resultSet, int index) throws SQLException {
    Timestamp value = resultSet.getTimestamp(index);
    return value == null ? null : value.toInstant();
  }

  private LastSaved latestSaved(List<RowSetSnapshot> rowSets) {
    Instant savedAt = null;
    String updatedBy = null;
    for (RowSetSnapshot rowSet : rowSets) {
      for (RowSnapshot row : rowSet.rows()) {
        if (row.savedAt() != null && (savedAt == null || row.savedAt().isAfter(savedAt))) {
          savedAt = row.savedAt();
          updatedBy = row.updatedBy();
        }
      }
    }
    return new LastSaved(savedAt, updatedBy);
  }

  static String fingerprint(List<RowSetSnapshot> rowSets) {
    MessageDigest digest = sha256();
    for (RowSetSnapshot rowSet : rowSets) {
      updateDigest(digest, "TABLE");
      updateDigest(digest, rowSet.name());
      updateDigest(digest, Integer.toString(rowSet.rows().size()));
      for (RowSnapshot row : rowSet.rows()) {
        updateDigest(digest, "ROW");
        updateDigest(digest, Integer.toString(row.columns().size()));
        for (ColumnSnapshot column : row.columns()) {
          updateDigest(digest, column.name());
          updateDigest(digest, column.value());
        }
      }
    }
    return HexFormat.of().formatHex(digest.digest());
  }

  private static void updateDigest(MessageDigest digest, String value) {
    if (value == null) {
      digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(-1).array());
      return;
    }
    byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
    digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(bytes.length).array());
    digest.update(bytes);
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is unavailable.", exception);
    }
  }

  static record RowSetSnapshot(String name, List<RowSnapshot> rows) {}

  static record RowSnapshot(
      List<ColumnSnapshot> columns, Instant savedAt, String updatedBy) {}

  static record ColumnSnapshot(String name, String value) {}

  private record LastSaved(Instant savedAt, String updatedBy) {}

  public record RootRecordSnapshot(String fingerprint, Instant savedAt, String updatedBy) {}
}

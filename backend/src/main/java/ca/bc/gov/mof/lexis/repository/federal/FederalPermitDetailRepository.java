package ca.bc.gov.mof.lexis.repository.federal;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.CallableStatement;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class FederalPermitDetailRepository extends OracleRepositorySupport {

  private static final String INSERT_FEDERAL_PERMIT =
      LEXIS_GROUP_3_PACKAGE + "INSERT_FEDERAL_PERMIT(?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

  public FederalPermitDetailRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public Optional<FederalPermitDetailRow> insertFederalPermitDetail(
      FederalPermitDetailRecord record) {
    if (record == null || trim(record.entryUserId()) == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        INSERT_FEDERAL_PERMIT,
        cs -> bindInsert(cs, record),
        14,
        this::mapFederalPermitDetailRow);
  }

  private void bindInsert(CallableStatement cs, FederalPermitDetailRecord record)
      throws SQLException {
    setDateOrNull(cs, 1, record.permitIssueDate());
    setDateOrNull(cs, 2, record.estimatedShippingDate());
    cs.setString(3, trim(record.otherPortOfExport()));
    cs.setString(4, trim(record.transportName()));
    cs.setString(5, auditUserOrDefault(record.entryUserId()));
    cs.setTimestamp(6, Timestamp.from(Instant.now()));
    cs.setString(7, trim(record.transportTypeCode()));
    cs.setString(8, trim(record.countryCode()));
    cs.setString(9, trim(record.portOfExportCode()));
    setDateOrNull(cs, 10, record.applicationDate());
    setLongOrNull(cs, 11, record.orgUnitNumber());
    cs.setString(12, trim(record.clientLocationCode()));
    cs.setString(13, trim(record.clientNumber()));
  }

  private FederalPermitDetailRow mapFederalPermitDetailRow(ResultSet rs) {
    return new FederalPermitDetailRow(
        parsePermitNumber(rs),
        getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
        getLocalDate(rs, "ESTIMATED_SHIPPING_DATE"),
        getString(rs, "EXPORT_COUNTRY_CODE"),
        getString(rs, "EXPORT_TRANSPORT_TYPE_CODE"),
        getString(rs, "TRANSPORT_NAME"),
        getString(rs, "EXPORT_PORT_OF_EXPORT_CODE"),
        getString(rs, "OTHER_PORT_OF_EXPORT"),
        getLocalDate(rs, "APPLICATION_DATE"),
        getLong(rs, "ORG_UNIT_NO"),
        getString(rs, "CLIENT_LOCN_CODE"),
        getString(rs, "CLIENT_NUMBER"));
  }

  private Long parsePermitNumber(ResultSet rs) {
    Long permitNumber = getLong(rs, "EXPORT_FED_PERMIT_DETAIL_ID");
    if (permitNumber != null) {
      return permitNumber;
    }
    String asString = getString(rs, "EXPORT_FED_PERMIT_DETAIL_ID");
    if (asString == null) {
      return null;
    }
    try {
      return Long.parseLong(asString);
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private void setDateOrNull(CallableStatement cs, int index, LocalDate value)
      throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.DATE);
    } else {
      cs.setDate(index, Date.valueOf(value));
    }
  }

  private void setLongOrNull(CallableStatement cs, int index, Long value)
      throws SQLException {
    if (value == null || value < 1) {
      cs.setNull(index, Types.NUMERIC);
    } else {
      cs.setLong(index, value);
    }
  }

  public record FederalPermitDetailRecord(
      LocalDate permitIssueDate,
      LocalDate estimatedShippingDate,
      String otherPortOfExport,
      String transportName,
      String entryUserId,
      String transportTypeCode,
      String countryCode,
      String portOfExportCode,
      LocalDate applicationDate,
      Long orgUnitNumber,
      String clientLocationCode,
      String clientNumber) {}

  public record FederalPermitDetailRow(
      Long permitNumber,
      LocalDate permitIssueDate,
      LocalDate estimatedShippingDate,
      String countryCode,
      String transportTypeCode,
      String transportName,
      String portOfExportCode,
      String otherPortOfExport,
      LocalDate applicationDate,
      Long orgUnitNumber,
      String clientLocationCode,
      String clientNumber) {}
}

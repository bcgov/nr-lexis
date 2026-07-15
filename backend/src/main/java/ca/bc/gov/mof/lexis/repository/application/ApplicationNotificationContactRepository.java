package ca.bc.gov.mof.lexis.repository.application;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.Types;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ApplicationNotificationContactRepository extends OracleRepositorySupport {

  private static final String PACKAGE = "THE.LEXIS_NOTIFY_CONTACTS.";
  private static final String FIND_CONTACT =
      PACKAGE + "FIND_APPL_NOTIFY_CONTACT(?,?,?,?)";
  private static final String INSERT_CONTACT =
      PACKAGE + "INSERT_APPL_NOTIFY_CONTACT(?,?,?,?,?,?,?,?,?,?)";

  public ApplicationNotificationContactRepository(
      @Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public Optional<NotificationContactRow> findForCurrentOwner(
      Long applicationNumber, String ownerClientNumber, String ownerClientLocationCode) {
    if (applicationNumber == null
        || applicationNumber < 1
        || ownerClientNumber == null
        || ownerClientLocationCode == null) {
      return Optional.empty();
    }
    return queryCursorSingleFailClosed(
        FIND_CONTACT,
        cs -> {
          cs.setLong(1, applicationNumber);
          cs.setString(2, ownerClientNumber);
          cs.setString(3, ownerClientLocationCode);
        },
        4,
        this::mapContact);
  }

  public Optional<NotificationContactRow> insert(InsertContactRecord record) {
    if (record == null) {
      return Optional.empty();
    }
    return queryCursorSingleRequired(
        INSERT_CONTACT,
        cs -> {
          cs.setLong(1, record.applicationNumber());
          cs.setString(2, record.emailAddress());
          cs.setString(3, record.emailSourceCode());
          if (record.emailVerified() == null) {
            cs.setNull(4, Types.VARCHAR);
          } else {
            cs.setString(4, record.emailVerified() ? "Y" : "N");
          }
          cs.setString(5, record.identityProviderCode());
          cs.setString(6, record.identityUserId());
          cs.setString(7, record.clientNumber());
          cs.setString(8, record.clientLocationCode());
          cs.setString(9, auditUserOrDefault(record.updateUserId()));
        },
        10,
        this::mapContact);
  }

  private NotificationContactRow mapContact(java.sql.ResultSet rs) throws SQLException {
    return new NotificationContactRow(
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "EMAIL_ADDRESS"),
        getString(rs, "EMAIL_SOURCE_CODE"),
        toBoolean(getString(rs, "EMAIL_VERIFIED_IND")),
        getString(rs, "IDENTITY_PROVIDER_CODE"),
        getString(rs, "IDENTITY_USER_ID"),
        getString(rs, "OWNER_CLIENT_NUMBER"),
        getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
        getString(rs, "ENTRY_USERID"),
        toInstant(rs.getTimestamp("ENTRY_TIMESTAMP")));
  }

  private Instant toInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }

  private Boolean toBoolean(String value) {
    if (value == null) {
      return null;
    }
    return "Y".equalsIgnoreCase(value.trim()) ? Boolean.TRUE : Boolean.FALSE;
  }

  public record InsertContactRecord(
      Long applicationNumber,
      String emailAddress,
      String emailSourceCode,
      Boolean emailVerified,
      String identityProviderCode,
      String identityUserId,
      String clientNumber,
      String clientLocationCode,
      String updateUserId) {}

  public record NotificationContactRow(
      Long applicationNumber,
      String emailAddress,
      String emailSourceCode,
      Boolean emailVerified,
      String identityProviderCode,
      String identityUserId,
      String clientNumber,
      String clientLocationCode,
      String entryUserId,
      java.time.Instant entryTimestamp) {}
}

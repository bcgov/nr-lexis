package ca.bc.gov.mof.lexis.repository.client;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ClientLookupRepository extends OracleRepositorySupport {

  private static final String FIND_CLIENT_LOCATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_CLIENT_LOCATION(?,?,?)";
  private static final String FIND_CLIENT_LOCATIONS =
      LEXIS_GROUP_5_PACKAGE + "FIND_CLIENT_LOCATIONS(?,?)";
  private static final String FIND_CONTACTS_BY_LOCATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_CONTACTS_BY_LOCATION(?,?,?)";

  public ClientLookupRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public Optional<ClientLocationRow> findLocationByClientNumberCode(
      String clientNumber, String locationCode) {
    String normalizedClientNumber = trim(clientNumber);
    String normalizedLocationCode = trim(locationCode);
    if (normalizedClientNumber == null || normalizedLocationCode == null) {
      return Optional.empty();
    }

    return queryCursorSingleFailClosed(
        FIND_CLIENT_LOCATION,
        cs -> {
          cs.setString(1, normalizedClientNumber);
          cs.setString(2, normalizedLocationCode);
        },
        3,
        rs ->
            new ClientLocationRow(
                getString(rs, "CLIENT_NUMBER"),
                getString(rs, "CLIENT_LOCN_CODE"),
                getString(rs, "CLIENT_LOCN_NAME"),
                getString(rs, "COMPANY_NAME"),
                getString(rs, "ADDRESS_1"),
                getString(rs, "ADDRESS_2"),
                getString(rs, "ADDRESS_3"),
                getString(rs, "CITY"),
                getString(rs, "PROVINCE"),
                getString(rs, "POSTAL_CODE"),
                getString(rs, "COUNTRY"),
                getString(rs, "BUSINESS_PHONE"),
                getString(rs, "FAX_NUMBER"),
                getString(rs, "EMAIL_ADDRESS")));
  }

  public Optional<ClientLocationRow> findLocationByClientNumberCodeRequired(
      String clientNumber, String locationCode) {
    String normalizedClientNumber = trim(clientNumber);
    String normalizedLocationCode = trim(locationCode);
    if (normalizedClientNumber == null || normalizedLocationCode == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_CLIENT_LOCATION,
        cs -> {
          cs.setString(1, normalizedClientNumber);
          cs.setString(2, normalizedLocationCode);
        },
        3,
        rs ->
            new ClientLocationRow(
                getString(rs, "CLIENT_NUMBER"),
                getString(rs, "CLIENT_LOCN_CODE"),
                getString(rs, "CLIENT_LOCN_NAME"),
                getString(rs, "COMPANY_NAME"),
                getString(rs, "ADDRESS_1"),
                getString(rs, "ADDRESS_2"),
                getString(rs, "ADDRESS_3"),
                getString(rs, "CITY"),
                getString(rs, "PROVINCE"),
                getString(rs, "POSTAL_CODE"),
                getString(rs, "COUNTRY"),
                getString(rs, "BUSINESS_PHONE"),
                getString(rs, "FAX_NUMBER"),
                getString(rs, "EMAIL_ADDRESS")));
  }

  public List<ClientLocationRow> findLocationsByClientNumber(String clientNumber) {
    String normalizedClientNumber = trim(clientNumber);
    if (normalizedClientNumber == null) {
      return List.of();
    }

    return queryCursorProcedureFailClosed(
        FIND_CLIENT_LOCATIONS,
        cs -> cs.setString(1, normalizedClientNumber),
        2,
        rs ->
            new ClientLocationRow(
                getString(rs, "CLIENT_NUMBER"),
                getString(rs, "CLIENT_LOCN_CODE"),
                getString(rs, "CLIENT_LOCN_NAME"),
                getString(rs, "COMPANY_NAME"),
                getString(rs, "ADDRESS_1"),
                getString(rs, "ADDRESS_2"),
                getString(rs, "ADDRESS_3"),
                getString(rs, "CITY"),
                getString(rs, "PROVINCE"),
                getString(rs, "POSTAL_CODE"),
                getString(rs, "COUNTRY"),
                getString(rs, "BUSINESS_PHONE"),
                getString(rs, "FAX_NUMBER"),
                getString(rs, "EMAIL_ADDRESS")));
  }

  public List<ClientContactRow> findContactsByClientNumberCode(
      String clientNumber, String locationCode) {
    String normalizedClientNumber = trim(clientNumber);
    String normalizedLocationCode = trim(locationCode);
    if (normalizedClientNumber == null || normalizedLocationCode == null) {
      return List.of();
    }

    return queryCursorProcedureFailClosed(
        FIND_CONTACTS_BY_LOCATION,
        cs -> {
          cs.setString(1, normalizedClientNumber);
          cs.setString(2, normalizedLocationCode);
        },
        3,
        rs -> new ClientContactRow(getString(rs, "CONTACT_NAME"), getString(rs, "CLIENT_CONTACT_ID")));
  }

  public record ClientLocationRow(
      String clientNumber,
      String clientLocationCode,
      String clientLocationName,
      String companyName,
      String address1,
      String address2,
      String address3,
      String city,
      String province,
      String postalCode,
      String country,
      String businessPhone,
      String faxNumber,
      String emailAddress) {}

  public record ClientContactRow(String contactName, String contactId) {}
}

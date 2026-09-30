package ca.bc.gov.mof.lexis.repository.client;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.ResultSet;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ClientLookupRepository extends OracleRepositorySupport {

  // Replaces LEXIS_GROUP_5.FIND_CLIENT_LOCATION: the same location and client join, plus the
  // client acronym shown with the client name.
  private static final String FIND_CLIENT_LOCATION =
      """
      SELECT L.CLIENT_NUMBER,
             L.CLIENT_LOCN_CODE,
             L.CLIENT_LOCN_NAME,
             FC.CLIENT_NAME AS COMPANY_NAME,
             L.ADDRESS_1,
             L.ADDRESS_2,
             L.ADDRESS_3,
             L.CITY,
             L.PROVINCE,
             L.POSTAL_CODE,
             L.COUNTRY,
             L.BUSINESS_PHONE,
             L.FAX_NUMBER,
             L.EMAIL_ADDRESS,
             CA.CLIENT_ACRONYM
      FROM THE.CLIENT_LOCATION L
      LEFT JOIN THE.V_CLIENT_PUBLIC FC ON FC.CLIENT_NUMBER = L.CLIENT_NUMBER
      LEFT JOIN THE.CLIENT_ACRONYM CA ON CA.CLIENT_NUMBER = L.CLIENT_NUMBER
      WHERE L.CLIENT_NUMBER = ?
        AND L.CLIENT_LOCN_CODE = ?
      """;
  private static final String FIND_CLIENT_LOCATIONS =
      LEXIS_GROUP_5_PACKAGE + "FIND_CLIENT_LOCATIONS(?,?)";
  private static final String FIND_CONTACTS_BY_LOCATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_CONTACTS_BY_LOCATION(?,?,?)";
  private static final int MINIMUM_CLIENT_SEARCH_LENGTH = 3;
  private static final int MAXIMUM_CLIENT_SEARCH_LENGTH = 60;
  private static final int CLIENT_NUMBER_LENGTH = 8;
  private static final Pattern NUMERIC_SEARCH_TERM = Pattern.compile("[0-9]+");
  // MATCH_RANK keeps exact acronym matches ahead of name-prefix matches within the row limit.
  private static final String FIND_CLIENT_SUGGESTIONS =
      """
      SELECT CLIENT_NUMBER,
             COMPANY_NAME,
             CLIENT_ACRONYM
      FROM (
        SELECT FC.CLIENT_NUMBER,
               TRIM(
                 DECODE(
                   TRIM(FC.LEGAL_FIRST_NAME),
                   NULL,
                   FC.CLIENT_NAME,
                   FC.CLIENT_NAME
                     || ', '
                     || TRIM(FC.LEGAL_FIRST_NAME)
                     || ' '
                     || TRIM(FC.LEGAL_MIDDLE_NAME))) AS COMPANY_NAME,
               COALESCE(
                 (SELECT MIN(CA.CLIENT_ACRONYM)
                  FROM THE.CLIENT_ACRONYM CA
                  WHERE CA.CLIENT_NUMBER = FC.CLIENT_NUMBER
                    AND ? = 0
                    AND UPPER(CA.CLIENT_ACRONYM) LIKE UPPER(?) || '%' ESCAPE '\\'),
                 (SELECT MIN(CA.CLIENT_ACRONYM)
                  FROM THE.CLIENT_ACRONYM CA
                  WHERE CA.CLIENT_NUMBER = FC.CLIENT_NUMBER)) AS CLIENT_ACRONYM,
               CASE
                 WHEN ? = 0 AND EXISTS (
                   SELECT 1
                   FROM THE.CLIENT_ACRONYM CA
                   WHERE CA.CLIENT_NUMBER = FC.CLIENT_NUMBER
                     AND UPPER(CA.CLIENT_ACRONYM) = UPPER(?)
                 ) THEN 0
                 ELSE 1
               END AS MATCH_RANK
        FROM THE.V_CLIENT_PUBLIC FC
        WHERE (
          (? = 1 AND FC.CLIENT_NUMBER = LPAD(?, 8, '0'))
          OR
          (? = 0 AND (
            UPPER(FC.CLIENT_NAME) LIKE UPPER(?) || '%' ESCAPE '\\'
            OR EXISTS (
              SELECT 1
              FROM THE.CLIENT_ACRONYM CA
              WHERE CA.CLIENT_NUMBER = FC.CLIENT_NUMBER
                AND UPPER(CA.CLIENT_ACRONYM) LIKE UPPER(?) || '%' ESCAPE '\\'
            )
          ))
        )
        AND (? IS NULL OR FC.CLIENT_NUMBER = ?)
        AND (
          ? = 0
          OR EXISTS (
            SELECT 1
            FROM THE.EXPORT_EXEMPTION_APPLICATION EEA
            WHERE EEA.EXPORT_JURISDICTION_CODE = 'F'
              AND (
                EEA.OWNER_CLIENT_NUMBER = FC.CLIENT_NUMBER
                OR EEA.AGENT_CLIENT_NUMBER = FC.CLIENT_NUMBER
              )
          )
        )
        ORDER BY MATCH_RANK, UPPER(FC.CLIENT_NAME), FC.CLIENT_NUMBER
      )
      WHERE ROWNUM <= 15
      """;

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

    return queryDirectFailClosed(
            FIND_CLIENT_LOCATION,
            this::mapClientLocation,
            normalizedClientNumber,
            normalizedLocationCode)
        .stream()
        .findFirst();
  }

  public Optional<ClientLocationRow> findLocationByClientNumberCodeRequired(
      String clientNumber, String locationCode) {
    String normalizedClientNumber = trim(clientNumber);
    String normalizedLocationCode = trim(locationCode);
    if (normalizedClientNumber == null || normalizedLocationCode == null) {
      return Optional.empty();
    }

    return queryDirectRequired(
            FIND_CLIENT_LOCATION,
            this::mapClientLocation,
            normalizedClientNumber,
            normalizedLocationCode)
        .stream()
        .findFirst();
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
                getString(rs, "EMAIL_ADDRESS"),
                null));
  }

  private ClientLocationRow mapClientLocation(ResultSet rs) {
    return new ClientLocationRow(
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
        getString(rs, "EMAIL_ADDRESS"),
        getString(rs, "CLIENT_ACRONYM"));
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

  public List<ClientSuggestionRow> findClientSuggestions(
      String searchTerm, boolean federalOnly, String allowedClientNumber) {
    String normalizedSearchTerm = trim(searchTerm);
    String normalizedAllowedClientNumber = trim(allowedClientNumber);
    if (!isSearchableClientTerm(normalizedSearchTerm)) {
      return List.of();
    }

    boolean numericSearchTerm = NUMERIC_SEARCH_TERM.matcher(normalizedSearchTerm).matches();
    String escapedSearchTerm = escapeLike(normalizedSearchTerm);
    return jdbcTemplate.query(
        FIND_CLIENT_SUGGESTIONS,
        ps -> {
          int parameterIndex = 1;
          ps.setInt(parameterIndex++, numericSearchTerm ? 1 : 0);
          ps.setString(parameterIndex++, escapedSearchTerm);
          ps.setInt(parameterIndex++, numericSearchTerm ? 1 : 0);
          ps.setString(parameterIndex++, normalizedSearchTerm);
          ps.setInt(parameterIndex++, numericSearchTerm ? 1 : 0);
          ps.setString(parameterIndex++, normalizedSearchTerm);
          ps.setInt(parameterIndex++, numericSearchTerm ? 1 : 0);
          ps.setString(parameterIndex++, escapedSearchTerm);
          ps.setString(parameterIndex++, escapedSearchTerm);
          ps.setString(parameterIndex++, normalizedAllowedClientNumber);
          ps.setString(parameterIndex++, normalizedAllowedClientNumber);
          ps.setInt(parameterIndex, federalOnly ? 1 : 0);
        },
        (rs, rowNumber) ->
            new ClientSuggestionRow(
                trim(rs.getString("CLIENT_NUMBER")),
                trim(rs.getString("COMPANY_NAME")),
                trim(rs.getString("CLIENT_ACRONYM"))));
  }

  private static boolean isSearchableClientTerm(String searchTerm) {
    if (searchTerm == null
        || searchTerm.length() < MINIMUM_CLIENT_SEARCH_LENGTH
        || searchTerm.length() > MAXIMUM_CLIENT_SEARCH_LENGTH) {
      return false;
    }
    return !NUMERIC_SEARCH_TERM.matcher(searchTerm).matches()
        || searchTerm.length() <= CLIENT_NUMBER_LENGTH;
  }

  private static String escapeLike(String searchTerm) {
    return searchTerm.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
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
      String emailAddress,
      String clientAcronym) {}

  public record ClientContactRow(String contactName, String contactId) {}

  public record ClientSuggestionRow(String clientNumber, String companyName, String clientAcronym) {}
}

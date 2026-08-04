package ca.bc.gov.mof.lexis.repository.federal;

import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationOfferDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.IncorrectResultSizeDataAccessException;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class FederalApplicationRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_APPLICATION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";

  private static final String FEDERAL_APPLICATION_SEARCH_SOURCE =
      """
      (
        SELECT
          EEA.APPLICATION_NUMBER,
          EEA.FED_APPLICATION_NUMBER,
          EEA.FED_APPLICATION_NUMBER AS FEDERAL_APPLICATION_NUMBER,
          EEA.OWNER_CLIENT_NUMBER,
          EEA.AGENT_CLIENT_NUMBER,
          EEA.EXEMPTION_NUMBER,
          EEA.EXPORT_APPLICATION_STATUS_CODE,
          EEA.EXPORT_JURISDICTION_CODE,
          EEA.ORG_UNIT_NO,
          EEA.RECEIVED_DATE,
          ES.ADVERTISING_DATE,
          EASC.DESCRIPTION AS STATUS_DESCRIPTION,
          EERC.DESCRIPTION AS REASON_DESCRIPTION,
          EE.EXPORT_EXEMPTION_TYPE_CODE,
          EETC.DESCRIPTION AS TYPE_DESCRIPTION,
          APK.PACKAGE_NUMBER
        FROM EXPORT_EXEMPTION_APPLICATION EEA
        LEFT JOIN EXPORT_EXEMPTION EE
          ON EE.EXEMPTION_NUMBER = EEA.EXEMPTION_NUMBER
        LEFT JOIN EXPORT_SCHEDULE ES
          ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
        INNER JOIN EXPORT_APPLICATION_STATUS_CODE EASC
          ON EASC.EXPORT_APPLICATION_STATUS_CODE = EEA.EXPORT_APPLICATION_STATUS_CODE
        INNER JOIN EXPORT_EXEMPTION_REASON_CODE EERC
          ON EERC.EXPORT_EXEMPTION_REASON_CODE = EEA.EXPORT_EXEMPTION_REASON_CODE
        INNER JOIN EXPORT_APPLICANT_TYPE_CODE EATC
          ON EATC.EXPORT_APPLICANT_TYPE_CODE = EEA.EXPORT_APPLICANT_TYPE_CODE
        LEFT JOIN EXPORT_EXEMPTION_TYPE_CODE EETC
          ON EETC.EXPORT_EXEMPTION_TYPE_CODE = EE.EXPORT_EXEMPTION_TYPE_CODE
        LEFT JOIN (
          SELECT
            EP.APPLICATION_NUMBER,
            LISTAGG(EP.PACKAGE_NUMBER, ',')
              WITHIN GROUP (ORDER BY EP.PACKAGE_NUMBER) AS PACKAGE_NUMBER
          FROM EXPORT_PACKAGE EP
          GROUP BY EP.APPLICATION_NUMBER
        ) APK
          ON APK.APPLICATION_NUMBER = EEA.APPLICATION_NUMBER
      ) v
      """;
  private static final String SEARCH_FEDERAL_APPLICATIONS =
      """
      SELECT v.*
      FROM
      """
          + FEDERAL_APPLICATION_SEARCH_SOURCE;
  private static final String COUNT_FEDERAL_APPLICATIONS =
      """
      SELECT COUNT(*)
      FROM
      """
          + FEDERAL_APPLICATION_SEARCH_SOURCE;
  private static final Map<String, String> SEARCH_SORT_COLUMNS =
      Map.of("applicationNumber", "v.APPLICATION_NUMBER");
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_PACKAGES_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_APP(?,?)";
  private static final String FIND_PURCHASE_OFFERS_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PURCHASE_OFFERS_BY_APP(?,?)";
  private static final String FIND_FEDERAL_PERMIT_BY_APP =
      LEXIS_GROUP_3_PACKAGE + "FIND_F_PERM_DET_BY_APP(?,?)";

  public FederalApplicationRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadApplicationStatusOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_APPLICATION_STATUS_CODES).stream()
        .filter(option -> option.code() == null || !"DAL".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadFederalExemptionTypeOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_EXEMPTION_TYPE_CODES).stream()
        .filter(option -> "F".equalsIgnoreCase(option.code()))
        .toList();
  }

  public Page<FederalApplicationSearchResultDto> search(FederalApplicationSearchCriteria criteria) {
    return search(criteria, null);
  }

  public Page<FederalApplicationSearchResultDto> search(
      FederalApplicationSearchCriteria criteria, Integer knownTotal) {
    DirectSql countCriteria = buildSearchWhere(criteria, false);
    DirectSql pageCriteria = buildSearchWhere(criteria, true);
    int totalElements =
        knownTotal == null
            ? queryDirectCount(COUNT_FEDERAL_APPLICATIONS, countCriteria)
            : Math.max(0, knownTotal);
    return queryDirectPage(
        SEARCH_FEDERAL_APPLICATIONS,
        pageCriteria,
        criteria.page(),
        criteria.size(),
        totalElements,
        rs -> {
          String statusCode = getString(rs, "EXPORT_APPLICATION_STATUS_CODE");
          String exemptionNumber = getString(rs, "EXEMPTION_NUMBER");
          boolean selectable = "APP".equalsIgnoreCase(statusCode) && exemptionNumber == null;

          return new FederalApplicationSearchResultDto(
              getLong(rs, "APPLICATION_NUMBER"),
              firstNonNull(getString(rs, "FED_APPLICATION_NUMBER"), getString(rs, "FEDERAL_APPLICATION_NUMBER")),
              firstNonNull(getString(rs, "STATUS_DESCRIPTION"), statusCode),
              getString(rs, "OWNER_CLIENT_NUMBER"),
              getString(rs, "REASON_DESCRIPTION"),
              firstNonNull(getString(rs, "TYPE_DESCRIPTION"), getString(rs, "EXPORT_EXEMPTION_TYPE_CODE")),
              exemptionNumber,
              getLocalDate(rs, "RECEIVED_DATE"),
              getLocalDate(rs, "ADVERTISING_DATE"),
              selectable,
              // The service replaces this fail-closed value with current editability state.
              true);
        });
  }

  public int count(FederalApplicationSearchCriteria criteria) {
    return queryDirectCount(COUNT_FEDERAL_APPLICATIONS, buildSearchWhere(criteria, false));
  }

  private DirectSql buildSearchWhere(
      FederalApplicationSearchCriteria criteria, boolean includeOrderBy) {
    DirectSqlBuilder where = newDirectSqlBuilder();

    where.addLike("v.FED_APPLICATION_NUMBER", criteria.federalApplicationNumber());
    where.addLike("v.PACKAGE_NUMBER", criteria.packageNumber());
    where.addEquals("v.EXPORT_JURISDICTION_CODE", "F");
    where.addLike("v.EXEMPTION_NUMBER", criteria.exemptionNumber());
    where.addEquals("v.EXPORT_APPLICATION_STATUS_CODE", criteria.applicationStatus());
    where.addDateGte("v.RECEIVED_DATE", criteria.receivedFromDate());
    where.addDateLte("v.RECEIVED_DATE", criteria.receivedToDate());
    where.addDateGte("v.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("v.ADVERTISING_DATE", criteria.listingToDate());
    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      where.addInEqualsNumberOrNoResults("v.ORG_UNIT_NO", criteria.regionNumbers());
    }

    String ownerClientNumber = trim(criteria.ownerClientNumber());
    if (ownerClientNumber != null) {
      where.addRawWithBinds(
          " AND (v.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%'"
              + " OR v.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%')",
          ownerClientNumber,
          ownerClientNumber);
    }

    where.addLike("v.AGENT_CLIENT_NUMBER", criteria.agentClientNumber());

    String orderBy =
        sanitizedSort(
            null,
            SEARCH_SORT_COLUMNS,
            "applicationNumber",
            "DESC",
            "applicationNumber");
    return where.build(includeOrderBy ? orderBy : "");
  }

  public Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    Optional<FederalApplicationDetailDto> detail =
        queryCursorSingleFailClosed(
            FIND_APPLICATION_BY_NUMBER,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs -> {
              if (!"F".equalsIgnoreCase(getString(rs, "EXPORT_JURISDICTION_CODE"))) {
                return null;
              }
              return new FederalApplicationDetailDto(
                    getLong(rs, "APPLICATION_NUMBER"),
                    firstNonNull(getString(rs, "FED_APPLICATION_NUMBER"), getString(rs, "FEDERAL_APPLICATION_NUMBER")),
                    getString(rs, "EXPORT_APPLICATION_STATUS_CODE"),
                    getString(rs, "STATUS_DESCRIPTION"),
                    getString(rs, "OWNER_CLIENT_NUMBER"),
                    getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                    getString(rs, "AGENT_CLIENT_NUMBER"),
                    getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
                    getString(rs, "EXEMPTION_NUMBER"),
                    getString(rs, "EXPORT_EXEMPTION_TYPE_CODE"),
                    firstNonNull(getString(rs, "REASON_DESCRIPTION"), getString(rs, "EXPORT_EXEMPTION_REASON_CODE")),
                    getLocalDate(rs, "RECEIVED_DATE"),
                    getLocalDate(rs, "ADVERTISING_DATE"),
                    false,
                    List.of(),
                    List.of(),
                    List.of(),
                    null,
                    getString(rs, "EXPORT_APPLICANT_TYPE_CODE"),
                    getString(rs, "OWNER_CONTACT_NAME"),
                    getString(rs, "OWNER_COMPANY_NAME"),
                    resolveAgentApplicantType(getString(rs, "AGENT_CLIENT_NUMBER")),
                    getString(rs, "AGENT_CONTACT_NAME"),
                    getString(rs, "AGENT_COMPANY_NAME"),
                    firstNonNull(
                        firstNonNull(getString(rs, "REGION"), getString(rs, "REGION_CODE")),
                        getString(rs, "ORG_UNIT_CODE")),
                    getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
                    getLocalDate(rs, "APPLICATION_DATE"),
                    getLong(rs, "TERM_DAYS"),
                    getString(rs, "PRODUCT_LOCATION"),
                    getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
                    getDouble(rs, "AVERAGE_LOG_VOLUME"),
                    firstNonNull(getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"), getDouble(rs, "APPLICATION_VOLUME")),
                    null,
                    firstNonNull(getString(rs, "UPDATE_USERID"), getString(rs, "ENTRY_USERID")));
            });

    if (detail.isEmpty()) {
      return Optional.empty();
    }

    List<String> packages = findPackageNumbersByApplicationNumberFailClosed(applicationNumber);
    List<FederalApplicationOfferDto> offers =
        findOffersByApplicationNumberFailClosed(applicationNumber);
    Optional<FederalApplicationPermitDto> permit =
        findPermitByApplicationNumberFailClosed(applicationNumber);
    FederalApplicationDetailDto dto = detail.get();
    return Optional.of(
        new FederalApplicationDetailDto(
            dto.applicationNumber(),
            dto.federalApplicationNumber(),
            dto.statusCode(),
            dto.statusDescription(),
            dto.ownerClientNumber(),
            dto.ownerClientLocationCode(),
            dto.agentClientNumber(),
            dto.agentClientLocationCode(),
            dto.exemptionNumber(),
            dto.exemptionType(),
            dto.exemptionReason(),
            dto.receivedDate(),
            dto.listingDate(),
            dto.readOnly(),
            packages,
            dto.remarks(),
            offers,
            permit.orElse(null),
            dto.ownerApplicantType(),
            dto.ownerContactName(),
            dto.ownerCompanyName(),
            dto.agentApplicantType(),
            dto.agentContactName(),
            dto.agentCompanyName(),
            dto.region(),
            dto.productType(),
            dto.applicationDate(),
            dto.termDays(),
            dto.logLocation(),
            dto.ageClass(),
            dto.averageLogVolume(),
            dto.applicationVolume(),
            dto.endUse(),
            dto.author()));
  }

  static String resolveAgentApplicantType(String agentClientNumber) {
    return agentClientNumber == null || agentClientNumber.isBlank() ? null : "A";
  }

  private List<FederalApplicationOfferDto> findOffersByApplicationNumberFailClosed(
      Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedureFailClosed(
        FIND_PURCHASE_OFFERS_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new FederalApplicationOfferDto(
                offerNumberAsString(rs),
                getString(rs, "COMPANY_NAME"),
                getLocalDate(rs, "ENTRY_TIMESTAMP")));
  }

  public List<String> findPackageNumbersByApplicationNumber(Long applicationNumber) {
    return findPackageNumbersByApplicationNumber(applicationNumber, false);
  }

  public List<String> findPackageNumbersByApplicationNumberRequired(Long applicationNumber) {
    return findPackageNumbersByApplicationNumber(applicationNumber, true);
  }

  private List<String> findPackageNumbersByApplicationNumberFailClosed(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return normalizePackageNumbers(
        queryCursorProcedureFailClosed(
            FIND_PACKAGES_BY_APPLICATION,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs -> getString(rs, "PACKAGE_NUMBER")));
  }

  private List<String> findPackageNumbersByApplicationNumber(
      Long applicationNumber, boolean required) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    List<String> packageNumbers =
        required
            ? queryCursorProcedureRequired(
                FIND_PACKAGES_BY_APPLICATION,
                cs -> cs.setString(1, applicationNumber.toString()),
                2,
                rs -> getString(rs, "PACKAGE_NUMBER"))
            : queryCursorProcedure(
                FIND_PACKAGES_BY_APPLICATION,
                cs -> cs.setString(1, applicationNumber.toString()),
                2,
                rs -> getString(rs, "PACKAGE_NUMBER"));
    return normalizePackageNumbers(packageNumbers);
  }

  private List<String> normalizePackageNumbers(List<String> packageNumbers) {
    return packageNumbers.stream()
        .filter(packageNumber -> packageNumber != null && !packageNumber.isBlank())
        .toList();
  }

  public Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(Long applicationNumber) {
    return findPermitByApplicationNumber(applicationNumber, false);
  }

  public Optional<FederalApplicationPermitDto> findPermitByApplicationNumberRequired(
      Long applicationNumber) {
    return findPermitByApplicationNumber(applicationNumber, true);
  }

  private Optional<FederalApplicationPermitDto> findPermitByApplicationNumberFailClosed(
      Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleFailClosed(
        FIND_FEDERAL_PERMIT_BY_APP,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapFederalPermit);
  }

  private Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(
      Long applicationNumber, boolean required) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    if (required) {
      List<FederalApplicationPermitDto> permits =
          queryCursorProcedureRequired(
              FIND_FEDERAL_PERMIT_BY_APP,
              cs -> cs.setString(1, applicationNumber.toString()),
              2,
              this::mapFederalPermit);
      if (permits.size() > 1) {
        throw new IncorrectResultSizeDataAccessException(1, permits.size());
      }
      return permits.stream().findFirst();
    }
    return queryCursorSingle(
        FIND_FEDERAL_PERMIT_BY_APP,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapFederalPermit);
  }

  public Optional<FederalMutationContextRow> findMutationContext(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> {
          if (!"F".equalsIgnoreCase(getString(rs, "EXPORT_JURISDICTION_CODE"))) {
            return null;
          }
          return new FederalMutationContextRow(
                getLong(rs, "APPLICATION_NUMBER"),
                getLocalDate(rs, "APPLICATION_DATE"),
                getLong(rs, "ORG_UNIT_NO"),
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                getString(rs, "EXPORT_APPLICATION_STATUS_CODE"),
                getLocalDate(rs, "ADVERTISING_DATE"));
        });
  }

  public Optional<FederalMutationContextRow> findMutationContextRequired(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingleRequired(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> {
          if (!"F".equalsIgnoreCase(getString(rs, "EXPORT_JURISDICTION_CODE"))) {
            return null;
          }
          return new FederalMutationContextRow(
              getLong(rs, "APPLICATION_NUMBER"),
              getLocalDate(rs, "APPLICATION_DATE"),
              getLong(rs, "ORG_UNIT_NO"),
              getString(rs, "OWNER_CLIENT_NUMBER"),
              getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
              getString(rs, "EXPORT_APPLICATION_STATUS_CODE"),
              getLocalDate(rs, "ADVERTISING_DATE"));
        });
  }

  public boolean verifyApplicationClientsRequired(List<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return false;
    }

    String previousClientNumber = null;

    for (Long applicationNumber : applicationNumbers) {
      if (applicationNumber == null || applicationNumber < 1) {
        return false;
      }

      Optional<String> currentClient =
          queryCursorSingleRequired(
              FIND_APPLICATION_BY_NUMBER,
              cs -> cs.setString(1, applicationNumber.toString()),
              2,
              rs ->
                  "F".equalsIgnoreCase(getString(rs, "EXPORT_JURISDICTION_CODE"))
                      ? getString(rs, "OWNER_CLIENT_NUMBER")
                      : null);

      if (currentClient.isEmpty() || currentClient.get() == null) {
        return false;
      }

      if (previousClientNumber == null) {
        previousClientNumber = currentClient.get();
      } else if (!previousClientNumber.equals(currentClient.get())) {
        return false;
      }
    }

    return true;
  }

  private Long parsePermitNumber(java.sql.ResultSet rs) {
    Long number = getLong(rs, "EXPORT_FED_PERMIT_DETAIL_ID");
    if (number != null) {
      return number;
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

  private String offerNumberAsString(java.sql.ResultSet rs) {
    Long numeric = getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER");
    return numeric == null ? getString(rs, "EXPORT_PURCHASE_OFFER_NUMBER") : numeric.toString();
  }

  private FederalApplicationPermitDto mapFederalPermit(java.sql.ResultSet rs) {
    return new FederalApplicationPermitDto(
        parsePermitNumber(rs),
        getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
        getString(rs, "EXPORT_COUNTRY_CODE"),
        getString(rs, "EXPORT_TRANSPORT_TYPE_CODE"),
        getString(rs, "TRANSPORT_NAME"),
        getLocalDate(rs, "ESTIMATED_SHIPPING_DATE"),
        getString(rs, "EXPORT_PORT_OF_EXPORT_CODE"),
        getString(rs, "OTHER_PORT_OF_EXPORT"));
  }

  public record FederalMutationContextRow(
      Long applicationNumber,
      java.time.LocalDate applicationDate,
      Long orgUnitNumber,
      String clientNumber,
      String clientLocationCode,
      String statusCode,
      java.time.LocalDate listingDate) {
    public FederalMutationContextRow(
        Long applicationNumber,
        java.time.LocalDate applicationDate,
        Long orgUnitNumber,
        String clientNumber,
        String clientLocationCode) {
      this(
          applicationNumber,
          applicationDate,
          orgUnitNumber,
          clientNumber,
          clientLocationCode,
          null,
          null);
    }
  }

}

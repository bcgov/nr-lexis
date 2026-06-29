package ca.bc.gov.mof.lexis.repository.federal;

import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import org.springframework.data.domain.Page;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class FederalApplicationRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_APPLICATION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";

  private static final String FIND_APPLICATIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATIONS_BY_CRITERIA(?,?,?,?,?)";
  private static final String COUNT_APPLICATIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "COUNT_APPLICATIONS_BY_CRITERIA(?,?,?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_FEDERAL_PERMIT_BY_APP =
      LEXIS_GROUP_3_PACKAGE + "FIND_F_PERM_DET_BY_APP(?,?)";

  public FederalApplicationRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadApplicationStatusOptions() {
    return loadCodeNameOptions(FIND_ALL_APPLICATION_STATUS_CODES).stream()
        .filter(option -> option.code() == null || !"DAL".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadFederalExemptionTypeOptions() {
    return loadCodeNameOptions(FIND_ALL_EXEMPTION_TYPE_CODES).stream()
        .filter(option -> "F".equalsIgnoreCase(option.code()))
        .toList();
  }

  public Page<FederalApplicationSearchResultDto> search(FederalApplicationSearchCriteria criteria) {
    return search(criteria, null);
  }

  public Page<FederalApplicationSearchResultDto> search(
      FederalApplicationSearchCriteria criteria, Integer knownTotal) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    int totalElements =
        knownTotal == null
            ? queryLegacyDynamicCountProcedure(
                COUNT_APPLICATIONS_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues())
            : Math.max(0, knownTotal);
    return queryLegacyDynamicPage(
        FIND_APPLICATIONS_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
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
              selectable);
        });
  }

  public int count(FederalApplicationSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    return queryLegacyDynamicCountProcedure(COUNT_APPLICATIONS_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
  }

  private SqlWhere buildSearchWhere(FederalApplicationSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("v.FED_APPLICATION_NUMBER", criteria.federalApplicationNumber());
    where.addLike("v.PACKAGE_NUMBER", criteria.packageNumber());
    where.addEquals("v.EXPORT_JURISDICTION_CODE", "F");
    where.addLike("v.EXEMPTION_NUMBER", criteria.exemptionNumber());
    where.addEquals("v.EXPORT_APPLICATION_STATUS_CODE", criteria.applicationStatus());
    where.addDateGte("v.RECEIVED_DATE", criteria.receivedFromDate());
    where.addDateLte("v.RECEIVED_DATE", criteria.receivedToDate());
    where.addDateGte("v.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("v.ADVERTISING_DATE", criteria.listingToDate());

    String ownerClientNumber = trim(criteria.ownerClientNumber());
    if (ownerClientNumber != null) {
      int idx1 = where.nextBindIndex();
      int idx2 = idx1 + 1;
      where.addRawWithBinds(
          " AND (v.OWNER_CLIENT_NUMBER LIKE '%' || :"
              + idx1
              + " || '%' OR v.AGENT_CLIENT_NUMBER LIKE '%' || :"
              + idx2
              + " || '%')",
          ownerClientNumber,
          ownerClientNumber);
    }

    where.addLike("v.AGENT_CLIENT_NUMBER", criteria.agentClientNumber());

    return where.build(" ORDER BY v.APPLICATION_NUMBER DESC");
  }

  public Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    Optional<FederalApplicationDetailDto> detail =
        queryCursorSingle(
            FIND_APPLICATION_BY_NUMBER,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs ->
                new FederalApplicationDetailDto(
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
                    getString(rs, "EXPORT_APPLICANT_TYPE_CODE"),
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
                    getString(rs, "END_USE_SORT"),
                    firstNonNull(getString(rs, "UPDATE_USERID"), getString(rs, "ENTRY_USERID"))));

    if (detail.isEmpty()) {
      return Optional.empty();
    }

    Optional<FederalApplicationPermitDto> permit = findPermitByApplicationNumber(applicationNumber);
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
            dto.packages(),
            dto.remarks(),
            dto.offers(),
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

  public Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_FEDERAL_PERMIT_BY_APP,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new FederalApplicationPermitDto(
                parsePermitNumber(rs),
                getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
                getString(rs, "EXPORT_COUNTRY_CODE"),
                getString(rs, "EXPORT_TRANSPORT_TYPE_CODE"),
                getString(rs, "TRANSPORT_NAME"),
                getLocalDate(rs, "ESTIMATED_SHIPPING_DATE"),
                getString(rs, "EXPORT_PORT_OF_EXPORT_CODE"),
                getString(rs, "OTHER_PORT_OF_EXPORT")));
  }

  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return false;
    }

    String previousClientNumber = null;

    for (Long applicationNumber : applicationNumbers) {
      if (applicationNumber == null || applicationNumber < 1) {
        return false;
      }

      Optional<String> currentClient =
          queryCursorSingle(
              FIND_APPLICATION_BY_NUMBER,
              cs -> cs.setString(1, applicationNumber.toString()),
              2,
              rs -> getString(rs, "OWNER_CLIENT_NUMBER"));

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

}

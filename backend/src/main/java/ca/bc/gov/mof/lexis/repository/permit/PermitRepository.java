package ca.bc.gov.mof.lexis.repository.permit;

import static ca.bc.gov.mof.lexis.util.ValueUtils.coalesce;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PermitRepository extends OracleRepositorySupport {

  private static final Logger LOGGER = LoggerFactory.getLogger(PermitRepository.class);

  private static final String FIND_ALL_PERMIT_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PERMIT_STATUS_CODES(?)";

  private static final String FIND_PERMIT_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_BY_CRITERIA(?,?,?,?,?)";
  private static final String COUNT_PERMIT_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "COUNT_PERMIT_BY_CRITERIA(?,?,?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_ID(?,?)";
  private static final String FIND_PERMIT_ACCESS =
      "SELECT EXPORT_PERMIT_DETAIL_NUMBER, AGENT_NUMBER, CLIENT_NUMBER, ORG_UNIT_NO "
          + "FROM EXPORT_PERMIT_DETAIL "
          + "WHERE EXPORT_PERMIT_DETAIL_NUMBER = ?";

  public PermitRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadPermitStatusOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_PERMIT_STATUS_CODES);
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptionsRequired(true);
  }

  public Page<PermitSearchResultDto> search(PermitSearchCriteria criteria) {
    return search(criteria, null);
  }

  public Page<PermitSearchResultDto> search(PermitSearchCriteria criteria, Integer knownTotal) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    int totalElements =
        knownTotal == null
            ? queryLegacyDynamicCountProcedure(
                COUNT_PERMIT_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues())
            : Math.max(0, knownTotal);
    return queryLegacyDynamicPage(
        FIND_PERMIT_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
        criteria.page(),
        criteria.size(),
        totalElements,
        rs ->
            new PermitSearchResultDto(
                getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                firstNonNull(getString(rs, "STATUS_DESCRIPTION"), getString(rs, "EXPORT_PERMIT_STATUS_CODE")),
                getString(rs, "AGENT_NUMBER"),
                getString(rs, "CLIENT_NUMBER"),
                coalesce(getDouble(rs, "PERMIT_VOLUME"), 0.0d),
                getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
                firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE"))));
  }

  public int count(PermitSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    return queryLegacyDynamicCountProcedure(COUNT_PERMIT_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
  }

  private SqlWhere buildSearchWhere(PermitSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("EP.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addLike("ESD.PACKAGE_NUMBER", criteria.packageNumber());
    where.addLike("EPD.EXPORT_PERMIT_DETAIL_NUMBER", criteria.permitNumber());
    where.addDateGte("EPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedFromDate());
    where.addDateLte("EPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedToDate());
    where.addLike("EPD.EXPORT_PERMIT_STATUS_CODE", criteria.permitStatus());
    where.addLike("ESI.EXPORT_SALES_INVOICE_NUMBER", criteria.invoiceNumber());
    where.addLike("CLIENT_NUMBER", criteria.ownerClientNumber());

    String applicantClientNumber = trim(criteria.applicantClientNumber());
    if (applicantClientNumber != null) {
      int idx1 = where.nextBindIndex();
      int idx2 = idx1 + 1;
      where.addRawWithBinds(
          " AND (EPD.AGENT_NUMBER LIKE '%' || :"
              + idx1
              + " || '%' OR (CLIENT_NUMBER LIKE '%' || :"
              + idx2
              + " || '%' AND EPD.AGENT_NUMBER IS NULL))",
          applicantClientNumber,
          applicantClientNumber);
    }

    String accessClientNumber = trim(criteria.accessClientNumber());
    if (accessClientNumber != null) {
      int permitOwnerBind = where.nextBindIndex();
      int permitAgentBind = permitOwnerBind + 1;
      int applicationOwnerBind = permitOwnerBind + 2;
      int applicationAgentBind = permitOwnerBind + 3;
      where.addRawWithBinds(
          " AND (EPD.CLIENT_NUMBER = :"
              + permitOwnerBind
              + " OR EPD.AGENT_NUMBER = :"
              + permitAgentBind
              + " OR EP.OWNER_CLIENT_NUMBER = :"
              + applicationOwnerBind
              + " OR EP.AGENT_CLIENT_NUMBER = :"
              + applicationAgentBind
              + ")"
              + " AND (EP.EXPORT_JURISDICTION_CODE = 'P'"
              + " OR EP.EXPORT_JURISDICTION_CODE IS NULL)",
          accessClientNumber,
          accessClientNumber,
          accessClientNumber,
          accessClientNumber);
    }

    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      where.addInEqualsNumberOrNoResults("EPD.ORG_UNIT_NO", criteria.regionNumbers());
    }
    if (criteria.requireScalePermit()) {
      where.addRaw(" AND ESD.EXPORT_PERMIT_DETAIL_NUMBER IS NOT NULL");
    }

    String orderBy =
        sanitizedSort(
            criteria.sortField(),
            mapOf(
                "applicationNumber", "EP.APPLICATION_NUMBER",
                "packageNumber", "ESD.PACKAGE_NUMBER",
                "permitNumber", "EPD.EXPORT_PERMIT_DETAIL_NUMBER",
                "invoiceNumber", "ESI.EXPORT_SALES_INVOICE_NUMBER",
                "dateIssued", "EPD.EXPORT_PERMIT_ISSUE_DATE",
                "permitStatus", "EPD.EXPORT_PERMIT_STATUS_CODE",
                "applicantClientNumber", "AGENT_NUMBER",
                "ownerClientNumber", "CLIENT_NUMBER",
                "region", "OU.ORG_UNIT_CODE",
                "permitVolume", "EPD.PERMIT_VOLUME",
                "exemptionNumber", "EPD.EXEMPTION_NUMBER"),
            "permitNumber",
            "DESC",
            "permitNumber");

    return where.build(orderBy);
  }

  public Optional<PermitDetailDto> findByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    long startedAtNanos = System.nanoTime();
    LOGGER.info(
        "event=lexis_permit_detail_oracle operation=find_permit_det_by_id outcome=started permitNumber={}",
        permitNumber);
    Optional<PermitDetailDto> detail =
        queryCursorSingleFailClosed(
            FIND_PERMIT_DETAIL_BY_ID,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs ->
                new PermitDetailDto(
                    getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                    getLong(rs, "APPLICATION_NUMBER"),
                    getString(rs, "PACKAGE_NUMBER"),
                    getString(rs, "EXEMPTION_NUMBER"),
                    getString(rs, "EXPORT_PERMIT_STATUS_CODE"),
                    getString(rs, "STATUS_DESCRIPTION"),
                    getString(rs, "AGENT_NUMBER"),
                    getString(rs, "AGENT_LOCN_CODE"),
                    getString(rs, "CLIENT_NUMBER"),
                    getString(rs, "CLIENT_LOCN_CODE"),
                    getString(rs, "DESTINATION_COMPANY_NAME"),
                    getString(rs, "EXPORT_COUNTRY_CODE"),
                    getString(rs, "EXPORT_TRANSPORT_TYPE_CODE"),
                    getString(rs, "TRANSPORT_NAME"),
                    getString(rs, "EXPORT_PORT_OF_EXPORT_CODE"),
                    getString(rs, "OTHER_PORT_OF_EXPORT"),
                    getLocalDate(rs, "APPLICATION_DATE"),
                    getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
                    getLocalDate(rs, "EXPIRY_DATE"),
                    getLocalDate(rs, "RECEIVED_DATE"),
                    getLocalDate(rs, "ESTIMATED_SHIPPING_DATE"),
                    coalesce(getDouble(rs, "PERMIT_VOLUME"), 0.0d),
                    coalesce(getLong(rs, "NUMBER_OF_PIECES"), 0L),
                    getString(rs, "RECEIPT_NUMBER"),
                    getString(rs, "FEDERAL_PERMIT_NUMBER"),
                    getString(rs, "EXPORT_SALES_INVOICE_NUMBER"),
                    getString(rs, "REMARKS"),
                    getLong(rs, "OIC_APPLICATION_NUMBER"),
                    getLong(rs, "OIC_REQUEST_PIECES"),
                    getDouble(rs, "OIC_REQUEST_VOLUME"),
                    getLong(rs, "ORG_UNIT_NO"),
                    firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE"))));
    LOGGER.info(
        "event=lexis_permit_detail_oracle operation=find_permit_det_by_id outcome={} permitNumber={} durationMs={}",
        detail.isPresent() ? "found" : "not_found",
        permitNumber,
        elapsedMillis(startedAtNanos));
    return detail;
  }

  public Optional<PermitAccessDto> findAccessByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return jdbcTemplate
        .query(
            FIND_PERMIT_ACCESS,
            (rs, rowNumber) ->
                new PermitAccessDto(
                    getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                    getString(rs, "AGENT_NUMBER"),
                    getString(rs, "CLIENT_NUMBER"),
                    getLong(rs, "ORG_UNIT_NO")),
            permitNumber)
        .stream()
        .findFirst();
  }

  private static long elapsedMillis(long startedAtNanos) {
    return Math.max(0L, (System.nanoTime() - startedAtNanos) / 1_000_000L);
  }

}

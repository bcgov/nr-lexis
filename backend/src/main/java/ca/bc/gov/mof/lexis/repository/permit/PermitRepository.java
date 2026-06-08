package ca.bc.gov.mof.lexis.repository.permit;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PermitRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_PERMIT_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PERMIT_STATUS_CODES(?)";

  private static final String FIND_PERMIT_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_BY_CRITERIA(?,?,?,?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_ID(?,?)";

  public PermitRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadPermitStatusOptions() {
    return loadCodeNameOptions(FIND_ALL_PERMIT_STATUS_CODES);
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptions(false);
  }

  public List<PermitSearchResultDto> search(PermitSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("EP.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addLike("ESD.PACKAGE_NUMBER", criteria.packageNumber());
    where.addLike("EPD.EXPORT_PERMIT_DETAIL_NUMBER", criteria.permitNumber());
    where.addDateGte("EPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedFromDate());
    where.addDateLte("EPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedToDate());
    where.addLike("EPD.EXPORT_PERMIT_STATUS_CODE", criteria.permitStatus());
    where.addLike("ESI.EXPORT_SALES_INVOICE_NUMBER", criteria.invoiceNumber());
    where.addLike("CLIENT_NUMBER", criteria.applicantClientNumber());

    String ownerClientNumber = trim(criteria.ownerClientNumber());
    if (ownerClientNumber != null) {
      int idx1 = where.nextBindIndex();
      int idx2 = idx1 + 1;
      where.addRawWithBinds(
          " AND (EPD.AGENT_NUMBER LIKE '%' || :"
              + idx1
              + " || '%' OR (CLIENT_NUMBER LIKE '%' || :"
              + idx2
              + " || '%' AND EPD.AGENT_NUMBER IS NULL))",
          ownerClientNumber,
          ownerClientNumber);
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
            "DESC");

    SqlWhere sqlWhere = where.build(orderBy);

    return queryDynamicAllPages(
        FIND_PERMIT_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
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

  public Optional<PermitDetailDto> findByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
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
                getString(rs, "CLIENT_NUMBER"),
                getString(rs, "DESTINATION_COMPANY_NAME"),
                getString(rs, "EXPORT_COUNTRY_CODE"),
                getString(rs, "EXPORT_TRANSPORT_TYPE_CODE"),
                getString(rs, "TRANSPORT_NAME"),
                getString(rs, "EXPORT_PORT_OF_EXPORT_CODE"),
                getString(rs, "OTHER_PORT_OF_EXPORT"),
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
                firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE"))));
  }

  private String firstNonNull(String first, String second) {
    return first != null ? first : second;
  }

  private double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  private long coalesce(Long value, long fallback) {
    return value == null ? fallback : value;
  }
}

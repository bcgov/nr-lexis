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
import java.util.Locale;
import java.util.Map;
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

  private static final String SEARCH_PERMIT_COLUMNS =
      """
      SELECT
        EPD.EXPORT_PERMIT_DETAIL_NUMBER,
        EPSC.DESCRIPTION AS STATUS_DESCRIPTION,
        EPD.EXPORT_PERMIT_STATUS_CODE,
        EPD.AGENT_NUMBER,
        EPD.CLIENT_NUMBER,
        EPD.PERMIT_VOLUME,
        EPD.EXPORT_PERMIT_ISSUE_DATE,
        OU.ORG_UNIT_CODE AS REGION
      """;
  private static final String PERMIT_FROM =
      """
      FROM EXPORT_PERMIT_DETAIL EPD
      """;
  private static final String PERMIT_LOOKUP_JOINS =
      """
      INNER JOIN EXPORT_PERMIT_STATUS_CODE EPSC
        ON EPSC.EXPORT_PERMIT_STATUS_CODE = EPD.EXPORT_PERMIT_STATUS_CODE
      LEFT JOIN ORG_UNIT OU
        ON OU.ORG_UNIT_NO = EPD.ORG_UNIT_NO
      """;
  private static final String ACCESSIBLE_PERMIT_JOIN =
      """
      INNER JOIN ACCESSIBLE_PERMITS AP
        ON AP.EXPORT_PERMIT_DETAIL_NUMBER = EPD.EXPORT_PERMIT_DETAIL_NUMBER
      """;
  private static final String SEARCH_PERMITS =
      SEARCH_PERMIT_COLUMNS + PERMIT_FROM + PERMIT_LOOKUP_JOINS;
  private static final String COUNT_PERMITS =
      """
      SELECT COUNT(*)
      FROM EXPORT_PERMIT_DETAIL EPD
      INNER JOIN EXPORT_PERMIT_STATUS_CODE EPSC
        ON EPSC.EXPORT_PERMIT_STATUS_CODE = EPD.EXPORT_PERMIT_STATUS_CODE
      """;
  // INTENTIONAL_LEGACY_DIVERGENCE(CANONICAL_SEARCH_RESULTS): UNION the direct and linked
  // access branches so page rows and counts share one candidate per permit.
  private static final String ACCESSIBLE_PERMITS_CTE =
      """
      WITH ACCESSIBLE_PERMITS AS (
        SELECT OWNER_PERMIT.EXPORT_PERMIT_DETAIL_NUMBER
        FROM EXPORT_PERMIT_DETAIL OWNER_PERMIT
        WHERE OWNER_PERMIT.CLIENT_NUMBER = ?
        UNION
        SELECT AGENT_PERMIT.EXPORT_PERMIT_DETAIL_NUMBER
        FROM EXPORT_PERMIT_DETAIL AGENT_PERMIT
        WHERE AGENT_PERMIT.AGENT_NUMBER = ?
        UNION
        SELECT LINKED_SCALE.EXPORT_PERMIT_DETAIL_NUMBER
        FROM EXPORT_SCALE_DETAIL LINKED_SCALE
        INNER JOIN EXPORT_PACKAGE LINKED_PACKAGE
          ON LINKED_PACKAGE.PACKAGE_NUMBER = LINKED_SCALE.PACKAGE_NUMBER
        INNER JOIN EXPORT_EXEMPTION_APPLICATION EP_ACCESS
          ON EP_ACCESS.APPLICATION_NUMBER = LINKED_PACKAGE.APPLICATION_NUMBER
        WHERE EP_ACCESS.EXPORT_JURISDICTION_CODE = 'P'
          AND (
            EP_ACCESS.OWNER_CLIENT_NUMBER = ?
            OR EP_ACCESS.AGENT_CLIENT_NUMBER = ?
          )
          AND LINKED_SCALE.EXPORT_PERMIT_DETAIL_NUMBER IS NOT NULL
      )
      """;
  private static final Map<String, String> SEARCH_SORT_COLUMNS =
      Map.ofEntries(
          Map.entry(
              "applicationNumber",
              "(SELECT MIN(EP_SORT.APPLICATION_NUMBER) "
                  + "FROM EXPORT_EXEMPTION_APPLICATION EP_SORT "
                  + "WHERE EP_SORT.EXEMPTION_NUMBER = EPD.EXEMPTION_NUMBER)"),
          Map.entry(
              "packageNumber",
              "(SELECT MIN(ESD_SORT.PACKAGE_NUMBER) "
                  + "FROM EXPORT_SCALE_DETAIL ESD_SORT "
                  + "WHERE ESD_SORT.EXPORT_PERMIT_DETAIL_NUMBER = "
                  + "EPD.EXPORT_PERMIT_DETAIL_NUMBER)"),
          Map.entry("permitNumber", "EPD.EXPORT_PERMIT_DETAIL_NUMBER"),
          Map.entry(
              "invoiceNumber",
              "(SELECT MIN(ESI_SORT.EXPORT_SALES_INVOICE_NUMBER) "
                  + "FROM EXPORT_SALES_INVOICE ESI_SORT "
                  + "WHERE ESI_SORT.EXPORT_PERMIT_DETAIL_NUMBER = "
                  + "EPD.EXPORT_PERMIT_DETAIL_NUMBER)"),
          Map.entry("dateIssued", "EPD.EXPORT_PERMIT_ISSUE_DATE"),
          Map.entry("permitStatus", "EPD.EXPORT_PERMIT_STATUS_CODE"),
          Map.entry("applicantClientNumber", "EPD.AGENT_NUMBER"),
          Map.entry("ownerClientNumber", "EPD.CLIENT_NUMBER"),
          Map.entry("region", "OU.ORG_UNIT_CODE"),
          Map.entry("permitVolume", "EPD.PERMIT_VOLUME"),
          Map.entry("exemptionNumber", "EPD.EXEMPTION_NUMBER"));
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
    DirectSql countCriteria = buildSearchWhere(criteria, false);
    DirectSql pageCriteria = buildSearchWhere(criteria, true);
    String countSelect = buildCountSelect(criteria);
    String pageSelect = buildPageSelect(criteria);
    int totalElements =
        knownTotal == null
            ? queryDirectCount(countSelect, countCriteria)
            : Math.max(0, knownTotal);
    return queryDirectPage(
        pageSelect,
        pageCriteria,
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
    return queryDirectCount(buildCountSelect(criteria), buildSearchWhere(criteria, false));
  }

  private DirectSql buildSearchWhere(PermitSearchCriteria criteria, boolean includeOrderBy) {
    DirectSqlBuilder where = newDirectSqlBuilder();

    String applicationNumber = trim(criteria.applicationNumber());
    if (applicationNumber != null) {
      where.addRawWithBinds(
          " AND EXISTS ("
              + "SELECT 1 FROM EXPORT_EXEMPTION_APPLICATION EP "
              + "WHERE EP.EXEMPTION_NUMBER = EPD.EXEMPTION_NUMBER "
              + "AND TO_CHAR(EP.APPLICATION_NUMBER) LIKE '%' || ? || '%')",
          applicationNumber);
    }
    String packageNumber = trim(criteria.packageNumber());
    if (packageNumber != null) {
      where.addRawWithBinds(
          " AND EXISTS ("
              + "SELECT 1 FROM EXPORT_SCALE_DETAIL ESD "
              + "WHERE ESD.EXPORT_PERMIT_DETAIL_NUMBER = EPD.EXPORT_PERMIT_DETAIL_NUMBER "
              + "AND ESD.PACKAGE_NUMBER LIKE '%' || ? || '%')",
          packageNumber);
    }
    where.addNumberLike("EPD.EXPORT_PERMIT_DETAIL_NUMBER", criteria.permitNumber());
    where.addDateGte("EPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedFromDate());
    where.addDateLte("EPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedToDate());
    where.addLike("EPD.EXPORT_PERMIT_STATUS_CODE", criteria.permitStatus());
    String invoiceNumber = trim(criteria.invoiceNumber());
    if (invoiceNumber != null) {
      where.addRawWithBinds(
          " AND EXISTS ("
              + "SELECT 1 FROM EXPORT_SALES_INVOICE ESI "
              + "WHERE ESI.EXPORT_PERMIT_DETAIL_NUMBER = EPD.EXPORT_PERMIT_DETAIL_NUMBER "
              + "AND ESI.EXPORT_SALES_INVOICE_NUMBER LIKE '%' || ? || '%')",
          invoiceNumber);
    }
    String applicantClientNumber = trim(criteria.applicantClientNumber());
    if (applicantClientNumber != null) {
      where.addRawWithBinds(
          " AND (EPD.AGENT_NUMBER LIKE '%' || ? || '%' "
              + "OR (EPD.CLIENT_NUMBER LIKE '%' || ? || '%' "
              + "AND EPD.AGENT_NUMBER IS NULL))",
          applicantClientNumber,
          applicantClientNumber);
    }
    where.addLike("EPD.CLIENT_NUMBER", criteria.ownerClientNumber());

    String accessClientNumber = trim(criteria.accessClientNumber());
    if (accessClientNumber != null) {
      // The scoped CTE appears before the ordinary WHERE predicates in the final SQL.
      where.addLeadingBinds(
          accessClientNumber,
          accessClientNumber,
          accessClientNumber,
          accessClientNumber);
    }

    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      where.addInEqualsNumberOrNoResults("EPD.ORG_UNIT_NO", criteria.regionNumbers());
    }
    if (criteria.requireScalePermit() && accessClientNumber == null) {
      where.addRaw(
          " AND EXISTS (SELECT 1 FROM EXPORT_SCALE_DETAIL ESD_REQUIRED "
              + "WHERE ESD_REQUIRED.EXPORT_PERMIT_DETAIL_NUMBER = "
              + "EPD.EXPORT_PERMIT_DETAIL_NUMBER)");
    }

    return where.build(includeOrderBy ? buildSearchOrder(criteria.sortField()) : "");
  }

  private String buildPageSelect(PermitSearchCriteria criteria) {
    if (trim(criteria.accessClientNumber()) == null) {
      return SEARCH_PERMITS;
    }
    return buildAccessiblePermitsCte()
        + SEARCH_PERMIT_COLUMNS
        + PERMIT_FROM
        + ACCESSIBLE_PERMIT_JOIN
        + PERMIT_LOOKUP_JOINS;
  }

  private String buildCountSelect(PermitSearchCriteria criteria) {
    if (trim(criteria.accessClientNumber()) == null) {
      return COUNT_PERMITS;
    }
    return buildAccessiblePermitsCte()
        + "SELECT COUNT(*)\n"
        + PERMIT_FROM
        + ACCESSIBLE_PERMIT_JOIN
        + "INNER JOIN EXPORT_PERMIT_STATUS_CODE EPSC\n"
        + "  ON EPSC.EXPORT_PERMIT_STATUS_CODE = EPD.EXPORT_PERMIT_STATUS_CODE\n";
  }

  private String buildAccessiblePermitsCte() {
    return ACCESSIBLE_PERMITS_CTE;
  }

  private String buildSearchOrder(String requestedSort) {
    String normalized = trim(requestedSort);
    String direction = "ASC";
    if (normalized == null) {
      return " ORDER BY EPD.EXPORT_PERMIT_DETAIL_NUMBER DESC";
    }

    String upper = normalized.toUpperCase(Locale.ROOT);
    if (upper.endsWith(" DESC")) {
      direction = "DESC";
      normalized = normalized.substring(0, normalized.length() - 5).trim();
    } else if (upper.endsWith(" ASC")) {
      normalized = normalized.substring(0, normalized.length() - 4).trim();
    }

    String expression = SEARCH_SORT_COLUMNS.get(normalized);
    if (expression == null) {
      return " ORDER BY EPD.EXPORT_PERMIT_DETAIL_NUMBER DESC";
    }
    String order = " ORDER BY " + expression + " " + direction;
    return "EPD.EXPORT_PERMIT_DETAIL_NUMBER".equals(expression)
        ? order
        : order + ", EPD.EXPORT_PERMIT_DETAIL_NUMBER " + direction;
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
                    firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE")),
                    firstNonNull(
                        getString(rs, "UPDATE_USERID"), getString(rs, "ENTRY_USERID"))));
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

package ca.bc.gov.mof.lexis.repository.exemption;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_STATUSES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_EXEMPTION_TYPES;
import static ca.bc.gov.mof.lexis.util.ValueUtils.coalesce;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSummaryLookupDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.StringJoiner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ExemptionRepository extends OracleRepositorySupport {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionRepository.class);

  // INTENTIONAL_LEGACY_DIVERGENCE(CANONICAL_SEARCH_RESULTS): keep one application row per
  // exemption so linked applications cannot duplicate results or multiply permit balances.
  private static final String CANONICAL_EXEMPTION_APPLICATION_CTE =
      """
      CANONICAL_EXEMPTION_APPLICATION AS (
        SELECT
          CANON_EEA.APPLICATION_NUMBER,
          CANON_EEA.EXEMPTION_NUMBER,
          CANON_EEA.EXPORT_SCHEDULE_ID,
          CANON_EEA.ORG_UNIT_NO,
          CANON_EEA.OIC_INDICATOR,
          CANON_EEA.AGENT_CLIENT_NUMBER,
          CANON_EEA.OWNER_CLIENT_NUMBER,
          CANON_EEA.EXPORT_APPLICANT_TYPE_CODE,
          ROW_NUMBER() OVER (
            PARTITION BY CANON_EEA.EXEMPTION_NUMBER
            ORDER BY CANON_ES.ADVERTISING_DATE DESC NULLS LAST,
                     CANON_EEA.APPLICATION_NUMBER DESC
          ) AS CANONICAL_RANK
        FROM EXPORT_EXEMPTION_APPLICATION CANON_EEA
        LEFT JOIN EXPORT_SCHEDULE CANON_ES
          ON CANON_ES.EXPORT_SCHEDULE_ID = CANON_EEA.EXPORT_SCHEDULE_ID
      )
      """;
  private static final String SEARCH_EXEMPTIONS =
      "WITH "
          + CANONICAL_EXEMPTION_APPLICATION_CTE
          + """
      , PERMIT_VOLUME_BY_EXEMPTION AS (
        SELECT EXEMPTION_NUMBER, SUM(PERMIT_VOLUME) AS USED_VOLUME
        FROM EXPORT_PERMIT_DETAIL
        WHERE EXPORT_PERMIT_STATUS_CODE <> 'CAN'
        GROUP BY EXEMPTION_NUMBER
      ),
      EXEMPTION_ORG_UNIT AS (
        SELECT
          EXEMPTION_NUMBER,
          LISTAGG(ORG_UNIT_CODE, ', ') WITHIN GROUP (ORDER BY ORG_UNIT_CODE)
            AS ORG_UNIT_NAME
        FROM (
          SELECT DISTINCT
            IEEA.EXEMPTION_NUMBER,
            IOU.ORG_UNIT_NO,
            IOU.ORG_UNIT_CODE
          FROM EXPORT_EXEMPTION_APPLICATION IEEA
          INNER JOIN ORG_UNIT IOU
            ON IOU.ORG_UNIT_NO = IEEA.ORG_UNIT_NO
          WHERE IEEA.OIC_INDICATOR = 'N'
          UNION
          SELECT DISTINCT
            OEO.EXEMPTION_NUMBER,
            OOU.ORG_UNIT_NO,
            OOU.ORG_UNIT_CODE
          FROM OIC_EXEMPTION_ORG_UNIT OEO
          INNER JOIN ORG_UNIT OOU
            ON OOU.ORG_UNIT_NO = OEO.ORG_UNIT_NO
        )
        GROUP BY EXEMPTION_NUMBER
      )
      SELECT
        EE.EXEMPTION_NUMBER,
        EE.APPROVED_VOLUME,
        EE.APPROVAL_DATE,
        EE.EXPIRY_DATE,
        EE.EXPORT_EXEMPTION_TYPE_CODE,
        EE.EXPORT_EXEMPTION_STATUS_CODE,
        EESC.DESCRIPTION AS STATUS_DESCRIPTION,
        EE.APPROVED_VOLUME - COALESCE(PV.USED_VOLUME, 0) AS VOLUME_REMAINING,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
            THEN ES.ADVERTISING_DATE
          ELSE NULL
        END AS ADVERTISING_DATE,
        EO.ORG_UNIT_NAME,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
              AND EEA.EXPORT_APPLICANT_TYPE_CODE = 'A'
            THEN COALESCE(EEA.AGENT_CLIENT_NUMBER, '')
          ELSE ''
        END AS AGENT_CLIENT_NUMBER,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
            THEN COALESCE(EEA.OWNER_CLIENT_NUMBER, '')
          ELSE ''
        END AS OWNER_CLIENT_NUMBER
      FROM EXPORT_EXEMPTION EE
      LEFT JOIN CANONICAL_EXEMPTION_APPLICATION EEA
        ON EEA.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
       AND EEA.CANONICAL_RANK = 1
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      LEFT JOIN EXPORT_SCHEDULE ES
        ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
      LEFT JOIN PERMIT_VOLUME_BY_EXEMPTION PV
        ON PV.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      LEFT JOIN EXEMPTION_ORG_UNIT EO
        ON EO.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      """;
  private static final String COUNT_EXEMPTIONS =
      "WITH "
          + CANONICAL_EXEMPTION_APPLICATION_CTE
          + """
      SELECT COUNT(*)
      FROM EXPORT_EXEMPTION EE
      LEFT JOIN CANONICAL_EXEMPTION_APPLICATION EEA
        ON EEA.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
       AND EEA.CANONICAL_RANK = 1
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      LEFT JOIN EXPORT_SCHEDULE ES
        ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
      """;
  private static final String FILTER_ONLY_COUNT_EXEMPTIONS =
      "SELECT COUNT(*) FROM EXPORT_EXEMPTION EE";
  private static final String PAGE_FIRST_SEARCH_PREFIX =
      """
      WITH PAGE_EXEMPTIONS AS (
        SELECT EE.EXEMPTION_NUMBER
        FROM EXPORT_EXEMPTION EE
      """;
  private static final String SCOPED_PAGE_FIRST_SEARCH_PREFIX_TAIL =
      """
      , PAGE_EXEMPTIONS AS (
        SELECT EE.EXEMPTION_NUMBER
        FROM EXPORT_EXEMPTION EE
        INNER JOIN ACCESSIBLE_EXEMPTIONS AE
          ON AE.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
        INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
          ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      """;
  private static final String PAGE_FIRST_SEARCH_TAIL =
      """
      ),
      CANONICAL_EXEMPTION_APPLICATION AS (
        SELECT
          CANON_EEA.APPLICATION_NUMBER,
          CANON_EEA.EXEMPTION_NUMBER,
          CANON_EEA.EXPORT_SCHEDULE_ID,
          CANON_EEA.AGENT_CLIENT_NUMBER,
          CANON_EEA.OWNER_CLIENT_NUMBER,
          CANON_EEA.EXPORT_APPLICANT_TYPE_CODE,
          ROW_NUMBER() OVER (
            PARTITION BY CANON_EEA.EXEMPTION_NUMBER
            ORDER BY CANON_ES.ADVERTISING_DATE DESC NULLS LAST,
                     CANON_EEA.APPLICATION_NUMBER DESC
          ) AS CANONICAL_RANK
        FROM EXPORT_EXEMPTION_APPLICATION CANON_EEA
        INNER JOIN PAGE_EXEMPTIONS PE_CANON
          ON PE_CANON.EXEMPTION_NUMBER = CANON_EEA.EXEMPTION_NUMBER
        LEFT JOIN EXPORT_SCHEDULE CANON_ES
          ON CANON_ES.EXPORT_SCHEDULE_ID = CANON_EEA.EXPORT_SCHEDULE_ID
      ),
      PERMIT_VOLUME_BY_EXEMPTION AS (
        SELECT EPD.EXEMPTION_NUMBER, SUM(EPD.PERMIT_VOLUME) AS USED_VOLUME
        FROM EXPORT_PERMIT_DETAIL EPD
        INNER JOIN PAGE_EXEMPTIONS PE_VOLUME
          ON PE_VOLUME.EXEMPTION_NUMBER = EPD.EXEMPTION_NUMBER
        WHERE EPD.EXPORT_PERMIT_STATUS_CODE <> 'CAN'
        GROUP BY EPD.EXEMPTION_NUMBER
      ),
      EXEMPTION_ORG_UNIT AS (
        SELECT
          EXEMPTION_NUMBER,
          LISTAGG(ORG_UNIT_CODE, ', ') WITHIN GROUP (ORDER BY ORG_UNIT_CODE)
            AS ORG_UNIT_NAME
        FROM (
          SELECT DISTINCT
            IEEA.EXEMPTION_NUMBER,
            IOU.ORG_UNIT_NO,
            IOU.ORG_UNIT_CODE
          FROM EXPORT_EXEMPTION_APPLICATION IEEA
          INNER JOIN PAGE_EXEMPTIONS PE_IEEA
            ON PE_IEEA.EXEMPTION_NUMBER = IEEA.EXEMPTION_NUMBER
          INNER JOIN ORG_UNIT IOU
            ON IOU.ORG_UNIT_NO = IEEA.ORG_UNIT_NO
          WHERE IEEA.OIC_INDICATOR = 'N'
          UNION
          SELECT DISTINCT
            OEO.EXEMPTION_NUMBER,
            OOU.ORG_UNIT_NO,
            OOU.ORG_UNIT_CODE
          FROM OIC_EXEMPTION_ORG_UNIT OEO
          INNER JOIN PAGE_EXEMPTIONS PE_OEO
            ON PE_OEO.EXEMPTION_NUMBER = OEO.EXEMPTION_NUMBER
          INNER JOIN ORG_UNIT OOU
            ON OOU.ORG_UNIT_NO = OEO.ORG_UNIT_NO
        )
        GROUP BY EXEMPTION_NUMBER
      )
      SELECT
        EE.EXEMPTION_NUMBER,
        EE.APPROVED_VOLUME,
        EE.APPROVAL_DATE,
        EE.EXPIRY_DATE,
        EE.EXPORT_EXEMPTION_TYPE_CODE,
        EE.EXPORT_EXEMPTION_STATUS_CODE,
        EESC.DESCRIPTION AS STATUS_DESCRIPTION,
        EE.APPROVED_VOLUME - COALESCE(PV.USED_VOLUME, 0) AS VOLUME_REMAINING,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
            THEN ES.ADVERTISING_DATE
          ELSE NULL
        END AS ADVERTISING_DATE,
        EO.ORG_UNIT_NAME,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
              AND EEA.EXPORT_APPLICANT_TYPE_CODE = 'A'
            THEN COALESCE(EEA.AGENT_CLIENT_NUMBER, '')
          ELSE ''
        END AS AGENT_CLIENT_NUMBER,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
            THEN COALESCE(EEA.OWNER_CLIENT_NUMBER, '')
          ELSE ''
        END AS OWNER_CLIENT_NUMBER
      FROM PAGE_EXEMPTIONS PE
      INNER JOIN EXPORT_EXEMPTION EE
        ON EE.EXEMPTION_NUMBER = PE.EXEMPTION_NUMBER
      LEFT JOIN CANONICAL_EXEMPTION_APPLICATION EEA
        ON EEA.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
       AND EEA.CANONICAL_RANK = 1
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      LEFT JOIN EXPORT_SCHEDULE ES
        ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
      LEFT JOIN PERMIT_VOLUME_BY_EXEMPTION PV
        ON PV.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      LEFT JOIN EXEMPTION_ORG_UNIT EO
        ON EO.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      """;
  private static final String ACCESSIBLE_EXEMPTIONS_CTE =
      """
      ACCESSIBLE_EXEMPTIONS AS (
        SELECT EEA_ACCESS.EXEMPTION_NUMBER
        FROM EXPORT_EXEMPTION_APPLICATION EEA_ACCESS
        INNER JOIN EXPORT_EXEMPTION EE_ACCESS
          ON EE_ACCESS.EXEMPTION_NUMBER = EEA_ACCESS.EXEMPTION_NUMBER
        WHERE EE_ACCESS.EXPORT_EXEMPTION_TYPE_CODE %s
          AND (
            EEA_ACCESS.EXPORT_JURISDICTION_CODE = 'P'
            OR EEA_ACCESS.EXPORT_JURISDICTION_CODE IS NULL
          )
          AND (
            EEA_ACCESS.OWNER_CLIENT_NUMBER = ?
            OR EEA_ACCESS.AGENT_CLIENT_NUMBER = ?
          )
        GROUP BY EEA_ACCESS.EXEMPTION_NUMBER
      %s)
      """;
  private static final String SCOPED_CANONICAL_EXEMPTION_APPLICATION_CTE =
      """
      CANONICAL_EXEMPTION_APPLICATION AS (
        SELECT
          CANON_EEA.APPLICATION_NUMBER,
          CANON_EEA.EXEMPTION_NUMBER,
          CANON_EEA.EXPORT_SCHEDULE_ID,
          CANON_EEA.ORG_UNIT_NO,
          CANON_EEA.OIC_INDICATOR,
          CANON_EEA.AGENT_CLIENT_NUMBER,
          CANON_EEA.OWNER_CLIENT_NUMBER,
          CANON_EEA.EXPORT_APPLICANT_TYPE_CODE,
          ROW_NUMBER() OVER (
            PARTITION BY CANON_EEA.EXEMPTION_NUMBER
            ORDER BY CANON_ES.ADVERTISING_DATE DESC NULLS LAST,
                     CANON_EEA.APPLICATION_NUMBER DESC
          ) AS CANONICAL_RANK
        FROM EXPORT_EXEMPTION_APPLICATION CANON_EEA
        INNER JOIN ACCESSIBLE_EXEMPTIONS AE_CANON
          ON AE_CANON.EXEMPTION_NUMBER = CANON_EEA.EXEMPTION_NUMBER
        LEFT JOIN EXPORT_SCHEDULE CANON_ES
          ON CANON_ES.EXPORT_SCHEDULE_ID = CANON_EEA.EXPORT_SCHEDULE_ID
      )
      """;
  private static final String SCOPED_SEARCH_EXEMPTIONS_TAIL =
      """
      , PERMIT_VOLUME_BY_EXEMPTION AS (
        SELECT EPD_VOLUME.EXEMPTION_NUMBER, SUM(EPD_VOLUME.PERMIT_VOLUME) AS USED_VOLUME
        FROM EXPORT_PERMIT_DETAIL EPD_VOLUME
        INNER JOIN ACCESSIBLE_EXEMPTIONS AE_VOLUME
          ON AE_VOLUME.EXEMPTION_NUMBER = EPD_VOLUME.EXEMPTION_NUMBER
        WHERE EPD_VOLUME.EXPORT_PERMIT_STATUS_CODE <> 'CAN'
        GROUP BY EPD_VOLUME.EXEMPTION_NUMBER
      ),
      EXEMPTION_ORG_UNIT AS (
        SELECT
          EXEMPTION_NUMBER,
          LISTAGG(ORG_UNIT_CODE, ', ') WITHIN GROUP (ORDER BY ORG_UNIT_CODE)
            AS ORG_UNIT_NAME
        FROM (
          SELECT DISTINCT
            IEEA.EXEMPTION_NUMBER,
            IOU.ORG_UNIT_NO,
            IOU.ORG_UNIT_CODE
          FROM EXPORT_EXEMPTION_APPLICATION IEEA
          INNER JOIN ACCESSIBLE_EXEMPTIONS AE_IEEA
            ON AE_IEEA.EXEMPTION_NUMBER = IEEA.EXEMPTION_NUMBER
          INNER JOIN ORG_UNIT IOU
            ON IOU.ORG_UNIT_NO = IEEA.ORG_UNIT_NO
          WHERE IEEA.OIC_INDICATOR = 'N'
          UNION
          SELECT DISTINCT
            OEO.EXEMPTION_NUMBER,
            OOU.ORG_UNIT_NO,
            OOU.ORG_UNIT_CODE
          FROM OIC_EXEMPTION_ORG_UNIT OEO
          INNER JOIN ACCESSIBLE_EXEMPTIONS AE_OEO
            ON AE_OEO.EXEMPTION_NUMBER = OEO.EXEMPTION_NUMBER
          INNER JOIN ORG_UNIT OOU
            ON OOU.ORG_UNIT_NO = OEO.ORG_UNIT_NO
        )
        GROUP BY EXEMPTION_NUMBER
      )
      SELECT
        EE.EXEMPTION_NUMBER,
        EE.APPROVED_VOLUME,
        EE.APPROVAL_DATE,
        EE.EXPIRY_DATE,
        EE.EXPORT_EXEMPTION_TYPE_CODE,
        EE.EXPORT_EXEMPTION_STATUS_CODE,
        EESC.DESCRIPTION AS STATUS_DESCRIPTION,
        EE.APPROVED_VOLUME - COALESCE(PV.USED_VOLUME, 0) AS VOLUME_REMAINING,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
            THEN ES.ADVERTISING_DATE
          ELSE NULL
        END AS ADVERTISING_DATE,
        EO.ORG_UNIT_NAME,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
              AND EEA.EXPORT_APPLICANT_TYPE_CODE = 'A'
            THEN COALESCE(EEA.AGENT_CLIENT_NUMBER, '')
          ELSE ''
        END AS AGENT_CLIENT_NUMBER,
        CASE
          WHEN EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')
            THEN COALESCE(EEA.OWNER_CLIENT_NUMBER, '')
          ELSE ''
        END AS OWNER_CLIENT_NUMBER
      FROM EXPORT_EXEMPTION EE
      INNER JOIN ACCESSIBLE_EXEMPTIONS AE
        ON AE.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      LEFT JOIN CANONICAL_EXEMPTION_APPLICATION EEA
        ON EEA.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
       AND EEA.CANONICAL_RANK = 1
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      LEFT JOIN EXPORT_SCHEDULE ES
        ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
      LEFT JOIN PERMIT_VOLUME_BY_EXEMPTION PV
        ON PV.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      LEFT JOIN EXEMPTION_ORG_UNIT EO
        ON EO.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      """;
  private static final String SCOPED_COUNT_EXEMPTIONS_TAIL =
      """
      SELECT COUNT(*)
      FROM EXPORT_EXEMPTION EE
      INNER JOIN ACCESSIBLE_EXEMPTIONS AE
        ON AE.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      LEFT JOIN CANONICAL_EXEMPTION_APPLICATION EEA
        ON EEA.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
       AND EEA.CANONICAL_RANK = 1
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      LEFT JOIN EXPORT_SCHEDULE ES
        ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
      """;
  private static final String SCOPED_FILTER_ONLY_COUNT_EXEMPTIONS_TAIL =
      """
      SELECT COUNT(*)
      FROM EXPORT_EXEMPTION EE
      INNER JOIN ACCESSIBLE_EXEMPTIONS AE
        ON AE.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      """;
  private static final String FIND_EXEMPTION_ACCESS =
      """
      SELECT
        EXEMPTION_NUMBER,
        EXPORT_EXEMPTION_TYPE_CODE,
        EXPORT_EXEMPTION_STATUS_CODE
      FROM EXPORT_EXEMPTION
      WHERE EXEMPTION_NUMBER = ?
      """;
  private static final String FIND_EXEMPTION_SUMMARY_LOOKUPS =
      """
      SELECT
        EE.EXEMPTION_NUMBER,
        EETC.DESCRIPTION AS TYPE_DESCRIPTION,
        EESC.DESCRIPTION AS STATUS_DESCRIPTION
      FROM EXPORT_EXEMPTION EE
      LEFT JOIN EXPORT_EXEMPTION_TYPE_CODE EETC
        ON EETC.EXPORT_EXEMPTION_TYPE_CODE = EE.EXPORT_EXEMPTION_TYPE_CODE
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      WHERE EE.EXEMPTION_NUMBER IN (%s)
      """;
  private static final String LINKED_PROVINCIAL_APPLICATION_BELONGS_TO_CLIENT =
      """
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM EXPORT_EXEMPTION_APPLICATION
          WHERE EXEMPTION_NUMBER = ?
            AND EXPORT_JURISDICTION_CODE = 'P'
            AND (
              OWNER_CLIENT_NUMBER = ?
              OR AGENT_CLIENT_NUMBER = ?
            )
        ) THEN 1
        ELSE 0
      END
      FROM DUAL
      """;
  // An exemption's regions for access checks: those of its linked applications and its stored OIC
  // region rows, matching the search region filter (regionOrTypeFilter). Ministerial exemptions
  // usually have only application regions, so the OIC-only FIND_EXEMPTION_ORG_UNIT cursor is not
  // enough.
  // System-owned Blanket OIC permit applications (OIC_INDICATOR 'Y') are excluded, as in search.
  private static final String FIND_EXEMPTION_ACCESS_ORG_UNITS =
      """
      SELECT EEA.ORG_UNIT_NO
      FROM EXPORT_EXEMPTION_APPLICATION EEA
      WHERE EEA.EXEMPTION_NUMBER = ?
        AND EEA.OIC_INDICATOR = 'N'
      UNION
      SELECT OEO.ORG_UNIT_NO
      FROM OIC_EXEMPTION_ORG_UNIT OEO
      WHERE OEO.EXEMPTION_NUMBER = ?
      """;
  private static final Map<String, String> SEARCH_SORT_COLUMNS =
      Map.ofEntries(
          Map.entry("exemptionNumber", "EE.EXEMPTION_NUMBER"),
          Map.entry("type", "EE.EXPORT_EXEMPTION_TYPE_CODE"),
          Map.entry("exemptionTypeCode", "EE.EXPORT_EXEMPTION_TYPE_CODE"),
          Map.entry("status", "EE.EXPORT_EXEMPTION_STATUS_CODE"),
          Map.entry("exemptionStatusCode", "EE.EXPORT_EXEMPTION_STATUS_CODE"),
          Map.entry("applicantClientNumber", "AGENT_CLIENT_NUMBER"),
          Map.entry("ownerClientNumber", "OWNER_CLIENT_NUMBER"),
          Map.entry("approvedVolume", "EE.APPROVED_VOLUME"),
          Map.entry("balanceRemaining", "VOLUME_REMAINING"),
          Map.entry("listingDate", "ADVERTISING_DATE"),
          Map.entry("exemptionApprovalDate", "EE.APPROVAL_DATE"),
          Map.entry("expiryDate", "EE.EXPIRY_DATE"),
          Map.entry("exemptionExpiryDate", "EE.EXPIRY_DATE"),
          Map.entry("region", "EO.ORG_UNIT_NAME"));

  public ExemptionRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadExemptionTypeOptions() {
    return loadCodeNameOptionsDirectRequired(ACTIVE_EXEMPTION_TYPES).stream()
        .filter(option -> option.code() != null && !"F".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadExemptionStatusOptions() {
    return loadCodeNameOptionsDirectRequired(ACTIVE_EXEMPTION_STATUSES).stream()
        .filter(option -> option.code() != null)
        .toList();
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptionsRequired(true);
  }

  /**
   * The regions that decide who may view or change an exemption: its linked applications' regions
   * together with its stored OIC regions. Editing a Blanket OIC's regions uses only the stored
   * ones (see ExemptionDetailsRpcRepository#findExemptionOrgUnitNumbers).
   */
  public List<Long> findAccessOrgUnitNumbers(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryDirectRequired(
            FIND_EXEMPTION_ACCESS_ORG_UNITS,
            rs -> getLong(rs, "ORG_UNIT_NO"),
            normalized,
            normalized)
        .stream()
        .filter(value -> value != null && value > 0)
        .distinct()
        .toList();
  }

  public Page<ExemptionSearchResultDto> search(ExemptionSearchCriteria criteria) {
    return search(criteria, null);
  }

  public Page<ExemptionSearchResultDto> search(
      ExemptionSearchCriteria criteria, Integer knownTotal) {
    String scopedClientNumber = broadClientNumber(criteria);
    DirectSql countSqlWhere = buildSearchWhere(criteria, "", scopedClientNumber);
    DirectSql pageSqlWhere =
        buildSearchWhere(criteria, buildSearchOrder(criteria.sortField()), scopedClientNumber);
    String countSelect = buildCountSelect(criteria, scopedClientNumber);
    String pageSelect = buildPageSelect(criteria, scopedClientNumber);
    int totalElements =
        knownTotal == null
            ? queryDirectCount(countSelect, countSqlWhere)
            : Math.max(0, knownTotal);
    if (supportsScopedSummaryPageFirstSearch(criteria, scopedClientNumber)) {
      return queryDirectPageWithTail(
          buildScopedPageFirstSearchPrefix(),
          pageSqlWhere,
          PAGE_FIRST_SEARCH_TAIL + buildSearchOrder(criteria.sortField()),
          criteria.page(),
          criteria.size(),
          totalElements,
          this::mapSearchResult);
    }
    if (supportsPageFirstSearch(criteria, scopedClientNumber)) {
      return queryDirectPageWithTail(
          PAGE_FIRST_SEARCH_PREFIX,
          pageSqlWhere,
          PAGE_FIRST_SEARCH_TAIL + buildSearchOrder(criteria.sortField()),
          criteria.page(),
          criteria.size(),
          totalElements,
          this::mapSearchResult);
    }
    return queryDirectPage(
        pageSelect,
        pageSqlWhere,
        criteria.page(),
        criteria.size(),
        totalElements,
        this::mapSearchResult);
  }

  public int count(ExemptionSearchCriteria criteria) {
    String scopedClientNumber = broadClientNumber(criteria);
    return queryDirectCount(
        buildCountSelect(criteria, scopedClientNumber),
        buildSearchWhere(criteria, "", scopedClientNumber));
  }

  private DirectSql buildSearchWhere(
      ExemptionSearchCriteria criteria, String suffix, String scopedClientNumber) {
    DirectSqlBuilder where = newDirectSqlBuilder();
    if (scopedClientNumber != null) {
      // The scoped candidate CTE appears before the ordinary WHERE predicates.
      where.addLeadingBinds(scopedClientNumber, scopedClientNumber);
    }

    LinkedApplicationMatch linked = linkedApplicationMatch(criteria, scopedClientNumber);
    List<RegionFilter> regionFilters = new ArrayList<>();
    // INTENTIONAL_LEGACY_DIVERGENCE(HISTORICAL_ORG_UNIT_SEARCH_VISIBILITY):
    // Apply region scope only when the caller supplies it. Injecting today's active regions would
    // hide exact matches belonging to historical organizational units.
    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      regionFilters.add(
          regionOrTypeFilter(criteria.regionNumbers(), criteria.includeBlanketOic() ? "B" : null));
    }
    if (criteria.nonMinisterialRegionNumbers() != null) {
      // Non-Ministerial exemptions match only in these regions; Ministerial ones are left to the
      // other filters. An empty list leaves only Ministerial exemptions.
      regionFilters.add(regionOrTypeFilter(criteria.nonMinisterialRegionNumbers(), "M"));
    }
    List<ExemptionSet> sets = new ArrayList<>();
    if (linked != null) {
      sets.add(linked.asSet());
    }
    regionFilters.stream().map(RegionFilter::set).filter(Objects::nonNull).forEach(sets::add);
    boolean intersectSets = sets.size() > 1;

    if (linked != null && !intersectSets) {
      where.addRawWithBinds(linked.existsClause(), linked.bindValues().toArray());
    }
    where.addLike("EE.EXEMPTION_NUMBER", criteria.exemptionNumber());
    if ("NULL".equals(trim(criteria.exemptionType()))) {
      // None refers to the exemption's own missing type, not an unlinked application.
      where.addRaw(" AND EE.EXPORT_EXEMPTION_TYPE_CODE IS NULL");
    } else {
      where.addEquals("EE.EXPORT_EXEMPTION_TYPE_CODE", criteria.exemptionType());
    }
    if (criteria.excludeBlanketOic()) {
      where.addRaw(" AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'B'");
    }
    where.addEquals("EE.EXPORT_EXEMPTION_STATUS_CODE", criteria.exemptionStatus());
    where.addLike("EEA.OWNER_CLIENT_NUMBER", criteria.ownerClientNumber());
    // Legacy also stores the owner in AGENT_CLIENT_NUMBER on owner applications, so only an agent
    // application names an agent.
    where.addLike(
        "CASE WHEN EEA.EXPORT_APPLICANT_TYPE_CODE = 'A' THEN EEA.AGENT_CLIENT_NUMBER END",
        criteria.agentClientNumber());

    String applicantClientNumber = trim(criteria.applicantClientNumber());
    if (applicantClientNumber != null && !criteria.broadClientMatch()) {
      // For an explicit staff Applicant filter, the owner is the applicant only when no agent
      // is recorded. Broad industry visibility is applied by the scoped candidate CTE.
      where.addRawWithBinds(
          " AND (EEA.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%' "
              + "OR EEA.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%' "
              + "AND EEA.AGENT_CLIENT_NUMBER IS NULL)",
          applicantClientNumber,
          applicantClientNumber);
    }

    for (RegionFilter regionFilter : regionFilters) {
      if (regionFilter.set() == null) {
        where.addRaw(regionFilter.exemptionPredicate());
      } else if (!intersectSets) {
        where.addRawWithBinds(
            " AND EE.EXEMPTION_NUMBER IN (" + regionFilter.set().sql() + ")",
            regionFilter.set().bindValues().toArray());
      }
    }
    if (intersectSets) {
      addIntersectedSets(where, sets);
      if (linked != null && linked.listingDate()) {
        where.addRaw(LISTING_DATE_TYPE_PREDICATE);
      }
    }
    return where.build(suffix);
  }

  /**
   * Two or more exemption-number sets in one IN, intersected. EXPORT_EXEMPTION_APPLICATION has no
   * EXEMPTION_NUMBER index, and with one IN per set Oracle pushed each exemption of one set into the
   * other and scanned the table per exemption (minutes on PROD); INTERSECT reads each set once. The
   * first set is not parenthesized: set operators apply left to right, so a first set that is a
   * UNION ALL is complete before the first INTERSECT.
   */
  private void addIntersectedSets(DirectSqlBuilder where, List<ExemptionSet> sets) {
    StringBuilder clause = new StringBuilder(" AND EE.EXEMPTION_NUMBER IN (");
    List<Object> bindValues = new ArrayList<>();
    for (int index = 0; index < sets.size(); index++) {
      ExemptionSet set = sets.get(index);
      clause.append(index == 0 ? set.sql() : " INTERSECT (" + set.sql() + ")");
      bindValues.addAll(set.bindValues());
    }
    where.addRawWithBinds(clause.append(")").toString(), bindValues.toArray());
  }

  /**
   * Application number, package number and list date match any application linked to the
   * exemption, as in legacy, not only the canonical one; submitters match only their own client's
   * applications. Legacy matched a list date only on exemptions with a type other than Blanket OIC
   * and OIC, the ones whose results show a list date.
   */
  private LinkedApplicationMatch linkedApplicationMatch(
      ExemptionSearchCriteria criteria, String scopedClientNumber) {
    String applicationNumber = trim(criteria.applicationNumber());
    String packageNumber = trim(criteria.packageNumber());
    LocalDate listingFromDate = criteria.listingFromDate();
    LocalDate listingToDate = criteria.listingToDate();
    boolean hasListingDate = listingFromDate != null || listingToDate != null;
    if (applicationNumber == null && packageNumber == null && !hasListingDate) {
      return null;
    }
    StringBuilder conditions = new StringBuilder();
    List<Object> bindValues = new ArrayList<>();
    if (applicationNumber != null) {
      conditions.append(" AND TO_CHAR(EEA_MATCH.APPLICATION_NUMBER) LIKE '%' || ? || '%'");
      bindValues.add(applicationNumber);
    }
    if (packageNumber != null) {
      conditions.append(
          " AND EXISTS (SELECT 1 FROM EXPORT_PACKAGE EP "
              + "WHERE EP.APPLICATION_NUMBER = EEA_MATCH.APPLICATION_NUMBER "
              + "AND EP.PACKAGE_NUMBER LIKE '%' || ? || '%')");
      bindValues.add(packageNumber);
    }
    if (hasListingDate) {
      conditions.append(
          " AND EXISTS (SELECT 1 FROM EXPORT_SCHEDULE ES_MATCH "
              + "WHERE ES_MATCH.EXPORT_SCHEDULE_ID = EEA_MATCH.EXPORT_SCHEDULE_ID");
      if (listingFromDate != null) {
        conditions.append(" AND ES_MATCH.ADVERTISING_DATE >= ?");
        bindValues.add(Date.valueOf(listingFromDate));
      }
      if (listingToDate != null) {
        conditions.append(" AND ES_MATCH.ADVERTISING_DATE <= ?");
        bindValues.add(Date.valueOf(listingToDate));
      }
      conditions.append(")");
    }
    if (scopedClientNumber != null) {
      conditions.append(
          " AND (EEA_MATCH.OWNER_CLIENT_NUMBER = ? OR EEA_MATCH.AGENT_CLIENT_NUMBER = ?)");
      bindValues.add(scopedClientNumber);
      bindValues.add(scopedClientNumber);
    }
    return new LinkedApplicationMatch(conditions.toString(), List.copyOf(bindValues), hasListingDate);
  }

  private static final String LISTING_DATE_TYPE_PREDICATE =
      " AND EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O')";

  /** The linked-application conditions, as a correlated EXISTS or as a set of exemption numbers. */
  private record LinkedApplicationMatch(
      String conditions, List<Object> bindValues, boolean listingDate) {

    String existsClause() {
      return " AND EXISTS (SELECT 1 FROM EXPORT_EXEMPTION_APPLICATION EEA_MATCH "
          + "WHERE EEA_MATCH.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER"
          + conditions
          + ")"
          + (listingDate ? LISTING_DATE_TYPE_PREDICATE : "");
    }

    ExemptionSet asSet() {
      return new ExemptionSet(
          "SELECT EEA_MATCH.EXEMPTION_NUMBER FROM EXPORT_EXEMPTION_APPLICATION EEA_MATCH "
              + "WHERE EEA_MATCH.EXEMPTION_NUMBER IS NOT NULL"
              + conditions,
          bindValues);
    }
  }

  /** An uncorrelated query returning exemption numbers. */
  private record ExemptionSet(String sql, List<Object> bindValues) {}

  /** A region filter: a set of exemption numbers, or an exemption predicate when no region is left. */
  private record RegionFilter(ExemptionSet set, String exemptionPredicate) {}

  private String broadClientNumber(ExemptionSearchCriteria criteria) {
    return criteria.broadClientMatch() ? trim(criteria.applicantClientNumber()) : null;
  }

  private String buildPageSelect(
      ExemptionSearchCriteria criteria, String scopedClientNumber) {
    if (scopedClientNumber == null) {
      return SEARCH_EXEMPTIONS;
    }
    return "WITH "
        + buildAccessibleExemptionsCte(criteria.includeBlanketOic())
        + ", "
        + SCOPED_CANONICAL_EXEMPTION_APPLICATION_CTE
        + SCOPED_SEARCH_EXEMPTIONS_TAIL;
  }

  private String buildCountSelect(
      ExemptionSearchCriteria criteria, String scopedClientNumber) {
    if (supportsFilterOnlyCount(criteria, scopedClientNumber)) {
      return FILTER_ONLY_COUNT_EXEMPTIONS;
    }
    if (supportsScopedSummaryFilterOnlyCount(criteria, scopedClientNumber)) {
      return "WITH "
          + buildAccessibleExemptionsCte(true)
          + SCOPED_FILTER_ONLY_COUNT_EXEMPTIONS_TAIL;
    }
    if (scopedClientNumber == null) {
      return COUNT_EXEMPTIONS;
    }
    return "WITH "
        + buildAccessibleExemptionsCte(criteria.includeBlanketOic())
        + ", "
        + SCOPED_CANONICAL_EXEMPTION_APPLICATION_CTE
        + SCOPED_COUNT_EXEMPTIONS_TAIL;
  }

  private boolean supportsPageFirstSearch(
      ExemptionSearchCriteria criteria, String scopedClientNumber) {
    if (!supportsFilterOnlyCount(criteria, scopedClientNumber)) {
      return false;
    }

    return supportsExemptionNumberSort(criteria.sortField());
  }

  private boolean supportsScopedSummaryPageFirstSearch(
      ExemptionSearchCriteria criteria, String scopedClientNumber) {
    return supportsScopedSummaryFilterOnlyCount(criteria, scopedClientNumber)
        && supportsExemptionNumberSort(criteria.sortField());
  }

  private boolean supportsExemptionNumberSort(String sortField) {
    String requestedField = parseSearchSort(sortField).field();
    return requestedField == null || "exemptionNumber".equals(requestedField);
  }

  private String buildScopedPageFirstSearchPrefix() {
    return "WITH "
        + buildAccessibleExemptionsCte(true)
        + SCOPED_PAGE_FIRST_SEARCH_PREFIX_TAIL;
  }

  private boolean supportsFilterOnlyCount(
      ExemptionSearchCriteria criteria, String scopedClientNumber) {
    return scopedClientNumber == null
        && trim(criteria.ownerClientNumber()) == null
        && trim(criteria.applicantClientNumber()) == null
        && trim(criteria.agentClientNumber()) == null;
  }

  private boolean supportsScopedSummaryFilterOnlyCount(
      ExemptionSearchCriteria criteria, String scopedClientNumber) {
    return scopedClientNumber != null
        && criteria.includeBlanketOic()
        && !criteria.excludeBlanketOic()
        && trim(criteria.applicationNumber()) == null
        && trim(criteria.packageNumber()) == null
        && trim(criteria.exemptionNumber()) == null
        && trim(criteria.exemptionType()) == null
        && trim(criteria.exemptionStatus()) == null
        && trim(criteria.ownerClientNumber()) == null
        && criteria.listingFromDate() == null
        && criteria.listingToDate() == null
        && (criteria.regionNumbers() == null || criteria.regionNumbers().isEmpty());
  }

  private String buildAccessibleExemptionsCte(boolean includeBlanketOic) {
    // Blanket OIC is standing/global. Ordinary OIC remains client-linked, matching detail access
    // instead of reproducing the legacy search's broader OIC result set.
    String clientScopedTypePredicate =
        includeBlanketOic ? "!= 'B'" : "NOT IN ('B', 'O')";
    String blanketOicUnion =
        includeBlanketOic
            ? "  UNION\n"
                + "  SELECT EE_BOIC.EXEMPTION_NUMBER\n"
                + "  FROM EXPORT_EXEMPTION EE_BOIC\n"
                + "  WHERE EE_BOIC.EXPORT_EXEMPTION_TYPE_CODE = 'B'\n"
            : "";
    return ACCESSIBLE_EXEMPTIONS_CTE.formatted(clientScopedTypePredicate, blanketOicUnion);
  }

  private ExemptionSearchResultDto mapSearchResult(ResultSet rs) throws SQLException {
    return new ExemptionSearchResultDto(
        trim(rs.getString("EXEMPTION_NUMBER")),
        trim(rs.getString("EXPORT_EXEMPTION_TYPE_CODE")),
        trim(rs.getString("EXPORT_EXEMPTION_STATUS_CODE")),
        trim(rs.getString("AGENT_CLIENT_NUMBER")),
        trim(rs.getString("OWNER_CLIENT_NUMBER")),
        null,
        toLocalDate(rs.getTimestamp("APPROVAL_DATE")),
        toLocalDate(rs.getTimestamp("ADVERTISING_DATE")),
        toLocalDate(rs.getTimestamp("EXPIRY_DATE")),
        trim(rs.getString("ORG_UNIT_NAME")),
        requiredDouble(rs, "APPROVED_VOLUME"),
        requiredDouble(rs, "VOLUME_REMAINING"),
        true);
  }

  private double requiredDouble(ResultSet rs, String column) throws SQLException {
    double value = rs.getDouble(column);
    return rs.wasNull() ? 0.0d : value;
  }

  private String buildSearchOrder(String requestedSort) {
    SearchSort searchSort = parseSearchSort(requestedSort);
    if (searchSort.field() == null) {
      return " ORDER BY EE.EXEMPTION_NUMBER DESC";
    }

    String column = SEARCH_SORT_COLUMNS.get(searchSort.field());
    if (column == null || !safeIdentifier(column)) {
      return " ORDER BY EE.EXEMPTION_NUMBER DESC";
    }

    String order = " ORDER BY " + column + " " + searchSort.direction();
    return "EE.EXEMPTION_NUMBER".equals(column)
        ? order
        : order + ", EE.EXEMPTION_NUMBER DESC";
  }

  private SearchSort parseSearchSort(String requestedSort) {
    String field = trim(requestedSort);
    if (field == null) {
      return new SearchSort(null, "DESC");
    }

    String direction = "ASC";
    int directionStart = field.length();
    while (directionStart > 0
        && !Character.isWhitespace(field.charAt(directionStart - 1))) {
      directionStart--;
    }
    if (directionStart > 0) {
      String requestedDirection = field.substring(directionStart);
      if ("DESC".equalsIgnoreCase(requestedDirection)
          || "ASC".equalsIgnoreCase(requestedDirection)) {
        direction = "DESC".equalsIgnoreCase(requestedDirection) ? "DESC" : "ASC";
        field = field.substring(0, directionStart).trim();
      }
    }
    return new SearchSort(field, direction);
  }

  /**
   * Exemptions with an application or OIC region in the given regions, or of the given type.
   * EXPORT_EXEMPTION_APPLICATION has no EXEMPTION_NUMBER index, so this is an uncorrelated set that
   * Oracle reads once; a correlated EXISTS ORed with the type scanned it per exemption.
   */
  private RegionFilter regionOrTypeFilter(List<Long> regionNumbers, String alsoMatchedTypeCode) {
    LinkedHashSet<Long> distinct = new LinkedHashSet<>();
    regionNumbers.stream()
        .filter(value -> value != null && value > 0)
        .forEach(distinct::add);
    if (distinct.isEmpty()) {
      return new RegionFilter(
          null,
          alsoMatchedTypeCode == null
              ? " AND 1=0"
              : " AND EE.EXPORT_EXEMPTION_TYPE_CODE = '" + alsoMatchedTypeCode + "'");
    }

    StringJoiner placeholders = new StringJoiner(", ");
    distinct.forEach(ignored -> placeholders.add("?"));
    List<Object> bindValues = new ArrayList<>(distinct.size() * 2);
    bindValues.addAll(distinct);
    bindValues.addAll(distinct);
    String typeBranch =
        alsoMatchedTypeCode == null
            ? ""
            : "SELECT EE_TYPE.EXEMPTION_NUMBER FROM EXPORT_EXEMPTION EE_TYPE "
                + "WHERE EE_TYPE.EXPORT_EXEMPTION_TYPE_CODE = '"
                + alsoMatchedTypeCode
                + "' UNION ALL ";
    return new RegionFilter(
        new ExemptionSet(
            typeBranch
                + "SELECT EEA_REGION.EXEMPTION_NUMBER FROM EXPORT_EXEMPTION_APPLICATION EEA_REGION "
                + "WHERE EEA_REGION.OIC_INDICATOR = 'N' AND EEA_REGION.ORG_UNIT_NO IN ("
                + placeholders
                + ") UNION ALL "
                + "SELECT OEO_REGION.EXEMPTION_NUMBER FROM OIC_EXEMPTION_ORG_UNIT OEO_REGION "
                + "WHERE OEO_REGION.ORG_UNIT_NO IN ("
                + placeholders
                + ")",
            List.copyOf(bindValues)),
        null);
  }

  public Optional<ExemptionDetailDto> findByExemptionNumber(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    long startedAtNanos = System.nanoTime();
    LOGGER.info(
        "event=lexis_exemption_detail_oracle operation=find_exemption_by_number outcome=started exemptionNumber={}",
        normalized);
    try {
      Optional<ExemptionDetailDto> detail =
          jdbcTemplate
              .query(
                  ExemptionDetailQueries.BY_NUMBER,
                  (rs, rowNumber) -> {
                    double approvedVolume =
                        coalesce(getDouble(rs, "APPROVED_VOLUME"), 0.0d);
                    double remainingVolume =
                        coalesce(getDouble(rs, "VOLUME_REMAINING"), 0.0d);
                    return new ExemptionDetailDto(
                          getString(rs, "EXEMPTION_NUMBER"),
                          getString(rs, "EXPORT_EXEMPTION_TYPE_CODE"),
                          getString(rs, "TYPE_DESCRIPTION"),
                          getString(rs, "EXPORT_EXEMPTION_STATUS_CODE"),
                          getString(rs, "STATUS_DESCRIPTION"),
                          getString(rs, "OWNER_CLIENT_NUMBER"),
                          getString(rs, "AGENT_CLIENT_NUMBER"),
                          getLong(rs, "APPLICATION_NUMBER"),
                          getString(rs, "APPLICATION_STATUS"),
                          getLocalDate(rs, "APPROVAL_DATE"),
                          getLocalDate(rs, "EXPIRY_DATE"),
                          approvedVolume,
                          calculateUsedVolume(approvedVolume, remainingVolume),
                          remainingVolume,
                          getString(rs, "OTHER_CONDITIONS"),
                          "B".equalsIgnoreCase(getString(rs, "EXPORT_EXEMPTION_TYPE_CODE")),
                          List.of(),
                          List.of(),
                          firstNonNull(
                              getString(rs, "UPDATE_USERID"), getString(rs, "ENTRY_USERID")));
                  },
                  normalized)
              .stream()
              .findFirst();
      LOGGER.info(
          "event=lexis_exemption_detail_oracle operation=find_exemption_by_number outcome={} exemptionNumber={} durationMs={}",
          detail.isPresent() ? "found" : "not_found",
          normalized,
          elapsedMillis(startedAtNanos));
      return detail;
    } catch (RuntimeException exception) {
      LOGGER.warn(
          "event=lexis_exemption_detail_oracle operation=find_exemption_by_number outcome=failed exemptionNumber={} durationMs={} failureType={}",
          normalized,
          elapsedMillis(startedAtNanos),
          exceptionType(exception));
      throw exception;
    }
  }

  public Map<String, ExemptionSummaryLookupDto> findSummaryLookups(
      List<String> exemptionNumbers) {
    List<String> normalized =
        exemptionNumbers == null
            ? List.of()
            : exemptionNumbers.stream()
                .map(this::trim)
                .filter(value -> value != null)
                .distinct()
                .toList();
    if (normalized.isEmpty()) {
      return Map.of();
    }

    String placeholders = String.join(", ", java.util.Collections.nCopies(normalized.size(), "?"));
    List<ExemptionSummaryLookupDto> rows =
        jdbcTemplate.query(
            FIND_EXEMPTION_SUMMARY_LOOKUPS.formatted(placeholders),
            (rs, rowNumber) ->
                new ExemptionSummaryLookupDto(
                    getString(rs, "EXEMPTION_NUMBER"),
                    getString(rs, "TYPE_DESCRIPTION"),
                    getString(rs, "STATUS_DESCRIPTION")),
            normalized.toArray());
    Map<String, ExemptionSummaryLookupDto> byExemptionNumber = new LinkedHashMap<>();
    rows.forEach(row -> byExemptionNumber.put(row.exemptionNumber(), row));
    return Map.copyOf(byExemptionNumber);
  }

  private static double calculateUsedVolume(
      double approvedVolume, double remainingVolume) {
    return BigDecimal.valueOf(approvedVolume)
        .subtract(BigDecimal.valueOf(remainingVolume))
        .setScale(1, RoundingMode.HALF_EVEN)
        .doubleValue();
  }

  public Optional<ExemptionAccessDto> findAccessByExemptionNumber(
      String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }
    return jdbcTemplate
        .query(
            FIND_EXEMPTION_ACCESS,
            (rs, rowNumber) -> {
              String exemptionTypeCode =
                  getString(rs, "EXPORT_EXEMPTION_TYPE_CODE");
              return new ExemptionAccessDto(
                  getString(rs, "EXEMPTION_NUMBER"),
                  exemptionTypeCode,
                  getString(rs, "EXPORT_EXEMPTION_STATUS_CODE"),
                  "B".equalsIgnoreCase(exemptionTypeCode));
            },
            normalized)
        .stream()
        .findFirst();
  }

  public boolean hasLinkedProvincialApplicationForClient(
      String exemptionNumber, String clientNumber) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    String normalizedClientNumber = trim(clientNumber);
    if (normalizedExemptionNumber == null || normalizedClientNumber == null) {
      return false;
    }
    Long matches =
        jdbcTemplate.queryForObject(
            LINKED_PROVINCIAL_APPLICATION_BELONGS_TO_CLIENT,
            Long.class,
            normalizedExemptionNumber,
            normalizedClientNumber,
            normalizedClientNumber);
    return matches != null && matches > 0;
  }

  private static long elapsedMillis(long startedAtNanos) {
    return Math.max(0L, (System.nanoTime() - startedAtNanos) / 1_000_000L);
  }

  private record SearchSort(String field, String direction) {}

}

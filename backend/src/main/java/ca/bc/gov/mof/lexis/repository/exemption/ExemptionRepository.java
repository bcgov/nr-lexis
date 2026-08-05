package ca.bc.gov.mof.lexis.repository.exemption;

import static ca.bc.gov.mof.lexis.util.ValueUtils.coalesce;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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

  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_STS_CODES(?)";
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
  private static final String FIND_EXEMPTION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTION_BY_NUMBER(?,?)";
  private static final String FIND_EXEMPTION_ACCESS =
      """
      SELECT
        EXEMPTION_NUMBER,
        EXPORT_EXEMPTION_TYPE_CODE,
        EXPORT_EXEMPTION_STATUS_CODE
      FROM EXPORT_EXEMPTION
      WHERE EXEMPTION_NUMBER = ?
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
  private static final String FIND_EXEMPTION_ORG_UNIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTION_ORG_UNIT(?,?)";
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
          Map.entry("expiryDate", "EE.EXPIRY_DATE"),
          Map.entry("exemptionExpiryDate", "EE.EXPIRY_DATE"),
          Map.entry("region", "EO.ORG_UNIT_NAME"));

  public ExemptionRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadExemptionTypeOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_EXEMPTION_TYPE_CODES).stream()
        .filter(option -> option.code() != null && !"F".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadExemptionStatusOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_EXEMPTION_STATUS_CODES).stream()
        .filter(option -> option.code() != null && !"EXP".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptionsRequired(true);
  }

  public List<Long> findOrgUnitNumbers(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedureRequired(
            FIND_EXEMPTION_ORG_UNIT,
            cs -> cs.setString(1, normalized),
            2,
            rs -> getLong(rs, "ORG_UNIT_NO"))
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
    DirectSql countSqlWhere = buildSearchWhere(criteria, "");
    DirectSql pageSqlWhere = buildSearchWhere(criteria, buildSearchOrder(criteria.sortField()));
    int totalElements =
        knownTotal == null
            ? queryDirectCount(COUNT_EXEMPTIONS, countSqlWhere)
            : Math.max(0, knownTotal);
    return queryDirectPage(
        SEARCH_EXEMPTIONS,
        pageSqlWhere,
        criteria.page(),
        criteria.size(),
        totalElements,
        this::mapSearchResult);
  }

  public int count(ExemptionSearchCriteria criteria) {
    return queryDirectCount(COUNT_EXEMPTIONS, buildSearchWhere(criteria, ""));
  }

  private DirectSql buildSearchWhere(ExemptionSearchCriteria criteria, String suffix) {
    DirectSqlBuilder where = newDirectSqlBuilder();

    where.addNumberLike("EEA.APPLICATION_NUMBER", criteria.applicationNumber());
    String packageNumber = trim(criteria.packageNumber());
    if (packageNumber != null) {
      where.addRawWithBinds(
          " AND EXISTS ("
              + "SELECT 1 FROM EXPORT_PACKAGE EP "
              + "WHERE EP.APPLICATION_NUMBER = EEA.APPLICATION_NUMBER "
              + "AND EP.PACKAGE_NUMBER LIKE '%' || ? || '%')",
          packageNumber);
    }
    where.addLike("EE.EXEMPTION_NUMBER", criteria.exemptionNumber());
    where.addEquals("EE.EXPORT_EXEMPTION_TYPE_CODE", criteria.exemptionType());
    if (criteria.excludeBlanketOic()) {
      where.addRaw(" AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'B'");
    }
    where.addEquals("EE.EXPORT_EXEMPTION_STATUS_CODE", criteria.exemptionStatus());
    where.addLike("EEA.OWNER_CLIENT_NUMBER", criteria.ownerClientNumber());

    String applicantClientNumber = trim(criteria.applicantClientNumber());
    if (applicantClientNumber != null) {
      if (criteria.broadClientMatch()) {
        // Industry visibility is based on any linked application, while the selected canonical
        // application remains the single display row. Legacy search also exposes both OIC types.
        where.addRawWithBinds(
            " AND ((EE.EXPORT_EXEMPTION_TYPE_CODE NOT IN ('B', 'O') "
                + "AND EXISTS (SELECT 1 FROM EXPORT_EXEMPTION_APPLICATION EEA_ACCESS "
                + "WHERE EEA_ACCESS.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER "
                + "AND (EEA_ACCESS.OWNER_CLIENT_NUMBER = ? "
                + "OR EEA_ACCESS.AGENT_CLIENT_NUMBER = ?)))"
                + (criteria.includeBlanketOic()
                    ? " OR EE.EXPORT_EXEMPTION_TYPE_CODE IN ('B', 'O')"
                    : "")
                + ")",
            applicantClientNumber,
            applicantClientNumber);
      } else {
        // For an explicit staff Applicant filter, the owner is the applicant only when no agent
        // is recorded.
        where.addRawWithBinds(
            " AND (EEA.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%' "
                + "OR EEA.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%' "
                + "AND EEA.AGENT_CLIENT_NUMBER IS NULL)",
            applicantClientNumber,
            applicantClientNumber);
      }
    }

    where.addDateGte("EE.APPROVAL_DATE", criteria.approvalFromDate());
    where.addDateLte("EE.APPROVAL_DATE", criteria.approvalToDate());
    where.addDateGte("ES.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("ES.ADVERTISING_DATE", criteria.listingToDate());
    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      addRegionFilter(where, criteria.regionNumbers(), criteria.includeBlanketOic());
    }
    return where.build(suffix);
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
    String normalized = trim(requestedSort);
    if (normalized == null) {
      return " ORDER BY EE.EXEMPTION_NUMBER DESC";
    }

    String direction = "ASC";
    String upper = normalized.toUpperCase(java.util.Locale.ROOT);
    if (upper.endsWith(" DESC")) {
      direction = "DESC";
      normalized = normalized.substring(0, normalized.length() - 5).trim();
    } else if (upper.endsWith(" ASC")) {
      normalized = normalized.substring(0, normalized.length() - 4).trim();
    }

    String column = SEARCH_SORT_COLUMNS.get(normalized);
    if (column == null || !safeIdentifier(column)) {
      return " ORDER BY EE.EXEMPTION_NUMBER DESC";
    }

    String order = " ORDER BY " + column + " " + direction;
    return "EE.EXEMPTION_NUMBER".equals(column)
        ? order
        : order + ", EE.EXEMPTION_NUMBER DESC";
  }

  private void addRegionFilter(
      DirectSqlBuilder where, List<Long> regionNumbers, boolean includeBlanketOic) {
    LinkedHashSet<Long> distinct = new LinkedHashSet<>();
    regionNumbers.stream()
        .filter(value -> value != null && value > 0)
        .forEach(distinct::add);
    if (distinct.isEmpty()) {
      where.addRaw(
          includeBlanketOic
              ? " AND EE.EXPORT_EXEMPTION_TYPE_CODE = 'B'"
              : " AND 1=0");
      return;
    }

    StringJoiner placeholders = new StringJoiner(", ");
    distinct.forEach(ignored -> placeholders.add("?"));
    List<Object> bindValues = new java.util.ArrayList<>(distinct.size() * 2);
    bindValues.addAll(distinct);
    bindValues.addAll(distinct);
    String condition =
        " AND ((EXISTS (SELECT 1 FROM EXPORT_EXEMPTION_APPLICATION EEA_REGION "
            + "WHERE EEA_REGION.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER "
            + "AND EEA_REGION.OIC_INDICATOR = 'N' "
            + "AND EEA_REGION.ORG_UNIT_NO IN ("
            + placeholders
            + ")) OR EXISTS (SELECT 1 FROM OIC_EXEMPTION_ORG_UNIT OEO_REGION "
            + "WHERE OEO_REGION.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER "
            + "AND OEO_REGION.ORG_UNIT_NO IN ("
            + placeholders
            + "))"
            + (includeBlanketOic ? " OR EE.EXPORT_EXEMPTION_TYPE_CODE = 'B'" : "")
            + "))";
    where.addRawWithBinds(condition, bindValues.toArray());
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
          queryCursorSingleFailClosed(
              FIND_EXEMPTION_BY_NUMBER,
              cs -> cs.setString(1, normalized),
              2,
              rs -> {
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
              });
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

}

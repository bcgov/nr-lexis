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
import java.util.ArrayList;
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
  private static final String FIND_EXEMPTIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTIONS_BY_CRITERIA(?,?,?,?,?)";
  private static final String COUNT_EXEMPTIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "COUNT_EXEMPTIONS_BY_CRITERIA(?,?,?,?)";
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
  private static final String SEARCH_GROUP_BY =
      " GROUP BY "
          + "EE.EXEMPTION_NUMBER, "
          + "EE.APPROVED_VOLUME, "
          + "EE.APPROVAL_DATE, "
          + "EE.EXPIRY_DATE, "
          + "EE.OTHER_CONDITIONS, "
          + "EE.ENTRY_USERID, "
          + "EE.ENTRY_TIMESTAMP, "
          + "EE.UPDATE_USERID, "
          + "EE.UPDATE_TIMESTAMP, "
          + "EE.EXPORT_EXEMPTION_TYPE_CODE, "
          + "EE.EXPORT_EXEMPTION_STATUS_CODE, "
          + "EESC.DESCRIPTION, "
          + "CASE WHEN EE.EXPORT_EXEMPTION_TYPE_CODE != 'B' AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'O' "
          + "THEN EEA.AGENT_CLIENT_NUMBER END, "
          + "CASE WHEN EE.EXPORT_EXEMPTION_TYPE_CODE != 'B' AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'O' "
          + "THEN EEA.OWNER_CLIENT_NUMBER END, "
          + "EO.ORG_UNIT_NAME, "
          + "CASE WHEN EE.EXPORT_EXEMPTION_TYPE_CODE != 'B' AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'O' "
          + "THEN ES.ADVERTISING_DATE ELSE NULL END, "
          + "CASE WHEN EE.EXPORT_EXEMPTION_TYPE_CODE != 'B' AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'O' "
          + "THEN (case when EEA.AGENT_CLIENT_NUMBER is null then '' else EEA.AGENT_CLIENT_NUMBER end) ELSE '' END, "
          + "CASE WHEN EE.EXPORT_EXEMPTION_TYPE_CODE != 'B' AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'O' "
          + "THEN (case when EEA.OWNER_CLIENT_NUMBER is null then '' else EEA.OWNER_CLIENT_NUMBER end) ELSE '' END";
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
          Map.entry("listingDate", "ES.ADVERTISING_DATE"),
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
    SqlWhere countSqlWhere = buildSearchWhere(criteria, false, false);
    SqlWhere pageSqlWhere = buildSearchWhere(criteria, true, true);
    int totalElements =
        knownTotal == null
            ? queryLegacyDynamicCountProcedure(
                COUNT_EXEMPTIONS_BY_CRITERIA, countSqlWhere.sql(), countSqlWhere.bindValues())
            : Math.max(0, knownTotal);
    return queryLegacyDynamicPage(
        FIND_EXEMPTIONS_BY_CRITERIA,
        pageSqlWhere.sql(),
        pageSqlWhere.bindValues(),
        criteria.page(),
        criteria.size(),
        totalElements,
        this::mapSearchResult);
  }

  public int count(ExemptionSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria, false, false);
    return queryLegacyDynamicCountProcedure(COUNT_EXEMPTIONS_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
  }

  private SqlWhere buildSearchWhere(
      ExemptionSearchCriteria criteria, boolean includeGroupBy, boolean includeOrderBy) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("EEA.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addLike("EP.PACKAGE_NUMBER", criteria.packageNumber());
    where.addLike("EE.EXEMPTION_NUMBER", criteria.exemptionNumber());
    where.addEquals("EE.EXPORT_EXEMPTION_TYPE_CODE", criteria.exemptionType());
    if (criteria.excludeBlanketOic()) {
      where.addRaw(" AND EE.EXPORT_EXEMPTION_TYPE_CODE != 'B'");
    }
    where.addEquals("EE.EXPORT_EXEMPTION_STATUS_CODE", criteria.exemptionStatus());
    where.addLike("EEA.OWNER_CLIENT_NUMBER", criteria.ownerClientNumber());

    String applicantClientNumber = trim(criteria.applicantClientNumber());
    if (applicantClientNumber != null) {
      int idx1 = where.nextBindIndex();
      int idx2 = idx1 + 1;
      // Scoped industry searches retain legacy owner-or-agent visibility. For an explicit staff
      // Applicant filter, the owner is the applicant only when no agent is recorded.
      where.addRawWithBinds(
          " AND (EEA.AGENT_CLIENT_NUMBER LIKE '%' || :"
              + idx1
              + " || '%' OR EEA.OWNER_CLIENT_NUMBER LIKE '%' || :"
              + idx2
              + " || '%'"
              + (criteria.includeBlanketOic() ? "" : " AND EEA.AGENT_CLIENT_NUMBER IS NULL")
              + (criteria.includeBlanketOic()
                  ? " OR EE.EXPORT_EXEMPTION_TYPE_CODE = 'B'"
                  : "")
              + ")",
          applicantClientNumber,
          applicantClientNumber);
    }

    where.addDateGte("EE.APPROVAL_DATE", criteria.approvalFromDate());
    where.addDateLte("EE.APPROVAL_DATE", criteria.approvalToDate());
    where.addDateGte("ES.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("ES.ADVERTISING_DATE", criteria.listingToDate());
    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      if (criteria.includeBlanketOic()) {
        addRegionOrBlanketOic(where, criteria.regionNumbers());
      } else {
        where.addInLikeOrNoResults("EO.ORG_UNIT_NO", criteria.regionNumbers());
      }
    }
    addCanonicalApplicationFilter(where, criteria);

    return where.build(
        (includeGroupBy ? SEARCH_GROUP_BY : "")
            + (includeOrderBy ? buildSearchOrder(criteria.sortField()) : ""));
  }

  private void addCanonicalApplicationFilter(
      SqlWhereBuilder where, ExemptionSearchCriteria criteria) {
    StringBuilder clause =
        new StringBuilder(
            """
             AND (
               EEA.APPLICATION_NUMBER IS NULL
               OR EEA.APPLICATION_NUMBER = (
                 SELECT MAX(CANON_EEA.APPLICATION_NUMBER)
                          KEEP (
                            DENSE_RANK FIRST
                            ORDER BY CANON_ES.ADVERTISING_DATE DESC NULLS LAST,
                                     CANON_EEA.APPLICATION_NUMBER DESC
                          )
                 FROM EXPORT_EXEMPTION_APPLICATION CANON_EEA
                 LEFT JOIN EXPORT_PACKAGE CANON_EP
                   ON CANON_EP.APPLICATION_NUMBER = CANON_EEA.APPLICATION_NUMBER
                 LEFT JOIN EXPORT_SCHEDULE CANON_ES
                   ON CANON_ES.EXPORT_SCHEDULE_ID = CANON_EEA.EXPORT_SCHEDULE_ID
                 WHERE CANON_EEA.EXEMPTION_NUMBER = EE.EXEMPTION_NUMBER
            """);
    List<String> bindValues = new ArrayList<>();
    int bindIndex = where.nextBindIndex();

    String applicationNumber = trim(criteria.applicationNumber());
    if (applicationNumber != null) {
      clause
          .append(" AND CANON_EEA.APPLICATION_NUMBER LIKE '%' || :")
          .append(bindIndex++)
          .append(" || '%'");
      bindValues.add(applicationNumber);
    }

    String packageNumber = trim(criteria.packageNumber());
    if (packageNumber != null) {
      clause
          .append(" AND CANON_EP.PACKAGE_NUMBER LIKE '%' || :")
          .append(bindIndex++)
          .append(" || '%'");
      bindValues.add(packageNumber);
    }

    String ownerClientNumber = trim(criteria.ownerClientNumber());
    if (ownerClientNumber != null) {
      clause
          .append(" AND CANON_EEA.OWNER_CLIENT_NUMBER LIKE '%' || :")
          .append(bindIndex++)
          .append(" || '%'");
      bindValues.add(ownerClientNumber);
    }

    String applicantClientNumber = trim(criteria.applicantClientNumber());
    if (applicantClientNumber != null) {
      int agentBindIndex = bindIndex++;
      int ownerBindIndex = bindIndex++;
      clause
          .append(" AND (CANON_EEA.AGENT_CLIENT_NUMBER LIKE '%' || :")
          .append(agentBindIndex)
          .append(" || '%' OR CANON_EEA.OWNER_CLIENT_NUMBER LIKE '%' || :")
          .append(ownerBindIndex)
          .append(" || '%'");
      if (!criteria.includeBlanketOic()) {
        clause.append(" AND CANON_EEA.AGENT_CLIENT_NUMBER IS NULL");
      } else {
        clause.append(" OR EE.EXPORT_EXEMPTION_TYPE_CODE = 'B'");
      }
      clause.append(")");
      bindValues.add(applicantClientNumber);
      bindValues.add(applicantClientNumber);
    }

    if (criteria.listingFromDate() != null) {
      clause
          .append(" AND CANON_ES.ADVERTISING_DATE >= TO_DATE(:")
          .append(bindIndex++)
          .append(", 'YYYY-MM-DD')");
      bindValues.add(criteria.listingFromDate().toString());
    }
    if (criteria.listingToDate() != null) {
      clause
          .append(" AND CANON_ES.ADVERTISING_DATE <= TO_DATE(:")
          .append(bindIndex)
          .append(", 'YYYY-MM-DD')");
      bindValues.add(criteria.listingToDate().toString());
    }

    clause.append("))");
    where.addRawWithBinds(clause.toString(), bindValues.toArray(String[]::new));
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

  private void addRegionOrBlanketOic(SqlWhereBuilder where, List<Long> regionNumbers) {
    LinkedHashSet<Long> distinct = new LinkedHashSet<>();
    regionNumbers.stream()
        .filter(value -> value != null && value > 0)
        .forEach(distinct::add);
    if (distinct.isEmpty()) {
      where.addRaw(" AND EE.EXPORT_EXEMPTION_TYPE_CODE = 'B'");
      return;
    }

    int bindIndex = where.nextBindIndex();
    StringJoiner regionClauses = new StringJoiner(" OR ");
    List<String> bindValues = new ArrayList<>();
    for (Long regionNumber : distinct) {
      regionClauses.add("EO.ORG_UNIT_NO LIKE '%' || :" + bindIndex++ + " || '%'");
      bindValues.add(regionNumber.toString());
    }
    where.addRawWithBinds(
        " AND ((" + regionClauses + ") OR EE.EXPORT_EXEMPTION_TYPE_CODE = 'B')",
        bindValues.toArray(String[]::new));
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

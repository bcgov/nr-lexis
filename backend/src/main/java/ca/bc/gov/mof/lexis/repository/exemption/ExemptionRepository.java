package ca.bc.gov.mof.lexis.repository.exemption;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ExemptionRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_STS_CODES(?)";
  private static final String FIND_ALL_ORG_UNITS = LEXIS_CODES_PACKAGE + "FIND_ALL_ORG_UNITS(?)";

  private static final String FIND_EXEMPTIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTIONS_BY_CRITERIA(?,?,?,?,?)";
  private static final String FIND_EXEMPTION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTION_BY_NUMBER(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_EXEMPTION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_EXMP(?,?)";

  public ExemptionRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadExemptionTypeOptions() {
    return loadCodeNameOptions(FIND_ALL_EXEMPTION_TYPE_CODES).stream()
        .filter(option -> option.code() != null && !"F".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadExemptionStatusOptions() {
    return loadCodeNameOptions(FIND_ALL_EXEMPTION_STATUS_CODES).stream()
        .filter(option -> option.code() != null && !"EXP".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadRegionOptions() {
    return queryCursorProcedure(
        FIND_ALL_ORG_UNITS,
        null,
        1,
        rs -> {
          Long orgUnitNo = getLong(rs, "ORG_UNIT_NO");
          String regionCode = getString(rs, "ORG_UNIT_CODE");
          String regionName = getString(rs, "ORG_UNIT_NAME");
          return new CodeNameDto(
              orgUnitNo == null ? null : orgUnitNo.toString(),
              regionCode == null ? regionName : regionCode);
        });
  }

  public List<ExemptionSearchResultDto> search(ExemptionSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("EEA.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addLike("EP.PACKAGE_NUMBER", criteria.packageNumber());
    where.addLike("EE.EXEMPTION_NUMBER", criteria.exemptionNumber());
    where.addEquals("EE.EXPORT_EXEMPTION_TYPE_CODE", criteria.exemptionType());
    where.addEquals("EE.EXPORT_EXEMPTION_STATUS_CODE", criteria.exemptionStatus());
    where.addLike("EEA.OWNER_CLIENT_NUMBER", criteria.ownerClientNumber());

    String applicantClientNumber = trim(criteria.applicantClientNumber());
    if (applicantClientNumber != null) {
      int idx1 = where.nextBindIndex();
      int idx2 = idx1 + 1;
      where.addRawWithBinds(
          " AND (EEA.AGENT_CLIENT_NUMBER LIKE '%' || :"
              + idx1
              + " || '%' OR EEA.OWNER_CLIENT_NUMBER LIKE '%' || :"
              + idx2
              + " || '%')",
          applicantClientNumber,
          applicantClientNumber);
    }

    where.addDateGte("EE.APPROVAL_DATE", criteria.approvalFromDate());
    where.addDateLte("EE.APPROVAL_DATE", criteria.approvalToDate());
    where.addDateGte("ES.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("ES.ADVERTISING_DATE", criteria.listingToDate());
    where.addInLikeOrNoResults("EO.ORG_UNIT_NO", criteria.regionNumbers());

    SqlWhere sqlWhere = where.build(" ORDER BY EE.EXEMPTION_NUMBER DESC");

    return queryDynamicAllPages(
        FIND_EXEMPTIONS_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
        rs ->
            new ExemptionSearchResultDto(
                getString(rs, "EXEMPTION_NUMBER"),
                getString(rs, "EXPORT_EXEMPTION_TYPE_CODE"),
                firstNonNull(getString(rs, "EXPORT_EXEMPTION_STATUS_CODE"), getString(rs, "STATUS_DESCRIPTION")),
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                getLocalDate(rs, "APPROVAL_DATE"),
                getLocalDate(rs, "ADVERTISING_DATE"),
                firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE")),
                coalesce(getDouble(rs, "APPROVED_VOLUME"), 0.0d),
                false));
  }

  public Optional<ExemptionDetailDto> findByExemptionNumber(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    Optional<ExemptionDetailDto> detail =
        queryCursorSingle(
            FIND_EXEMPTION_BY_NUMBER,
            cs -> cs.setString(1, normalized),
            2,
            rs ->
                new ExemptionDetailDto(
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
                    coalesce(getDouble(rs, "APPROVED_VOLUME"), 0.0d),
                    0.0d,
                    coalesce(getDouble(rs, "VOLUME_REMAINING"), 0.0d),
                    getString(rs, "OTHER_CONDITIONS"),
                    "B".equalsIgnoreCase(getString(rs, "EXPORT_EXEMPTION_TYPE_CODE")),
                    List.of(),
                    List.of()));

    if (detail.isEmpty()) {
      return Optional.empty();
    }

    List<String> permitNumbers =
        queryCursorProcedure(
            FIND_PERMIT_DETAIL_BY_EXEMPTION,
            cs -> cs.setString(1, normalized),
            2,
            rs -> {
              Long permitNumber = getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER");
              return permitNumber == null ? null : permitNumber.toString();
            }).stream()
            .filter(value -> value != null && !value.isBlank())
            .toList();

    ExemptionDetailDto value = detail.get();
    return Optional.of(
        new ExemptionDetailDto(
            value.exemptionNumber(),
            value.exemptionTypeCode(),
            value.exemptionTypeDescription(),
            value.exemptionStatusCode(),
            value.exemptionStatusDescription(),
            value.ownerClientNumber(),
            value.agentClientNumber(),
            value.applicationNumber(),
            value.applicationStatus(),
            value.approvalDate(),
            value.expiryDate(),
            value.approvedVolume(),
            value.usedVolume(),
            value.remainingVolume(),
            value.otherConditions(),
            value.blanketOic(),
            permitNumbers,
            List.of()));
  }

  private String firstNonNull(String first, String second) {
    return first != null ? first : second;
  }

  private double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }
}

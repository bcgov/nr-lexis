package ca.bc.gov.mof.lexis.repository.reserve;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
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
public class IndianReservePermitRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_APPLICATION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";

  private static final String FIND_PERMIT_BY_CRITERIA =
      LEXIS_GROUP_3_PACKAGE + "FIND_IR_PERMIT_BY_CRITERIA(?,?,?,?,?)";
  private static final String COUNT_PERMIT_BY_CRITERIA =
      LEXIS_GROUP_3_PACKAGE + "COUNT_IR_PERMIT_BY_CRITERIA(?,?,?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_3_PACKAGE + "FIND_IR_PERM_DET_BY_ID(?,?)";

  public IndianReservePermitRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadApplicationStatusOptions() {
    return loadCodeNameOptions(FIND_ALL_APPLICATION_STATUS_CODES).stream()
        .filter(option -> option.code() == null || !"DAL".equalsIgnoreCase(option.code()))
        .toList();
  }

  public List<CodeNameDto> loadExemptionTypeOptions() {
    return loadCodeNameOptions(FIND_ALL_EXEMPTION_TYPE_CODES).stream()
        .filter(option -> "O".equalsIgnoreCase(option.code()) || "B".equalsIgnoreCase(option.code()))
        .toList();
  }

  public Page<IndianReservePermitSearchResultDto> search(IndianReservePermitSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    int totalElements =
        queryLegacyDynamicCountProcedure(COUNT_PERMIT_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
    return queryLegacyDynamicPage(
        FIND_PERMIT_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
        criteria.page(),
        criteria.size(),
        totalElements,
        rs ->
            new IndianReservePermitSearchResultDto(
                getString(rs, "EXPORT_INDIAN_RSRV_PRMT_DTL_ID"),
                getString(rs, "CLIENT_NUMBER"),
                getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
                getLocalDate(rs, "ESTIMATED_SHIPPING_DATE")));
  }

  public int count(IndianReservePermitSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    return queryLegacyDynamicCountProcedure(COUNT_PERMIT_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
  }

  private SqlWhere buildSearchWhere(IndianReservePermitSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addRaw(" AND CLIENT_NUMBER IS NOT NULL");
    where.addLike("EIRPD.EXPORT_INDIAN_RSRV_PRMT_DTL_ID", criteria.permitNumber());
    where.addLike("EP.PACKAGE_NUMBER", criteria.packageNumber());
    where.addDateGte("EIRPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedFromDate());
    where.addDateLte("EIRPD.EXPORT_PERMIT_ISSUE_DATE", criteria.issuedToDate());
    where.addDateGte("EIRPD.ESTIMATED_SHIPPING_DATE", criteria.shippingFromDate());
    where.addDateLte("EIRPD.ESTIMATED_SHIPPING_DATE", criteria.shippingToDate());

    return where.build(" ORDER BY EIRPD.EXPORT_INDIAN_RSRV_PRMT_DTL_ID DESC");
  }

  public Optional<IndianReservePermitDetailDto> findByPermitNumber(String permitNumber) {
    String normalized = trim(permitNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PERMIT_DETAIL_BY_ID,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new IndianReservePermitDetailDto(
                getString(rs, "EXPORT_INDIAN_RSRV_PRMT_DTL_ID"),
                getString(rs, "CLIENT_NUMBER"),
                getString(rs, "CLIENT_LOCN_CODE"),
                getLong(rs, "ORG_UNIT_NO"),
                getLocalDate(rs, "APPLICATION_DATE"),
                getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
                getLocalDate(rs, "ESTIMATED_SHIPPING_DATE"),
                getString(rs, "EXPORT_COUNTRY_CODE"),
                getString(rs, "EXPORT_TRANSPORT_TYPE_CODE"),
                getString(rs, "TRANSPORT_NAME"),
                getString(rs, "EXPORT_PORT_OF_EXPORT_CODE"),
                getString(rs, "OTHER_PORT_OF_EXPORT"),
                List.of()));
  }
}

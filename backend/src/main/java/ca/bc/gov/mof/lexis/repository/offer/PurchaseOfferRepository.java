package ca.bc.gov.mof.lexis.repository.offer;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PurchaseOfferRepository extends OracleRepositorySupport {

  private static final String FIND_ALL_ORG_UNITS = LEXIS_CODES_PACKAGE + "FIND_ALL_ORG_UNITS(?)";

  private static final String FIND_PURCHASE_OFFERS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_POS_BY_CRITERIA(?,?,?,?,?)";
  private static final String FIND_PURCHASE_OFFER_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_PURCHASE_OFFERS_BY_NUM(?,?)";

  public PurchaseOfferRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
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

  public List<PurchaseOfferSearchResultDto> search(PurchaseOfferSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("EEA.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addLike("PO.PACKAGE_NUMBER", criteria.packageNumber());
    where.addDateGte("ES.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("ES.ADVERTISING_DATE", criteria.listingToDate());
    where.addDateGte("PO.OFFER_WITHDRAWAL_DATE", criteria.withdrawalFromDate());
    where.addDateLte("PO.OFFER_WITHDRAWAL_DATE", criteria.withdrawalToDate());
    where.addInEqualsNumberOrNoResults("EEA.ORG_UNIT_NO", criteria.regionNumbers());

    String clientNumber = trim(criteria.clientNumber());
    if (clientNumber != null) {
      int idx1 = where.nextBindIndex();
      int idx2 = idx1 + 1;
      where.addRawWithBinds(
          " AND (EEA.OWNER_CLIENT_NUMBER LIKE '%' || :"
              + idx1
              + " || '%' OR EEA.AGENT_CLIENT_NUMBER LIKE '%' || :"
              + idx2
              + " || '%')",
          clientNumber,
          clientNumber);
    }
    where.addLike("PO.OFFERING_CLIENT_NUMBER", criteria.offeringClientNumber());
    if (criteria.excludeWithdrawn()) {
      where.addRaw(" AND PO.OFFER_WITHDRAWAL_DATE IS NULL");
    }
    if (criteria.restrictToProvincialOrNullJurisdiction()) {
      where.addRaw(
          " AND (EEA.EXPORT_JURISDICTION_CODE = 'P' OR EEA.EXPORT_JURISDICTION_CODE IS NULL)");
    }

    String orderBy =
        sanitizedSort(
            criteria.sortField(),
            mapOf(
                "applicationNumber", "EEA.APPLICATION_NUMBER",
                "packageNumber", "PO.PACKAGE_NUMBER",
                "offerNumber", "PO.EXPORT_PURCHASE_OFFER_NUMBER",
                "listingDate", "ES.ADVERTISING_DATE",
                "offerWithdrawalDate", "PO.OFFER_WITHDRAWAL_DATE",
                "region", "OU.ORG_UNIT_NAME",
                "offeringClientNumber", "PO.OFFERING_CLIENT_NUMBER"),
            "offerNumber",
            "DESC");

    SqlWhere sqlWhere = where.build(orderBy);

    return queryDynamicAllPages(
        FIND_PURCHASE_OFFERS_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
        rs ->
            new PurchaseOfferSearchResultDto(
                getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getLocalDate(rs, "ADVERTISING_DATE"),
                firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE")),
                getLocalDate(rs, "OFFER_WITHDRAWAL_DATE")));
  }

  public Optional<PurchaseOfferDetailDto> findByOfferNumber(Long offerNumber) {
    if (offerNumber == null || offerNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PURCHASE_OFFER_BY_NUMBER,
        cs -> cs.setString(1, offerNumber.toString()),
        2,
        rs ->
            new PurchaseOfferDetailDto(
                getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "COMPANY_NAME"),
                getString(rs, "CONTACT_NAME"),
                coalesce(getDouble(rs, "PURCHASE_OFFER_AMOUNT"), 0.0d),
                getLocalDate(rs, "PURCHASE_OFFER_DATE"),
                getLocalDate(rs, "OFFER_WITHDRAWAL_DATE"),
                getLocalDate(rs, "TEAC_REVIEW_DATE"),
                getString(rs, "APPROVAL_INDICATOR"),
                getString(rs, "VALID_OFFER_INDICATOR"),
                getString(rs, "FAIR_OFFER_INDICATOR"),
                getString(rs, "OFFER_REMARK"),
                getString(rs, "WITHDRAW_REASON"),
                getString(rs, "EXPORT_JURISDICTION_CODE"),
                getString(rs, "MANUFACTURING_FACILITY_INFO"),
                getString(rs, "OFFERING_CLIENT_NUMBER"),
                getString(rs, "PICKUP_LOCATION"),
                getString(rs, "OFFER_CONDITION"),
                getLocalDate(rs, "ADVERTISING_DATE"),
                getLocalDate(rs, "OFFER_END_DATE"),
                coalesce(getDouble(rs, "EXPORT_PURCHASE_VOLUME"), 0.0d),
                firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE"))));
  }

  private String firstNonNull(String first, String second) {
    return first != null ? first : second;
  }

  private double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }
}

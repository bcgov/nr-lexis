package ca.bc.gov.mof.lexis.repository.offer;

import static ca.bc.gov.mof.lexis.util.ValueUtils.coalesce;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.CallableStatement;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PurchaseOfferRepository extends OracleRepositorySupport {

  private static final String MANUFACTURING_FACILITY_DEFAULT = " ";
  private static final String PURCHASE_OFFER_SEARCH_FROM =
      """
      FROM EXPORT_PURCHASE_OFFER PO
      INNER JOIN EXPORT_EXEMPTION_APPLICATION EEA
        ON EEA.APPLICATION_NUMBER = PO.APPLICATION_NUMBER
      LEFT JOIN EXPORT_SCHEDULE ES
        ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
      LEFT JOIN ORG_UNIT OU
        ON OU.ORG_UNIT_NO = EEA.ORG_UNIT_NO
      """;
  private static final String SEARCH_PURCHASE_OFFERS =
      """
      SELECT
        PO.EXPORT_PURCHASE_OFFER_NUMBER,
        EEA.APPLICATION_NUMBER,
        PO.PACKAGE_NUMBER,
        ES.ADVERTISING_DATE,
        OU.ORG_UNIT_CODE AS REGION,
        PO.OFFER_WITHDRAWAL_DATE
      """
          + PURCHASE_OFFER_SEARCH_FROM;
  private static final String COUNT_PURCHASE_OFFERS =
      "SELECT COUNT(*)\n" + PURCHASE_OFFER_SEARCH_FROM;
  private static final Map<String, String> SEARCH_SORT_COLUMNS =
      Map.ofEntries(
          Map.entry("applicationNumber", "EEA.APPLICATION_NUMBER"),
          Map.entry("packageNumber", "PO.PACKAGE_NUMBER"),
          Map.entry("offerNumber", "PO.EXPORT_PURCHASE_OFFER_NUMBER"),
          Map.entry("listingDate", "ES.ADVERTISING_DATE"),
          Map.entry("offerWithdrawalDate", "PO.OFFER_WITHDRAWAL_DATE"),
          Map.entry("region", "OU.ORG_UNIT_NAME"),
          Map.entry("offeringClientNumber", "PO.OFFERING_CLIENT_NUMBER"));
  private static final String FIND_PURCHASE_OFFER_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_PURCHASE_OFFERS_BY_NUM(?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_PACKAGE_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGE_BY_NUMBER(?,?)";
  private static final String INSERT_PURCHASE_OFFER =
      LEXIS_GROUP_9_PACKAGE + "INSERT_PURCHASE_OFFER(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String UPDATE_PURCHASE_OFFER =
      LEXIS_GROUP_9_PACKAGE + "UPDATE_PURCHASE_OFFER(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

  public PurchaseOfferRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptionsRequired(true);
  }

  public Page<PurchaseOfferSearchResultDto> search(PurchaseOfferSearchCriteria criteria) {
    return search(criteria, null);
  }

  public Page<PurchaseOfferSearchResultDto> search(
      PurchaseOfferSearchCriteria criteria, Integer knownTotal) {
    DirectSql countCriteria = buildSearchWhere(criteria, false);
    DirectSql pageCriteria = buildSearchWhere(criteria, true);
    int totalElements =
        knownTotal == null
            ? queryDirectCount(COUNT_PURCHASE_OFFERS, countCriteria)
            : Math.max(0, knownTotal);
    return queryDirectPage(
        SEARCH_PURCHASE_OFFERS,
        pageCriteria,
        criteria.page(),
        criteria.size(),
        totalElements,
        rs ->
            new PurchaseOfferSearchResultDto(
                getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getLocalDate(rs, "ADVERTISING_DATE"),
                firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE")),
                getLocalDate(rs, "OFFER_WITHDRAWAL_DATE")));
  }

  public int count(PurchaseOfferSearchCriteria criteria) {
    return queryDirectCount(COUNT_PURCHASE_OFFERS, buildSearchWhere(criteria, false));
  }

  private DirectSql buildSearchWhere(
      PurchaseOfferSearchCriteria criteria, boolean includeOrderBy) {
    DirectSqlBuilder where = newDirectSqlBuilder();

    where.addNumberLike("EEA.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addLike("PO.PACKAGE_NUMBER", criteria.packageNumber());
    where.addDateGte("ES.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("ES.ADVERTISING_DATE", criteria.listingToDate());
    where.addDateGte("PO.OFFER_WITHDRAWAL_DATE", criteria.withdrawalFromDate());
    where.addDateLte("PO.OFFER_WITHDRAWAL_DATE", criteria.withdrawalToDate());
    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      where.addInEqualsNumberOrNoResults("EEA.ORG_UNIT_NO", criteria.regionNumbers());
    }

    String clientNumber = trim(criteria.clientNumber());
    if (clientNumber != null) {
      where.addRawWithBinds(
          " AND (EEA.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%'"
              + " OR EEA.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%')",
          clientNumber,
          clientNumber);
    }
    where.addLike("PO.OFFERING_CLIENT_NUMBER", criteria.offeringClientNumber());
    String accessClientNumber = trim(criteria.accessClientNumber());
    if (accessClientNumber != null) {
      where.addRawWithBinds(
          " AND (EEA.OWNER_CLIENT_NUMBER = ?"
              + " OR EEA.AGENT_CLIENT_NUMBER = ?"
              + " OR PO.OFFERING_CLIENT_NUMBER = ?)",
          accessClientNumber,
          accessClientNumber,
          accessClientNumber);
    }
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
            SEARCH_SORT_COLUMNS,
            "offerNumber",
            "DESC",
            "offerNumber");

    return where.build(includeOrderBy ? orderBy : "");
  }

  public Optional<PurchaseOfferDetailDto> findByOfferNumber(Long offerNumber) {
    if (offerNumber == null || offerNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_PURCHASE_OFFER_BY_NUMBER,
        cs -> cs.setString(1, offerNumber.toString()),
        2,
        rs ->
            new PurchaseOfferDetailDto(
                getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                null,
                null,
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
                getDouble(rs, "EXPORT_PURCHASE_VOLUME"),
                getString(rs, "REGION"),
                false,
                false,
                false,
                false,
                false,
                null,
                null,
                firstNonNull(getString(rs, "UPDATE_USERID"), getString(rs, "ENTRY_USERID"))));
  }

  public Optional<PurchaseOfferInsertRow> insertOffer(PurchaseOfferInsertRecord record) {
    if (record == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        INSERT_PURCHASE_OFFER,
        cs -> bindPurchaseOfferInsert(cs, record),
        24,
        this::mapPurchaseOfferInsertRow)
        .filter(
            row ->
                row.exportPurchaseOfferNumber() != null
                    && row.exportPurchaseOfferNumber() > 0);
  }

  public boolean applicationExists(Long applicationNumber) {
    return findApplicationReference(applicationNumber).isPresent();
  }

  public Optional<ApplicationReferenceRow> findApplicationReference(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingleRequired(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ApplicationReferenceRow(
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "EXPORT_JURISDICTION_CODE")));
  }

  public Optional<ApplicationRecipientRow> findApplicationRecipient(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingleRequired(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ApplicationRecipientRow(
                getString(rs, "EXPORT_APPLICANT_TYPE_CODE"),
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                getString(rs, "AGENT_CLIENT_NUMBER"),
                getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
                getLong(rs, "ORG_UNIT_NO")));
  }

  public Optional<Long> findPackageApplicationNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingleRequired(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs -> getLong(rs, "APPLICATION_NUMBER"));
  }

  public Optional<PurchaseOfferUpdateSourceRow> findUpdateSourceByOfferNumber(Long offerNumber) {
    if (offerNumber == null || offerNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_PURCHASE_OFFER_BY_NUMBER,
        cs -> cs.setLong(1, offerNumber),
        2,
        this::mapPurchaseOfferUpdateSourceRow);
  }

  public boolean updateOffer(PurchaseOfferUpdateRecord record) {
    if (record == null || record.exportPurchaseOfferNumber() == null) {
      return false;
    }

    executeProcedureRequired(UPDATE_PURCHASE_OFFER, cs -> bindPurchaseOfferUpdate(cs, record));
    return true;
  }

  private void bindPurchaseOfferInsert(CallableStatement cs, PurchaseOfferInsertRecord record)
      throws SQLException {
    int index = 1;
    setStringOrNull(cs, index++, record.packageNumber());
    setStringOrNull(cs, index++, record.companyName());
    setStringOrNull(cs, index++, record.contactName());
    setDoubleOrNull(cs, index++, record.purchaseOfferAmount());
    setDateOrNull(cs, index++, record.purchaseOfferDate());
    setDateOrNull(cs, index++, record.offerWithdrawalDate());
    setDateOrNull(cs, index++, record.teacReviewDate());
    setStringOrNull(cs, index++, record.fairOfferIndicator());
    setStringOrNull(cs, index++, record.validOfferIndicator());
    setStringOrNull(cs, index++, record.offerRemark());
    setStringOrNull(cs, index++, record.approvalIndicator());
    setStringOrNull(cs, index++, record.withdrawReason());
    setStringOrNull(cs, index++, record.exportJurisdictionCode());
    setStringOrDefault(cs, index++, record.manufacturingFacilityInfo(), MANUFACTURING_FACILITY_DEFAULT);
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    cs.setTimestamp(index++, Timestamp.from(Instant.now()));
    setStringOrNull(cs, index++, record.updateUserId());
    cs.setNull(index++, Types.TIMESTAMP);
    setStringOrNull(cs, index++, record.offeringClientNumber());
    setStringOrNull(cs, index++, record.pickupLocation());
    setStringOrNull(cs, index++, record.offerCondition());
    setLongOrNull(cs, index++, record.applicationNumber());
    setDoubleOrNull(cs, index, record.offerVolume());
  }

  private PurchaseOfferInsertRow mapPurchaseOfferInsertRow(ResultSet rs) {
    return new PurchaseOfferInsertRow(getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER"));
  }

  private PurchaseOfferUpdateSourceRow mapPurchaseOfferUpdateSourceRow(ResultSet rs) {
    return new PurchaseOfferUpdateSourceRow(
        getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER"),
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "PACKAGE_NUMBER"),
        getString(rs, "COMPANY_NAME"),
        getString(rs, "CONTACT_NAME"),
        getDouble(rs, "PURCHASE_OFFER_AMOUNT"),
        getLocalDate(rs, "PURCHASE_OFFER_DATE"),
        getLocalDate(rs, "OFFER_WITHDRAWAL_DATE"),
        getLocalDate(rs, "TEAC_REVIEW_DATE"),
        getString(rs, "FAIR_OFFER_INDICATOR"),
        getString(rs, "VALID_OFFER_INDICATOR"),
        getString(rs, "OFFER_REMARK"),
        getString(rs, "APPROVAL_INDICATOR"),
        getString(rs, "WITHDRAW_REASON"),
        getString(rs, "EXPORT_JURISDICTION_CODE"),
        getString(rs, "MANUFACTURING_FACILITY_INFO"),
        getString(rs, "PICKUP_LOCATION"),
        getString(rs, "OFFER_CONDITION"),
        getString(rs, "ENTRY_USERID"),
        getInstant(rs, "ENTRY_TIMESTAMP"),
        getDouble(rs, "EXPORT_PURCHASE_VOLUME"));
  }

  private void bindPurchaseOfferUpdate(CallableStatement cs, PurchaseOfferUpdateRecord record)
      throws SQLException {
    int index = 1;
    setLongOrNull(cs, index++, record.exportPurchaseOfferNumber());
    setStringOrNull(cs, index++, record.packageNumber());
    setStringOrNull(cs, index++, record.companyName());
    setStringOrNull(cs, index++, record.contactName());
    setDoubleOrNull(cs, index++, record.purchaseOfferAmount());
    setDateOrNull(cs, index++, record.purchaseOfferDate());
    setDateOrNull(cs, index++, record.offerWithdrawalDate());
    setDateOrNull(cs, index++, record.teacReviewDate());
    setStringOrNull(cs, index++, record.fairOfferIndicator());
    setStringOrNull(cs, index++, record.validOfferIndicator());
    setStringOrNull(cs, index++, record.offerRemark());
    setStringOrNull(cs, index++, record.approvalIndicator());
    setStringOrNull(cs, index++, record.withdrawReason());
    setStringOrNull(cs, index++, record.exportJurisdictionCode());
    setStringOrDefault(cs, index++, record.manufacturingFacilityInfo(), MANUFACTURING_FACILITY_DEFAULT);
    setStringOrNull(cs, index++, record.pickupLocation());
    setStringOrNull(cs, index++, record.offerCondition());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    cs.setString(index++, auditUserOrDefault(record.updateUserId()));
    cs.setTimestamp(index++, Timestamp.from(Instant.now()));
    setDoubleOrNull(cs, index, record.offerVolume());
  }

  public record PurchaseOfferInsertRecord(
      String packageNumber,
      String companyName,
      String contactName,
      Double purchaseOfferAmount,
      LocalDate purchaseOfferDate,
      LocalDate offerWithdrawalDate,
      LocalDate teacReviewDate,
      String fairOfferIndicator,
      String validOfferIndicator,
      String offerRemark,
      String approvalIndicator,
      String withdrawReason,
      String exportJurisdictionCode,
      String manufacturingFacilityInfo,
      String entryUserId,
      String updateUserId,
      String offeringClientNumber,
      String pickupLocation,
      String offerCondition,
      Long applicationNumber,
      Double offerVolume) {}

  public record PurchaseOfferInsertRow(Long exportPurchaseOfferNumber) {}

  public record ApplicationRecipientRow(
      String applicantTypeCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      Long orgUnitNumber) {

    public ApplicationRecipientRow(
        String applicantTypeCode,
        String ownerClientNumber,
        String ownerClientLocationCode,
        String agentClientNumber,
        String agentClientLocationCode) {
      this(
          applicantTypeCode,
          ownerClientNumber,
          ownerClientLocationCode,
          agentClientNumber,
          agentClientLocationCode,
          null);
    }
  }

  public record ApplicationReferenceRow(Long applicationNumber, String jurisdictionCode) {}

  public record PurchaseOfferUpdateSourceRow(
      Long exportPurchaseOfferNumber,
      Long applicationNumber,
      String packageNumber,
      String companyName,
      String contactName,
      Double purchaseOfferAmount,
      LocalDate purchaseOfferDate,
      LocalDate offerWithdrawalDate,
      LocalDate teacReviewDate,
      String fairOfferIndicator,
      String validOfferIndicator,
      String offerRemark,
      String approvalIndicator,
      String withdrawReason,
      String exportJurisdictionCode,
      String manufacturingFacilityInfo,
      String pickupLocation,
      String offerCondition,
      String entryUserId,
      Instant entryTimestamp,
      Double offerVolume) {}

  public record PurchaseOfferUpdateRecord(
      Long exportPurchaseOfferNumber,
      String packageNumber,
      String companyName,
      String contactName,
      Double purchaseOfferAmount,
      LocalDate purchaseOfferDate,
      LocalDate offerWithdrawalDate,
      LocalDate teacReviewDate,
      String fairOfferIndicator,
      String validOfferIndicator,
      String offerRemark,
      String approvalIndicator,
      String withdrawReason,
      String exportJurisdictionCode,
      String manufacturingFacilityInfo,
      String pickupLocation,
      String offerCondition,
      String entryUserId,
      Instant entryTimestamp,
      String updateUserId,
      Double offerVolume) {}

  private void setStringOrNull(CallableStatement cs, int index, String value) throws SQLException {
    String normalized = trim(value);
    if (normalized == null) {
      cs.setNull(index, Types.VARCHAR);
    } else {
      cs.setString(index, normalized);
    }
  }

  private void setStringOrDefault(CallableStatement cs, int index, String value, String fallback)
      throws SQLException {
    String normalized = trim(value);
    cs.setString(index, normalized == null ? fallback : normalized);
  }

  private void setLongOrNull(CallableStatement cs, int index, Long value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.NUMERIC);
    } else {
      cs.setLong(index, value);
    }
  }

  private void setDoubleOrNull(CallableStatement cs, int index, Double value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.DOUBLE);
    } else {
      cs.setDouble(index, value);
    }
  }

  private void setDateOrNull(CallableStatement cs, int index, LocalDate value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.DATE);
    } else {
      cs.setDate(index, Date.valueOf(value));
    }
  }

  private void setTimestampOrNull(CallableStatement cs, int index, Instant value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.TIMESTAMP);
    } else {
      cs.setTimestamp(index, Timestamp.from(value));
    }
  }

  private Instant getInstant(ResultSet rs, String column) {
    try {
      Timestamp value = rs.getTimestamp(column);
      return value == null ? null : value.toInstant();
    } catch (SQLException ex) {
      return null;
    }
  }
}

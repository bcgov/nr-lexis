package ca.bc.gov.mof.lexis.repository.application;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import org.springframework.data.domain.Page;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class LexisApplicationRepository extends OracleRepositorySupport {

  private static final String APPLICATION_STATUS_APPROVED = "APP";
  private static final String APPLICANT_TYPE_AGENT = "A";
  private static final String APPLICANT_TYPE_OWNER = "O";
  private static final String JURISDICTION_FEDERAL = "F";
  private static final String OIC_INDICATOR_NO = "N";
  private static final String EXPORT_PRODUCT_TYPE_STANDING = "S";
  private static final String INDICATOR_YES = "Y";

  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_REASON_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_RSN_CODES(?)";
  private static final String FIND_ALL_APPLICATION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)";
  private static final String FIND_ALL_PRODUCT_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PRODUCT_TYPE_CODES(?)";
  private static final String FIND_APPLICATIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATIONS_BY_CRITERIA(?,?,?,?,?)";
  private static final String COUNT_APPLICATIONS_BY_CRITERIA =
      LEXIS_GROUP_5_PACKAGE + "COUNT_APPLICATIONS_BY_CRITERIA(?,?,?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_PACKAGE_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGE_BY_NUMBER(?,?)";
  private static final String FIND_PACKAGES_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_APP(?,?)";
  private static final String FIND_REMARKS_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_REMARKS_BY_APP(?,?)";
  private static final String FIND_PURCHASE_OFFERS_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PURCHASE_OFFERS_BY_APP(?,?)";
  private static final String FIND_SCHEDULE_BY_APPLICATION =
      LEXIS_CODES_PACKAGE + "FIND_SCHEDULE_BY_APP(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_APP(?,?)";

  public LexisApplicationRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> loadExemptionTypeOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    options.add(new CodeNameDto("ALL", "All"));
    options.addAll(
        loadCodeNameOptions(FIND_ALL_EXEMPTION_TYPE_CODES).stream()
            .filter(option -> option.code() == null || !JURISDICTION_FEDERAL.equalsIgnoreCase(option.code()))
            .toList());
    return options;
  }

  public List<CodeNameDto> loadExemptionReasonOptions() {
    return loadCodeNameOptions(FIND_ALL_EXEMPTION_REASON_CODES);
  }

  public List<CodeNameDto> loadApplicationStatusOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    options.add(new CodeNameDto("", "All"));
    options.addAll(loadCodeNameOptions(FIND_ALL_APPLICATION_STATUS_CODES));
    return options;
  }

  public List<CodeNameDto> loadProductTypeOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    options.add(new CodeNameDto("", "All"));
    options.addAll(loadCodeNameOptions(FIND_ALL_PRODUCT_TYPE_CODES));
    return options;
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptions(false);
  }

  public Page<LexisApplicationSearchResultDto> search(LexisApplicationSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    LocalDate today = LocalDate.now(ZoneId.systemDefault());
    int totalElements =
        queryLegacyDynamicCountProcedure(COUNT_APPLICATIONS_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
    return queryLegacyDynamicPage(
        FIND_APPLICATIONS_BY_CRITERIA,
        sqlWhere.sql(),
        sqlWhere.bindValues(),
        criteria.page(),
        criteria.size(),
        totalElements,
        rs -> toSearchResult(rs, today));
  }

  public int count(LexisApplicationSearchCriteria criteria) {
    SqlWhere sqlWhere = buildSearchWhere(criteria);
    return queryLegacyDynamicCountProcedure(COUNT_APPLICATIONS_BY_CRITERIA, sqlWhere.sql(), sqlWhere.bindValues());
  }

  private SqlWhere buildSearchWhere(LexisApplicationSearchCriteria criteria) {
    SqlWhereBuilder where = newWhereBuilder();

    where.addLike("v.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addRaw(" AND v.APPLICATION_NUMBER > TO_NUMBER(0)");
    where.addLike("v.PACKAGE_NUMBER", criteria.packageNumber());
    where.addLike("v.EXEMPTION_NUMBER", criteria.exemptionNumber());
    where.addEquals("v.EXPORT_APPLICATION_STATUS_CODE", criteria.applicationStatus());
    where.addEquals("v.EXPORT_PRODUCT_TYPE_CODE", criteria.productTypeCode());
    where.addDateGte("v.RECEIVED_DATE", criteria.receivedFromDate());
    where.addDateLte("v.RECEIVED_DATE", criteria.receivedToDate());
    where.addDateGte("v.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("v.ADVERTISING_DATE", criteria.listingToDate());
    where.addLike("v.OWNER_CLIENT_NUMBER", criteria.ownerClientNumber());
    where.addRaw(" AND v.EXPORT_JURISDICTION_CODE <> '" + JURISDICTION_FEDERAL + "'");
    where.addEquals("v.OIC_INDICATOR", OIC_INDICATOR_NO);
    if (criteria.regionNumbers() != null && !criteria.regionNumbers().isEmpty()) {
      where.addInEqualsNumberOrNoResults("v.ORG_UNIT_NO", criteria.regionNumbers());
    }

    String exemptionType = trim(criteria.exemptionType());
    if (exemptionType != null && !"ALL".equalsIgnoreCase(exemptionType)) {
      where.addEquals("v.EXPORT_EXEMPTION_TYPE_CODE", exemptionType);
    }

    String agentClientNumber = trim(criteria.agentClientNumber());
    if (agentClientNumber != null) {
      int idx1 = where.nextBindIndex();
      int idx2 = idx1 + 1;
      where.addRawWithBinds(
          " AND ((v.OWNER_CLIENT_NUMBER LIKE '%' || :"
              + idx1
              + " || '%' AND v.EXPORT_APPLICANT_TYPE_CODE = '"
              + APPLICANT_TYPE_OWNER
              + "') OR (v.AGENT_CLIENT_NUMBER LIKE '%' || :"
              + idx2
              + " || '%' AND v.EXPORT_APPLICANT_TYPE_CODE = '"
              + APPLICANT_TYPE_AGENT
              + "'))",
          agentClientNumber,
          agentClientNumber);
    }

    return where.build(buildSortOrder(criteria.sortField()));
  }

  public Optional<LexisApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    Optional<ApplicationSnapshot> snapshot =
        queryCursorSingle(
            FIND_APPLICATION_BY_NUMBER,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            this::mapSnapshot);

    if (snapshot.isEmpty()) {
      return Optional.empty();
    }

    ApplicationSnapshot app = snapshot.get();
    List<LexisApplicationDetailDto.LexisPackageDto> packages =
        loadPackagesByApplication(applicationNumber);
    List<LexisApplicationDetailDto.LexisRemarkDto> remarks = loadRemarksByApplication(applicationNumber);
    List<LexisApplicationDetailDto.LexisOfferDto> offers = loadOffersByApplication(applicationNumber);

    return Optional.of(
        new LexisApplicationDetailDto(
            app.applicationNumber(),
            app.exemptionNumber(),
            app.applicationStatusCode(),
            app.statusDescription(),
            app.ownerClientNumber(),
            app.agentClientNumber(),
            app.orgUnitNumber(),
            firstNonNull(app.regionCode(), app.regionName()),
            app.productTypeCode(),
            app.exemptionReasonCode(),
            app.applicationDate(),
            app.receivedDate(),
            app.listingDate(),
            app.termDays(),
            coalesce(app.applicationVolume(), 0.0d),
            coalesce(app.averageLogVolume(), 0.0d),
            canCreateOffers(applicationNumber),
            false,
            false,
            false,
            false,
            packages,
            remarks,
            offers));
  }

  public Optional<LexisPackageLookupDto> findPackageByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new LexisPackageLookupDto(
                getString(rs, "PACKAGE_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                coalesce(getDouble(rs, "PACKAGE_VOLUME"), 0.0d),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE")));
  }

  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return false;
    }

    String previousOwnerClient = null;
    String previousOwnerLocation = null;
    String previousAgentClient = null;

    for (int i = 0; i < applicationNumbers.size(); i++) {
      Long applicationNumber = applicationNumbers.get(i);
      if (applicationNumber == null || applicationNumber < 1) {
        return false;
      }

      Optional<ApplicationSnapshot> current = loadSnapshot(applicationNumber);
      if (current.isEmpty()) {
        return false;
      }

      ApplicationSnapshot app = current.get();
      if (previousOwnerClient == null) {
        previousOwnerClient = app.ownerClientNumber();
      }
      if (previousOwnerLocation == null) {
        previousOwnerLocation = app.ownerClientLocationCode();
      }

      if (!equalsNullable(previousOwnerClient, app.ownerClientNumber())) {
        return false;
      }
      if (!equalsNullable(previousOwnerLocation, app.ownerClientLocationCode())) {
        return false;
      }

      if (previousAgentClient != null && !equalsNullable(previousAgentClient, app.agentClientNumber())) {
        return false;
      }
      if (previousAgentClient == null && i != 0 && app.agentClientLocationCode() != null) {
        return false;
      }
      previousAgentClient = app.agentClientNumber();
    }

    return true;
  }

  public boolean hasValidOffer(List<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return false;
    }

    for (Long applicationNumber : applicationNumbers) {
      if (applicationNumber == null || applicationNumber < 1) {
        continue;
      }
      List<LexisApplicationDetailDto.LexisOfferDto> offers = loadOffersByApplication(applicationNumber);
      for (LexisApplicationDetailDto.LexisOfferDto offer : offers) {
        if (offer.validOffer() && offer.withdrawalDate() == null) {
          return true;
        }
      }
    }

    return false;
  }

  private Optional<ApplicationSnapshot> loadSnapshot(Long applicationNumber) {
    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapSnapshot);
  }

  private LexisApplicationSearchResultDto toSearchResult(ResultSet rs, LocalDate today) {
    Long applicationNumber = getLong(rs, "APPLICATION_NUMBER");
    String statusCode = getString(rs, "EXPORT_APPLICATION_STATUS_CODE");
    String statusDescription = firstNonNull(getString(rs, "STATUS_DESCRIPTION"), statusCode);
    String ownerClientNumber = getString(rs, "OWNER_CLIENT_NUMBER");
    String agentClientNumber = getString(rs, "AGENT_CLIENT_NUMBER");
    String applicantType = getString(rs, "EXPORT_APPLICANT_TYPE_CODE");
    String exemptionNumber = firstNonNull(getString(rs, "EXEMPTION_NUMBER"), "");
    String region =
        firstNonNull(
            getString(rs, "REGION_CODE"),
            firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_CODE")));
    LocalDate listingDate = getLocalDate(rs, "ADVERTISING_DATE");
    Double applicationVolume =
        firstNonNullDouble(getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"), getDouble(rs, "APPLICATION_VOLUME"));
    String productTypeCode = getString(rs, "EXPORT_PRODUCT_TYPE_CODE");

    String client = "";
    if (APPLICANT_TYPE_AGENT.equalsIgnoreCase(applicantType)
        && agentClientNumber != null
        && !agentClientNumber.equals(ownerClientNumber)) {
      client = agentClientNumber;
    }

    boolean showCheckbox =
        canBeExempted(
            statusCode,
            exemptionNumber,
            listingDate,
            productTypeCode,
            today,
            applicationNumber == null ? null : applicationNumber.toString());

    return new LexisApplicationSearchResultDto(
        applicationNumber == null ? 0L : applicationNumber,
        statusDescription,
        client,
        ownerClientNumber,
        exemptionNumber,
        listingDate,
        region,
        coalesce(applicationVolume, 0.0d),
        showCheckbox,
        false);
  }

  private boolean canBeExempted(
      String statusCode,
      String exemptionNumber,
      LocalDate listingDate,
      String productTypeCode,
      LocalDate today,
      String applicationNumber) {
    if (exemptionNumber != null && !exemptionNumber.isBlank()) {
      return false;
    }
    if (!APPLICATION_STATUS_APPROVED.equalsIgnoreCase(statusCode)) {
      return false;
    }

    if (applicationNumber != null) {
      try {
        if (hasValidOffer(List.of(Long.parseLong(applicationNumber)))) {
          return false;
        }
      } catch (NumberFormatException ignored) {
        return false;
      }
    }

    if (listingDate != null
        && listingDate.isAfter(today)
        && !EXPORT_PRODUCT_TYPE_STANDING.equalsIgnoreCase(productTypeCode)) {
      return false;
    }
    return true;
  }

  private List<LexisApplicationDetailDto.LexisPackageDto> loadPackagesByApplication(Long applicationNumber) {
    Map<String, Long> pieceCountByPackage = loadPieceCountByPackage(applicationNumber);

    return queryCursorProcedure(
        FIND_PACKAGES_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> {
          String packageNumber = getString(rs, "PACKAGE_NUMBER");
          Double volume = getDouble(rs, "PACKAGE_VOLUME");
          long pieceCount = pieceCountByPackage.getOrDefault(packageNumber, 0L);
          return new LexisApplicationDetailDto.LexisPackageDto(
              packageNumber,
              coalesce(volume, 0.0d),
              pieceCount);
        });
  }

  private Map<String, Long> loadPieceCountByPackage(Long applicationNumber) {
    List<PieceCountSnapshot> rows =
        queryCursorProcedure(
            FIND_SCALE_DETAIL_BY_APPLICATION,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs -> new PieceCountSnapshot(getString(rs, "PACKAGE_NUMBER"), getLong(rs, "PIECES_COUNT")));

    Map<String, Long> pieceCountByPackage = new HashMap<>();
    for (PieceCountSnapshot row : rows) {
      if (row.packageNumber() == null) {
        continue;
      }
      pieceCountByPackage.merge(row.packageNumber(), coalesce(row.pieceCount(), 0L), Long::sum);
    }
    return pieceCountByPackage;
  }

  private List<LexisApplicationDetailDto.LexisRemarkDto> loadRemarksByApplication(Long applicationNumber) {
    return queryCursorProcedure(
        FIND_REMARKS_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> {
          String remark = getString(rs, "REMARK");
          return new LexisApplicationDetailDto.LexisRemarkDto(remark, remark);
        });
  }

  private List<LexisApplicationDetailDto.LexisOfferDto> loadOffersByApplication(Long applicationNumber) {
    return queryCursorProcedure(
        FIND_PURCHASE_OFFERS_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new LexisApplicationDetailDto.LexisOfferDto(
                offerNumberAsString(rs),
                INDICATOR_YES.equalsIgnoreCase(getString(rs, "VALID_OFFER_INDICATOR")),
                getLocalDate(rs, "OFFER_WITHDRAWAL_DATE")));
  }

  private boolean canCreateOffers(Long applicationNumber) {
    Optional<ScheduleSnapshot> schedule =
        queryCursorSingle(
            FIND_SCHEDULE_BY_APPLICATION,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs -> new ScheduleSnapshot(getLocalDate(rs, "ADVERTISING_DATE"), getLocalDate(rs, "OFFER_RECEIPT_DATE")));

    if (schedule.isEmpty()) {
      return false;
    }

    LocalDate advertisingDate = schedule.get().advertisingDate();
    LocalDate offerReceiptDate = schedule.get().offerReceiptDate();
    if (advertisingDate == null || offerReceiptDate == null) {
      return false;
    }

    LocalDate today = LocalDate.now(ZoneId.systemDefault());
    return (!today.isBefore(advertisingDate) && !today.isAfter(offerReceiptDate));
  }

  private ApplicationSnapshot mapSnapshot(ResultSet rs) {
    return new ApplicationSnapshot(
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "EXEMPTION_NUMBER"),
        getString(rs, "EXPORT_APPLICATION_STATUS_CODE"),
        firstNonNull(getString(rs, "STATUS_DESCRIPTION"), getString(rs, "EXPORT_APPLICATION_STATUS_CODE")),
        getString(rs, "OWNER_CLIENT_NUMBER"),
        getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
        getString(rs, "AGENT_CLIENT_NUMBER"),
        getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
        getLong(rs, "ORG_UNIT_NO"),
        firstNonNull(getString(rs, "REGION_CODE"), getString(rs, "ORG_UNIT_CODE")),
        getString(rs, "REGION"),
        getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
        firstNonNull(getString(rs, "REASON_DESCRIPTION"), getString(rs, "EXPORT_EXEMPTION_REASON_CODE")),
        getLocalDate(rs, "APPLICATION_DATE"),
        getLocalDate(rs, "RECEIVED_DATE"),
        getLocalDate(rs, "ADVERTISING_DATE"),
        getLong(rs, "TERM_DAYS"),
        firstNonNullDouble(getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"), getDouble(rs, "APPLICATION_VOLUME")),
        getDouble(rs, "AVERAGE_LOG_VOLUME"));
  }

  private String buildSortOrder(String sortField) {
    Map<String, String> allowedColumns =
        mapOf(
            "applicationNumber", "v.APPLICATION_NUMBER",
            "application", "v.APPLICATION_NUMBER",
            "applicantClientNumber", "v.OWNER_CLIENT_NUMBER",
            "displayOwnerClientNumber", "v.OWNER_CLIENT_NUMBER",
            "ownerClientNumber", "v.OWNER_CLIENT_NUMBER",
            "exemptionNumber", "v.EXEMPTION_NUMBER",
            "listingDate", "v.ADVERTISING_DATE",
            "regionCode", "v.REGION_CODE",
            "region", "v.REGION_CODE");

    String fallbackColumn = "v.APPLICATION_NUMBER";
    String direction = "ASC";
    String key = trim(sortField);

    if (key != null) {
      if (key.toUpperCase().endsWith(" DESC")) {
        direction = "DESC";
        key = key.substring(0, key.length() - 5).trim();
      } else if (key.toUpperCase().endsWith(" ASC")) {
        key = key.substring(0, key.length() - 4).trim();
      }
    }

    String column = key == null ? fallbackColumn : allowedColumns.getOrDefault(key, fallbackColumn);
    if (!safeIdentifier(column)) {
      column = fallbackColumn;
    }

    if ("v.APPLICATION_NUMBER".equals(column)) {
      return " ORDER BY v.APPLICATION_NUMBER " + direction;
    }
    return " ORDER BY " + column + " " + direction + ", v.APPLICATION_NUMBER ASC";
  }

  private String offerNumberAsString(ResultSet rs) {
    Long numeric = getLong(rs, "EXPORT_PURCHASE_OFFER_NUMBER");
    if (numeric != null) {
      return numeric.toString();
    }
    return getString(rs, "EXPORT_PURCHASE_OFFER_NUMBER");
  }

  private String firstNonNull(String first, String second) {
    return first != null ? first : second;
  }

  private Double firstNonNullDouble(Double first, Double second) {
    return first != null ? first : second;
  }

  private boolean equalsNullable(String left, String right) {
    return left == null ? right == null : left.equals(right);
  }

  private double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  private long coalesce(Long value, long fallback) {
    return value == null ? fallback : value;
  }

  private record ApplicationSnapshot(
      Long applicationNumber,
      String exemptionNumber,
      String applicationStatusCode,
      String statusDescription,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      Long orgUnitNumber,
      String regionCode,
      String regionName,
      String productTypeCode,
      String exemptionReasonCode,
      LocalDate applicationDate,
      LocalDate receivedDate,
      LocalDate listingDate,
      Long termDays,
      Double applicationVolume,
      Double averageLogVolume) {}

  private record ScheduleSnapshot(LocalDate advertisingDate, LocalDate offerReceiptDate) {}

  private record PieceCountSnapshot(String packageNumber, Long pieceCount) {}
}

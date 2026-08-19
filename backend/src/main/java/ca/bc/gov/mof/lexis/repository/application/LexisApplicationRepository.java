package ca.bc.gov.mof.lexis.repository.application;

import static ca.bc.gov.mof.lexis.util.ValueUtils.coalesce;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
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
  private static final String EXPORT_EXEMPTION_APPL_REMARK_NUMBER =
      "EXPORT_EXMPTN_APPL_REMARK_NMBR";
  private static final String INDICATOR_YES = "Y";

  private static final String FIND_ALL_EXEMPTION_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)";
  private static final String FIND_ALL_EXEMPTION_REASON_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_RSN_CODES(?)";
  private static final String FIND_ALL_APPLICATION_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)";
  private static final String FIND_ALL_PRODUCT_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PRODUCT_TYPE_CODES(?)";
  private static final String FIND_ALL_GROWTH_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_GROWTH_TYPE_CODES(?)";
  private static final String APPLICATION_SEARCH_SOURCE =
      """
      (
        SELECT
          EEA.APPLICATION_NUMBER,
          EEA.EXEMPTION_APPLICATION_VOLUME,
          EEA.EXEMPTION_APPLICATION_VOLUME AS APPLICATION_VOLUME,
          EEA.EXPORT_SCHEDULE_ID,
          EEA.AGENT_CLIENT_NUMBER,
          EEA.OWNER_CLIENT_NUMBER,
          CASE
            WHEN EEA.EXPORT_APPLICANT_TYPE_CODE = 'O' THEN EEA.OWNER_CLIENT_NUMBER
            ELSE EEA.AGENT_CLIENT_NUMBER
          END AS APPLICANT_CLIENT_NUMBER,
          EEA.EXEMPTION_NUMBER,
          EEA.EXPORT_APPLICATION_STATUS_CODE,
          EEA.EXPORT_APPLICANT_TYPE_CODE,
          EEA.ORG_UNIT_NO,
          EEA.EXPORT_PRODUCT_TYPE_CODE,
          EEA.EXPORT_JURISDICTION_CODE,
          EEA.RECEIVED_DATE,
          ES.ADVERTISING_DATE,
          EASC.DESCRIPTION AS STATUS_DESCRIPTION,
          EE.EXPORT_EXEMPTION_TYPE_CODE,
          EETC.DESCRIPTION AS EXEMPTION_TYPE_DESCRIPTION,
          OU.ORG_UNIT_NAME AS REGION,
          OU.ORG_UNIT_CODE AS REGION_CODE,
          OU.ORG_UNIT_CODE,
          EEA.OIC_INDICATOR
        FROM EXPORT_EXEMPTION_APPLICATION EEA
        LEFT JOIN EXPORT_EXEMPTION EE
          ON EE.EXEMPTION_NUMBER = EEA.EXEMPTION_NUMBER
        LEFT JOIN EXPORT_EXEMPTION_TYPE_CODE EETC
          ON EETC.EXPORT_EXEMPTION_TYPE_CODE = EE.EXPORT_EXEMPTION_TYPE_CODE
        LEFT JOIN EXPORT_SCHEDULE ES
          ON ES.EXPORT_SCHEDULE_ID = EEA.EXPORT_SCHEDULE_ID
        INNER JOIN EXPORT_APPLICATION_STATUS_CODE EASC
          ON EASC.EXPORT_APPLICATION_STATUS_CODE = EEA.EXPORT_APPLICATION_STATUS_CODE
        INNER JOIN EXPORT_EXEMPTION_REASON_CODE EERC
          ON EERC.EXPORT_EXEMPTION_REASON_CODE = EEA.EXPORT_EXEMPTION_REASON_CODE
        INNER JOIN EXPORT_APPLICANT_TYPE_CODE EATC
          ON EATC.EXPORT_APPLICANT_TYPE_CODE = EEA.EXPORT_APPLICANT_TYPE_CODE
        LEFT JOIN ORG_UNIT OU
          ON OU.ORG_UNIT_NO = EEA.ORG_UNIT_NO
      ) v
      """;
  private static final String SEARCH_APPLICATIONS =
      """
      SELECT
        v.*,
        NULL AS APPROVAL_DATE,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM EXPORT_PURCHASE_OFFER EPO
            WHERE EPO.APPLICATION_NUMBER = v.APPLICATION_NUMBER
              AND EPO.VALID_OFFER_INDICATOR = 'Y'
              AND EPO.OFFER_WITHDRAWAL_DATE IS NULL
          ) THEN 1
          ELSE 0
        END AS HAS_ACTIVE_VALID_OFFER
      FROM
      """
          + APPLICATION_SEARCH_SOURCE;
  private static final String COUNT_APPLICATIONS =
      """
      SELECT COUNT(*)
      FROM
      """
          + APPLICATION_SEARCH_SOURCE;
  private static final Map<String, String> SEARCH_SORT_COLUMNS =
      Map.ofEntries(
          Map.entry("applicationNumber", "v.APPLICATION_NUMBER"),
          Map.entry("application", "v.APPLICATION_NUMBER"),
          Map.entry("applicantClientNumber", "v.APPLICANT_CLIENT_NUMBER"),
          Map.entry("displayOwnerClientNumber", "v.OWNER_CLIENT_NUMBER"),
          Map.entry("ownerClientNumber", "v.OWNER_CLIENT_NUMBER"),
          Map.entry("exemptionNumber", "v.EXEMPTION_NUMBER"),
          Map.entry("listingDate", "v.ADVERTISING_DATE"),
          Map.entry("regionCode", "v.REGION_CODE"),
          Map.entry("region", "v.REGION_CODE"));
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_APPLICATION_ACCESS =
      """
      SELECT APPLICATION_NUMBER,
             EXPORT_JURISDICTION_CODE,
             ORG_UNIT_NO,
             OWNER_CLIENT_NUMBER,
             AGENT_CLIENT_NUMBER
      FROM EXPORT_EXEMPTION_APPLICATION
      WHERE APPLICATION_NUMBER = ?
      """;
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
        loadCodeNameOptionsRequired(FIND_ALL_EXEMPTION_TYPE_CODES).stream()
            .filter(option -> option.code() == null || !JURISDICTION_FEDERAL.equalsIgnoreCase(option.code()))
            .toList());
    return options;
  }

  public List<CodeNameDto> loadExemptionReasonOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_EXEMPTION_REASON_CODES);
  }

  public List<CodeNameDto> loadApplicationStatusOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    options.add(new CodeNameDto("", "All"));
    options.addAll(loadCodeNameOptionsRequired(FIND_ALL_APPLICATION_STATUS_CODES));
    return options;
  }

  public List<CodeNameDto> loadProductTypeOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    options.add(new CodeNameDto("", "All"));
    options.addAll(loadCodeNameOptionsRequired(FIND_ALL_PRODUCT_TYPE_CODES));
    return options;
  }

  public List<CodeNameDto> loadGrowthTypeOptions() {
    return loadCodeNameOptionsRequired(FIND_ALL_GROWTH_TYPE_CODES);
  }

  public List<CodeNameDto> loadRegionOptions() {
    return loadOrgUnitOptionsRequired(true);
  }

  public Page<LexisApplicationSearchResultDto> search(LexisApplicationSearchCriteria criteria) {
    return search(criteria, null);
  }

  public Page<LexisApplicationSearchResultDto> search(
      LexisApplicationSearchCriteria criteria, Integer knownTotal) {
    DirectSql countCriteria = buildSearchWhere(criteria, false);
    DirectSql pageCriteria = buildSearchWhere(criteria, true);
    LocalDate today = LexisBusinessTime.today();
    int totalElements =
        knownTotal == null
            ? queryDirectCount(COUNT_APPLICATIONS, countCriteria)
            : Math.max(0, knownTotal);
    return queryDirectPage(
        SEARCH_APPLICATIONS,
        pageCriteria,
        criteria.page(),
        criteria.size(),
        totalElements,
        rs -> toSearchResult(rs, today));
  }

  public int count(LexisApplicationSearchCriteria criteria) {
    return queryDirectCount(COUNT_APPLICATIONS, buildSearchWhere(criteria, false));
  }

  private DirectSql buildSearchWhere(
      LexisApplicationSearchCriteria criteria, boolean includeOrderBy) {
    DirectSqlBuilder where = newDirectSqlBuilder();

    where.addNumberLike("v.APPLICATION_NUMBER", criteria.applicationNumber());
    where.addRaw(" AND v.APPLICATION_NUMBER > 0");
    String packageNumber = trim(criteria.packageNumber());
    if (packageNumber != null) {
      where.addRawWithBinds(
          " AND EXISTS (SELECT 1 FROM EXPORT_PACKAGE EP "
              + "WHERE EP.APPLICATION_NUMBER = v.APPLICATION_NUMBER "
              + "AND EP.PACKAGE_NUMBER LIKE '%' || ? || '%')",
          packageNumber);
    }
    where.addLike("v.EXEMPTION_NUMBER", criteria.exemptionNumber());
    where.addEquals("v.EXPORT_APPLICATION_STATUS_CODE", criteria.applicationStatus());
    where.addEquals("v.EXPORT_PRODUCT_TYPE_CODE", criteria.productTypeCode());
    where.addDateGte("v.RECEIVED_DATE", criteria.receivedFromDate());
    where.addDateLte("v.RECEIVED_DATE", criteria.receivedToDate());
    where.addDateGte("v.ADVERTISING_DATE", criteria.listingFromDate());
    where.addDateLte("v.ADVERTISING_DATE", criteria.listingToDate());
    if (criteria.exportScheduleId() != null) {
      where.addRawWithBinds(" AND v.EXPORT_SCHEDULE_ID = ?", criteria.exportScheduleId());
    }
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
      where.addRawWithBinds(
          criteria.broadClientMatch()
              ? " AND (v.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%' "
                  + "OR v.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%')"
              : " AND ((v.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%' "
                  + "AND v.EXPORT_APPLICANT_TYPE_CODE = '"
                  + APPLICANT_TYPE_OWNER
                  + "') OR (v.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%' "
                  + "AND v.EXPORT_APPLICANT_TYPE_CODE = '"
                  + APPLICANT_TYPE_AGENT
                  + "'))",
          agentClientNumber,
          agentClientNumber);
    }

    return where.build(includeOrderBy ? buildSortOrder(criteria.sortField()) : "");
  }

  public Optional<LexisApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    Optional<ApplicationSnapshot> snapshot =
        queryCursorSingleFailClosed(
            FIND_APPLICATION_BY_NUMBER,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            this::mapSnapshot);

    if (snapshot.isEmpty()) {
      return Optional.empty();
    }

    ApplicationSnapshot app = snapshot.get();
    Optional<ScheduleSnapshot> schedule = loadScheduleByApplication(applicationNumber);
    List<LexisApplicationDetailDto.LexisPackageDto> packages =
        loadPackagesByApplication(applicationNumber);
    List<LexisApplicationDetailDto.LexisRemarkDto> remarks = loadRemarksByApplication(applicationNumber);
    List<LexisApplicationDetailDto.LexisOfferDto> offers =
        loadOffersByApplicationFailClosed(applicationNumber);

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
            schedule.map(ScheduleSnapshot::teacMeetingDate).orElse(null),
            app.termDays(),
            coalesce(app.applicationVolume(), 0.0d),
            coalesce(app.averageLogVolume(), 0.0d),
            canCreateOffers(schedule),
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            null,
            null,
            packages,
            remarks,
            offers,
            app.jurisdictionCode(),
            app.author()));
  }

  public Optional<ApplicationAccessContextDto> findAccessByApplicationNumber(
      Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return jdbcTemplate
        .query(
            FIND_APPLICATION_ACCESS,
            (rs, rowNumber) ->
                new ApplicationAccessContextDto(
                    getLong(rs, "APPLICATION_NUMBER"),
                    getString(rs, "EXPORT_JURISDICTION_CODE"),
                    getLong(rs, "ORG_UNIT_NO"),
                    getString(rs, "OWNER_CLIENT_NUMBER"),
                    getString(rs, "AGENT_CLIENT_NUMBER")),
            applicationNumber)
        .stream()
        .findFirst();
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
      List<LexisApplicationDetailDto.LexisOfferDto> offers =
          loadOffersByApplicationFailClosed(applicationNumber);
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
        firstNonNull(
            getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"), getDouble(rs, "APPLICATION_VOLUME"));
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
            coalesce(getLong(rs, "HAS_ACTIVE_VALID_OFFER"), 0L) > 0L);

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
        false,
        getString(rs, "EXEMPTION_TYPE_DESCRIPTION"));
  }

  private boolean canBeExempted(
      String statusCode,
      String exemptionNumber,
      LocalDate listingDate,
      String productTypeCode,
      LocalDate today,
      boolean hasActiveValidOffer) {
    if (exemptionNumber != null && !exemptionNumber.isBlank()) {
      return false;
    }
    if (!APPLICATION_STATUS_APPROVED.equalsIgnoreCase(statusCode)) {
      return false;
    }

    if (hasActiveValidOffer) {
      return false;
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

    return queryCursorProcedureFailClosed(
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
        queryCursorProcedureFailClosed(
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
    return queryCursorProcedureFailClosed(
            FIND_REMARKS_BY_APPLICATION,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            this::mapRemarkRow)
        .stream()
        .sorted(
            Comparator.comparing(
                LexisApplicationDetailDto.LexisRemarkDto::remarkId,
                Comparator.nullsFirst(Comparator.naturalOrder())))
        .toList();
  }

  LexisApplicationDetailDto.LexisRemarkDto mapRemarkRow(ResultSet rs) {
    String remark = getString(rs, "REMARK");
    return new LexisApplicationDetailDto.LexisRemarkDto(
        getLong(rs, EXPORT_EXEMPTION_APPL_REMARK_NUMBER),
        remark,
        remark,
        getString(rs, "ENTRY_USERID"),
        getLocalDate(rs, "ENTRY_TIMESTAMP"));
  }

  private List<LexisApplicationDetailDto.LexisOfferDto> loadOffersByApplication(Long applicationNumber) {
    return loadOffersByApplication(applicationNumber, false);
  }

  private List<LexisApplicationDetailDto.LexisOfferDto> loadOffersByApplicationFailClosed(
      Long applicationNumber) {
    return loadOffersByApplication(applicationNumber, true);
  }

  private List<LexisApplicationDetailDto.LexisOfferDto> loadOffersByApplication(
      Long applicationNumber, boolean failClosed) {
    SqlRowMapper<LexisApplicationDetailDto.LexisOfferDto> rowMapper =
        rs ->
            new LexisApplicationDetailDto.LexisOfferDto(
                offerNumberAsString(rs),
                getString(rs, "COMPANY_NAME"),
                getLocalDate(rs, "ENTRY_TIMESTAMP"),
                INDICATOR_YES.equalsIgnoreCase(getString(rs, "VALID_OFFER_INDICATOR")),
                getLocalDate(rs, "OFFER_WITHDRAWAL_DATE"));
    if (failClosed) {
      return queryCursorProcedureFailClosed(
          FIND_PURCHASE_OFFERS_BY_APPLICATION,
          cs -> cs.setString(1, applicationNumber.toString()),
          2,
          rowMapper);
    }
    return queryCursorProcedure(
        FIND_PURCHASE_OFFERS_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rowMapper);
  }

  private boolean canCreateOffers(Long applicationNumber) {
    return canCreateOffers(loadScheduleByApplication(applicationNumber));
  }

  private Optional<ScheduleSnapshot> loadScheduleByApplication(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingleFailClosed(
        FIND_SCHEDULE_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ScheduleSnapshot(
                getLocalDate(rs, "ADVERTISING_DATE"),
                getLocalDate(rs, "OFFER_RECEIPT_DATE"),
                getLocalDate(rs, "TEAC_MEETING_DATE")));
  }

  private boolean canCreateOffers(Optional<ScheduleSnapshot> schedule) {
    if (schedule.isEmpty()) {
      return false;
    }

    LocalDate advertisingDate = schedule.get().advertisingDate();
    LocalDate offerReceiptDate = schedule.get().offerReceiptDate();
    if (advertisingDate == null || offerReceiptDate == null) {
      return false;
    }

    LocalDate today = LexisBusinessTime.today();
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
        firstNonNull(
            getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"), getDouble(rs, "APPLICATION_VOLUME")),
        getDouble(rs, "AVERAGE_LOG_VOLUME"),
        getString(rs, "EXPORT_JURISDICTION_CODE"),
        firstNonNull(getString(rs, "UPDATE_USERID"), getString(rs, "ENTRY_USERID")));
  }

  private String buildSortOrder(String sortField) {
    String fallbackColumn = "v.APPLICATION_NUMBER";
    String direction = "ASC";
    String key = trim(sortField);

    if (key != null) {
      String upper = key.toUpperCase(Locale.ROOT);
      if (upper.endsWith(" DESC")) {
        direction = "DESC";
        key = key.substring(0, key.length() - 5).trim();
      } else if (upper.endsWith(" ASC")) {
        key = key.substring(0, key.length() - 4).trim();
      }
    }

    String column =
        key == null ? fallbackColumn : SEARCH_SORT_COLUMNS.getOrDefault(key, fallbackColumn);
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

  private boolean equalsNullable(String left, String right) {
    return left == null ? right == null : left.equals(right);
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
      Double averageLogVolume,
      String jurisdictionCode,
      String author) {}

  private record ScheduleSnapshot(
      LocalDate advertisingDate, LocalDate offerReceiptDate, LocalDate teacMeetingDate) {}

  private record PieceCountSnapshot(String packageNumber, Long pieceCount) {}
}

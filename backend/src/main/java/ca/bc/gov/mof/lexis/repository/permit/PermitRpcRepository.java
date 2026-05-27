package ca.bc.gov.mof.lexis.repository.permit;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PermitRpcRepository extends OracleRepositorySupport {

  private static final String FIND_SCALE_DETAIL_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PKG(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PRM(?,?)";
  private static final String FIND_PACKAGES_BY_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_PERMIT(?,?)";
  private static final String FIND_PACKAGES_BY_OIC_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_OIC_PERMIT(?,?)";
  private static final String FIND_PACKAGES_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_APP(?,?)";
  private static final String FIND_PACKAGES_BY_EXEMPTION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_EXMP(?,?)";
  private static final String FIND_PACKAGE_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGE_BY_NUMBER(?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_APPLICATION_BY_EXEMPTION =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_EXEMPTION(?,?)";
  private static final String FIND_END_USE_BY_APP = LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_APP(?,?)";
  private static final String FIND_END_USE_BY_PACK = LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_PACK(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_ID(?,?)";
  private static final String FIND_EXEMPTION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTION_BY_NUMBER(?,?)";
  private static final String FIND_PERMIT_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_FILE_DETAILS(?,?)";
  private static final String FIND_APPLICATION_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPL_FILE_DETAILS(?,?)";
  private static final String FIND_INVOICE_BY_ID = LEXIS_GROUP_5_PACKAGE + "FIND_INVOICE_BY_ID(?,?,?)";
  private static final String FIND_INVOICES_BY_PERMIT = LEXIS_GROUP_5_PACKAGE + "FIND_INVOICES_BY_PERMIT(?,?)";
  private static final String INSERT_SALES_INVOICE =
      LEXIS_GROUP_9_PACKAGE + "INSERT_SALES_INVOICE(?,?,?,?,?,?,?,?,?,?)";
  private static final String FIND_FILE_ATTACHMENT = LEXIS_GROUP_5_PACKAGE + "FIND_FILE_ATTACHMENT(?,?)";
  private static final String FIND_GBMS_INVOICE_HISTORY =
      LEXIS_GROUP_9_PACKAGE + "FIND_GBMS_INVOICE_HISTORY(?,?,?)";
  private static final String FIND_GBMS_INVOICE_HISTORY_READ_ONLY =
      LEXIS_READ_ONLY_PACKAGE + "FIND_GBMS_INVOICE_HISTORY(?,?,?)";
  private static final String IS_APP_UNMANU = LEXIS_GROUP_5_PACKAGE + "IS_APP_UMANU(?,?)";
  private static final String GET_POLICY_FACTOR = LEXIS_GROUP_5_PACKAGE + "GET_POLICY_FACTOR(?,?,?)";
  private static final String DELETE_PERMIT_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_PERMIT_FILE_ATTACHMENT(?)";
  private static final String DELETE_APPLICATION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_APPL_FILE_ATTACHMENT(?)";
  private static final String DELETE_INVOICE_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_INVOICE_FILE_ATTACHMENT(?)";

  private static final String FIND_SPECIES_CODE = LEXIS_CODES_PACKAGE + "FIND_SPECIES_CODE(?,?)";
  private static final String FIND_GRADE_CODE = LEXIS_CODES_PACKAGE + "FIND_GRADE_CODE(?,?)";
  private static final String FIND_GROWTH_TYPE_CODE = LEXIS_CODES_PACKAGE + "FIND_GROWTH_TYPE_CODE(?,?)";
  private static final String FIND_PACKAGE_STATUS_CODE =
      LEXIS_CODES_PACKAGE + "FIND_PACKAGE_STATUS_CODE(?,?)";
  private static final String FIND_PRODUCT_TYPE_CODE = LEXIS_CODES_PACKAGE + "FIND_PRODUCT_TYPE_CODE(?,?)";
  private static final String FIND_CANDIDATE_EXCOL_VALUES =
      LEXIS_CODES_PACKAGE + "FIND_CANDIDATE_EXCOL_VALUES(?,?,?,?,?)";
  private static final String FIND_RATE_BY_EXEMPTION = LEXIS_CODES_PACKAGE + "FIND_RATE_BY_EXEMPTION(?,?)";
  private static final String FIND_LOG_AMV_BY_SCALE = LEXIS_CODES_PACKAGE + "FIND_LOG_AMV(?,?)";
  private static final String FIND_CONVERSION_FOR_DATE =
      LEXIS_CODES_PACKAGE + "FIND_CONVERSION_FOR_DATE(?,?,?)";
  private static final String FIND_ALL_COUNTRY_CODES = LEXIS_CODES_PACKAGE + "FIND_ALL_COUNTRY_CODES(?)";
  private static final String FIND_ALL_ATTACHMENT_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_ATTACH_CODES(?)";
  private static final String FIND_ATTACHMENT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ATTACH_TYPE_CODE(?,?)";

  public PermitRpcRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<PermitScaleDetailRow> findScaleDetailsByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PERMIT,
        cs -> cs.setString(1, permitNumber.toString()),
        2,
        rs ->
            new PermitScaleDetailRow(
                getString(rs, "EXPORT_SCALE_DETAIL_ID"),
                getString(rs, "TIMBER_MARK"),
                getString(rs, "EXPORT_SPECIES_CODE"),
                getString(rs, "EXPORT_GRADE_CODE"),
                coalesce(getDouble(rs, "SPECIES_GRADE_VOLUME"), 0.0d),
                coalesce(getLong(rs, "PIECES_COUNT"), 0L),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "CASCADE_SPLIT_CODE"),
                getString(rs, "EWB"),
                getString(rs, "FIL"),
                getString(rs, "MF")));
  }

  public List<String> findPackageNumbersByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_PACKAGES_BY_PERMIT,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs -> getString(rs, "PACKAGE_NUMBER"))
        .stream()
        .filter(packageNumber -> packageNumber != null && !packageNumber.isBlank())
        .distinct()
        .sorted()
        .toList();
  }

  public List<String> findPackageNumbersByOicPermitNumber(Long oicPermitNumber) {
    if (oicPermitNumber == null || oicPermitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_PACKAGES_BY_OIC_PERMIT,
            cs -> cs.setString(1, oicPermitNumber.toString()),
            2,
            rs -> getString(rs, "PACKAGE_NUMBER"))
        .stream()
        .filter(packageNumber -> packageNumber != null && !packageNumber.isBlank())
        .distinct()
        .sorted()
        .toList();
  }

  public List<Long> findApplicationNumbersByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_PACKAGES_BY_PERMIT,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs -> getLong(rs, "APPLICATION_NUMBER"))
        .stream()
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
        .distinct()
        .sorted()
        .toList();
  }

  public List<PackageCandidateRow> findPackagesByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
        FIND_PACKAGES_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapPackageCandidateRow);
  }

  public List<PackageCandidateRow> findPackagesByExemptionNumber(String exemptionNumber) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return List.of();
    }

    return queryCursorProcedure(
        FIND_PACKAGES_BY_EXEMPTION,
        cs -> cs.setString(1, normalizedExemptionNumber),
        2,
        this::mapPackageCandidateRow);
  }

  public List<Long> findApplicationNumbersByExemptionNumber(String exemptionNumber) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_APPLICATION_BY_EXEMPTION,
            cs -> cs.setString(1, normalizedExemptionNumber),
            2,
            rs -> getLong(rs, "APPLICATION_NUMBER"))
        .stream()
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
        .distinct()
        .sorted()
        .toList();
  }

  public List<DocumentRow> findPermitDocumentDetailsByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
        FIND_PERMIT_FILE_DETAILS,
        cs -> cs.setLong(1, permitNumber),
        2,
        this::mapDocumentRow);
  }

  public List<DocumentRow> findApplicationDocumentDetailsByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
        FIND_APPLICATION_FILE_DETAILS,
        cs -> cs.setLong(1, applicationNumber),
        2,
        this::mapDocumentRow);
  }

  public Optional<byte[]> findFileAttachmentBytes(Long fileId) {
    if (fileId == null || fileId < 1) {
      return Optional.empty();
    }

    String call = "{ call " + FIND_FILE_ATTACHMENT + " }";
    try {
      return jdbcTemplate.execute(
          call,
          (CallableStatementCallback<Optional<byte[]>>)
              cs -> {
                cs.setLong(1, fileId);
                cs.registerOutParameter(2, Types.REF_CURSOR);
                cs.execute();

                try (ResultSet rs = (ResultSet) cs.getObject(2)) {
                  if (rs == null || !rs.next()) {
                    return Optional.empty();
                  }
                  InputStream input = rs.getBinaryStream(1);
                  if (input == null) {
                    return Optional.empty();
                  }
                  try {
                    return Optional.of(input.readAllBytes());
                  } catch (java.io.IOException ex) {
                    logger.warn(
                        "Oracle file attachment read failed [{}]: {}",
                        FIND_FILE_ATTACHMENT,
                        ex.getMessage());
                    return Optional.empty();
                  } finally {
                    try {
                      input.close();
                    } catch (java.io.IOException ignored) {
                      // Ignore stream close exceptions for read-only attachment lookups.
                    }
                  }
                }
              });
    } catch (DataAccessException ex) {
      logger.warn("Oracle file attachment lookup failed [{}]: {}", FIND_FILE_ATTACHMENT, ex.getMessage());
      return Optional.empty();
    }
  }

  public List<CountryCodeRow> findAllCountryCodes() {
    return queryCursorProcedure(
            FIND_ALL_COUNTRY_CODES,
            null,
            1,
            rs ->
                new CountryCodeRow(
                    getString(rs, "CODE"),
                    getString(rs, "DESCRIPTION"),
                    coalesce(getLong(rs, "GROUP_BY"), 0L),
                    coalesce(getLong(rs, "ORDER_BY"), 0L)))
        .stream()
        .filter(row -> row.code() != null && row.description() != null)
        .toList();
  }

  public List<AttachmentTypeRow> findAllAttachmentTypes() {
    return queryCursorProcedure(
            FIND_ALL_ATTACHMENT_TYPE_CODES,
            null,
            1,
            rs ->
                new AttachmentTypeRow(
                    getString(rs, "CODE"),
                    getString(rs, "DESCRIPTION"),
                    coalesce(getLong(rs, "GROUP_BY"), 0L),
                    coalesce(getLong(rs, "ORDER_BY"), 0L)))
        .stream()
        .filter(row -> row.code() != null && row.description() != null)
        .toList();
  }

  public Optional<String> findAttachmentTypeDescription(String attachmentTypeCode) {
    String normalized = trim(attachmentTypeCode);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
            FIND_ATTACHMENT_TYPE_CODE,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(getString(rs, "DESCRIPTION")))
        .filter(value -> value != null && !value.isBlank());
  }

  public Optional<SalesInvoiceRow> findSalesInvoiceByNumberAndPermit(
      String salesInvoiceNumber, Long permitNumber) {
    String normalizedSalesInvoiceNumber = trim(salesInvoiceNumber);
    if (normalizedSalesInvoiceNumber == null || permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_INVOICE_BY_ID,
        cs -> {
          cs.setString(1, normalizedSalesInvoiceNumber);
          cs.setString(2, permitNumber.toString());
        },
        3,
        rs ->
            new SalesInvoiceRow(
                nonNull(getString(rs, "EXPORT_SALES_INVOICE_NUMBER")),
                coalesce(getDouble(rs, "EXPORT_VALUE"), 0.0d),
                coalesce(getDouble(rs, "CURRENCY_CONVERSION_RATE"), 0.0d),
                coalesce(getDouble(rs, "FEE_IN_LIEU"), 0.0d)));
  }

  public List<String> findInvoiceNumbersByPermit(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_INVOICES_BY_PERMIT,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs -> getString(rs, "EXPORT_SALES_INVOICE_NUMBER"))
        .stream()
        .filter(value -> value != null && !value.isBlank())
        .distinct()
        .sorted()
        .toList();
  }

  public Optional<SalesInvoiceRow> insertSalesInvoice(
      Long permitNumber,
      String salesInvoiceNumber,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String userId) {
    String normalizedSalesInvoiceNumber = trim(salesInvoiceNumber);
    String normalizedUserId = trim(userId);
    if (permitNumber == null
        || permitNumber < 1
        || normalizedSalesInvoiceNumber == null
        || exportValue == null
        || currencyConversionRate == null
        || feeInLieu == null) {
      return Optional.empty();
    }

    Timestamp now = new Timestamp(System.currentTimeMillis());
    return queryCursorSingle(
        INSERT_SALES_INVOICE,
        cs -> {
          cs.setString(1, normalizedSalesInvoiceNumber);
          cs.setLong(2, permitNumber);
          cs.setBigDecimal(3, exportValue);
          cs.setBigDecimal(4, currencyConversionRate);
          cs.setBigDecimal(5, feeInLieu);
          cs.setString(6, normalizedUserId);
          cs.setTimestamp(7, now);
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
        },
        10,
        rs ->
            new SalesInvoiceRow(
                nonNull(getString(rs, "EXPORT_SALES_INVOICE_NUMBER")),
                coalesce(getDouble(rs, "EXPORT_VALUE"), 0.0d),
                coalesce(getDouble(rs, "CURRENCY_CONVERSION_RATE"), 0.0d),
                coalesce(getDouble(rs, "FEE_IN_LIEU"), 0.0d)));
  }

  public List<GbmsInvoiceHistoryRow> findGbmsInvoiceHistory(
      String receiptNumber, Long permitNumber, boolean readOnlyUser) {
    String normalizedReceiptNumber = trim(receiptNumber);
    String normalizedPermitNumber =
        permitNumber == null || permitNumber < 1 ? null : permitNumber.toString();
    String procedure =
        readOnlyUser ? FIND_GBMS_INVOICE_HISTORY_READ_ONLY : FIND_GBMS_INVOICE_HISTORY;

    return queryCursorProcedure(
        procedure,
        cs -> {
          cs.setString(1, normalizedReceiptNumber);
          cs.setString(2, normalizedPermitNumber);
        },
        3,
        rs ->
            new GbmsInvoiceHistoryRow(
                getString(rs, "INVOICE_NUMBER"),
                getString(rs, "CANCELLED_BY_INVOICE"),
                getString(rs, "REPLACED_BY_INVOICE"),
                coalesce(getDouble(rs, "INVOICE_AMOUNT"), 0.0d),
                getLocalDate(rs, "PRINTED_DATE"),
                getLocalDate(rs, "ENTRY_TIMESTAMP"),
                getLocalDate(rs, "UPDATE_TIMESTAMP")));
  }

  public Optional<Double> findCurrencyConversionRateByDate(LocalDate applicationDate, String countryCode) {
    LocalDate normalizedDate = applicationDate == null ? LocalDate.now() : applicationDate;
    String normalizedCountryCode = trim(countryCode);
    if (normalizedCountryCode == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_CONVERSION_FOR_DATE,
        cs -> {
          cs.setString(1, normalizedCountryCode);
          cs.setDate(2, java.sql.Date.valueOf(normalizedDate));
        },
        3,
        rs -> coalesce(getDouble(rs, "RATE_TO_CANADIAN"), 0.0d));
  }

  public boolean deletePermitFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    return executeProcedure(DELETE_PERMIT_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
  }

  public boolean deleteApplicationFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    return executeProcedure(DELETE_APPLICATION_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
  }

  public boolean deleteInvoiceFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    return executeProcedure(DELETE_INVOICE_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
  }

  public List<PermitScaleDetailRow> findScaleDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PACKAGE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PermitScaleDetailRow(
                getString(rs, "EXPORT_SCALE_DETAIL_ID"),
                getString(rs, "TIMBER_MARK"),
                getString(rs, "EXPORT_SPECIES_CODE"),
                getString(rs, "EXPORT_GRADE_CODE"),
                coalesce(getDouble(rs, "SPECIES_GRADE_VOLUME"), 0.0d),
                coalesce(getLong(rs, "PIECES_COUNT"), 0L),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "CASCADE_SPLIT_CODE"),
                getString(rs, "EWB"),
                getString(rs, "FIL"),
                getString(rs, "MF")));
  }

  public Optional<PermitPolicyContextRow> findPermitPolicyContextByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PERMIT_DETAIL_BY_ID,
        cs -> cs.setString(1, permitNumber.toString()),
        2,
        rs ->
            new PermitPolicyContextRow(
                getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getLong(rs, "ORG_UNIT_NO"),
                getLocalDate(rs, "APPLICATION_DATE"),
                getString(rs, "EXEMPTION_NUMBER"),
                getString(rs, "EXPORT_COUNTRY_CODE"),
                coalesce(getDouble(rs, "OVERRIDE_FEE"), 0.0d)));
  }

  public Optional<String> findExemptionTypeCode(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
            FIND_EXEMPTION_BY_NUMBER,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(rs.getString("EXPORT_EXEMPTION_TYPE_CODE")))
        .filter(value -> value != null && !value.isBlank());
  }

  public Optional<PackageInfoRow> findPackageInfoByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PackageInfoRow(
                getString(rs, "PACKAGE_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                coalesce(getDouble(rs, "PACKAGE_VOLUME"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_LENGTH"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_DIAMETER"), 0.0d),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
                getString(rs, "EXPORT_PRODUCT_TYPE_CODE")));
  }

  public Optional<PackageDetailsRow> findPackageDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PackageDetailsRow(
                getString(rs, "PACKAGE_NUMBER"),
                coalesce(getDouble(rs, "PACKAGE_VOLUME"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_LENGTH"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_DIAMETER"), 0.0d),
                getString(rs, "EXPORT_PACKAGE_STATUS_CODE"),
                getString(rs, "COMMENTS"),
                getString(rs, "PACKAGE_REPROCESSED_INDICATOR"),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE")));
  }

  public Optional<ApplicationInfoRow> findApplicationInfoByNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ApplicationInfoRow(
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "EXEMPTION_NUMBER"),
                getLong(rs, "ORG_UNIT_NO"),
                firstNonNull(getString(rs, "REGION"), getString(rs, "ORG_UNIT_NAME")),
                getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
                getString(rs, "END_USE_SORT")));
  }

  public List<EndUsePairRow> findEndUsesByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_END_USE_BY_APP,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs -> new EndUsePairRow(getString(rs, "EXPORT_SPECIES_CODE"), getString(rs, "EXPORT_END_USE_CODE")))
        .stream()
        .filter(row -> trim(row.speciesCode()) != null && trim(row.endUseCode()) != null)
        .toList();
  }

  public List<EndUsePairRow> findEndUsesByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_END_USE_BY_PACK,
            cs -> cs.setString(1, normalized),
            2,
            rs -> new EndUsePairRow(getString(rs, "EXPORT_SPECIES_CODE"), getString(rs, "EXPORT_END_USE_CODE")))
        .stream()
        .filter(row -> trim(row.speciesCode()) != null && trim(row.endUseCode()) != null)
        .toList();
  }

  public Optional<String> findSpeciesDescription(String speciesCode) {
    return findCodeDescription(FIND_SPECIES_CODE, speciesCode);
  }

  public Optional<String> findGradeDescription(String gradeCode) {
    return findCodeDescription(FIND_GRADE_CODE, gradeCode);
  }

  public Optional<String> findGrowthTypeDescription(String growthTypeCode) {
    return findCodeDescription(FIND_GROWTH_TYPE_CODE, growthTypeCode);
  }

  public Optional<String> findPackageStatusDescription(String packageStatusCode) {
    return findCodeDescription(FIND_PACKAGE_STATUS_CODE, packageStatusCode);
  }

  public Optional<String> findProductTypeDescription(String productTypeCode) {
    return findCodeDescription(FIND_PRODUCT_TYPE_CODE, productTypeCode);
  }

  public List<String> findCandidateExcolCodes(
      int speciesCount, String speciesCode, String endUseCode, Long orgUnitNumber) {
    String normalizedSpecies = trim(speciesCode);
    String normalizedEndUse = trim(endUseCode);
    if (speciesCount < 1 || normalizedSpecies == null || normalizedEndUse == null || orgUnitNumber == null) {
      return List.of();
    }

    StringBuilder pattern = new StringBuilder();
    for (int i = 0; i < speciesCount; i++) {
      pattern.append("__/");
    }
    pattern.append("__");

    return queryCursorProcedure(
            FIND_CANDIDATE_EXCOL_VALUES,
            cs -> {
              cs.setString(1, pattern.toString());
              cs.setString(2, normalizedSpecies);
              cs.setString(3, normalizedEndUse);
              cs.setLong(4, orgUnitNumber);
            },
            5,
            rs -> getString(rs, "EXCOL_TRANSLATION_VALUE"))
        .stream()
        .filter(value -> value != null && !value.isBlank())
        .toList();
  }

  public Optional<BigDecimal> findFixedExemptionRate(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_RATE_BY_EXEMPTION,
        cs -> cs.setString(1, normalized),
        2,
        rs -> {
          Double rate = getDouble(rs, "FIXED_EXEMPTION_RATE");
          if (rate == null) {
            return null;
          }
          return BigDecimal.valueOf(rate);
        });
  }

  public BigDecimal findFeePolicyPercentIncrease(LocalDate applicationDate, Long orgUnitNo) {
    if (applicationDate == null || orgUnitNo == null || orgUnitNo < 1) {
      return BigDecimal.ZERO;
    }

    return queryCursorSingle(
            GET_POLICY_FACTOR,
            cs -> {
              cs.setDate(1, java.sql.Date.valueOf(applicationDate));
              cs.setLong(2, orgUnitNo);
            },
            3,
            rs -> {
              String percent = trim(rs.getString("PERCENT_INCREASE"));
              if (percent == null) {
                return BigDecimal.ZERO;
              }
              try {
                return new BigDecimal(percent);
              } catch (NumberFormatException ex) {
                return BigDecimal.ZERO;
              }
            })
        .orElse(BigDecimal.ZERO);
  }

  public Optional<BigDecimal> findAverageMarketValueByScaleId(String scaleDetailId) {
    String normalized = trim(scaleDetailId);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_LOG_AMV_BY_SCALE,
        cs -> cs.setString(1, normalized),
        2,
        rs -> {
          Double amv = getDouble(rs, "AVERAGE_MARKET_PRICE");
          if (amv == null) {
            return null;
          }
          return BigDecimal.valueOf(amv);
        });
  }

  public boolean isApplicationUnmanufactured(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }

    String call = "{ call " + IS_APP_UNMANU + " }";
    try {
      Long count =
          jdbcTemplate.execute(
              call,
              (CallableStatementCallback<Long>)
                  cs -> {
                    cs.setString(1, applicationNumber.toString());
                    cs.registerOutParameter(2, Types.REF_CURSOR);
                    cs.execute();
                    try (var rs = (java.sql.ResultSet) cs.getObject(2)) {
                      if (rs == null || !rs.next()) {
                        return 0L;
                      }
                      Long resultsCount = getLong(rs, "RESULTS_COUNT");
                      return resultsCount == null ? 0L : resultsCount;
                    }
                  });
      return count != null && count > 0;
    } catch (DataAccessException ex) {
      logger.warn("Oracle procedure call failed [{}]: {}", IS_APP_UNMANU, ex.getMessage());
      return false;
    }
  }

  private Optional<String> findCodeDescription(String procedureSignature, String code) {
    String normalized = trim(code);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
            procedureSignature,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(rs.getString(2)))
        .filter(value -> value != null && !value.isBlank());
  }

  private String firstNonNull(String first, String second) {
    return first != null ? first : second;
  }

  private String nonNull(String value) {
    return value == null ? "" : value;
  }

  private DocumentRow mapDocumentRow(ResultSet rs) {
    Long attachmentId = getLong(rs, "EXPORT_ATTACHMENT_ID");
    return new DocumentRow(
        coalesce(attachmentId, 0L),
        safeFileName(getString(rs, "FILE_NAME")),
        firstNonNull(getString(rs, "DESCRIPTION"), ""),
        firstNonNull(getString(rs, "EXPORT_ATTACHMENT_TYPE_CODE"), ""));
  }

  private PackageCandidateRow mapPackageCandidateRow(ResultSet rs) {
    Long exportPermitNumber = getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER");
    if (exportPermitNumber == null) {
      exportPermitNumber = getLong(rs, "EXPORT_PERMIT_NUMBER");
    }

    return new PackageCandidateRow(
        getLong(rs, "APPLICATION_NUMBER"),
        trim(getString(rs, "PACKAGE_NUMBER")),
        exportPermitNumber);
  }

  private String safeFileName(String value) {
    if (value == null || value.isBlank()) {
      return "";
    }
    int slashIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    if (slashIndex < 0 || slashIndex >= value.length() - 1) {
      return value;
    }
    return value.substring(slashIndex + 1);
  }

  private double coalesce(Double value, double fallback) {
    return value == null ? fallback : value;
  }

  private long coalesce(Long value, long fallback) {
    return value == null ? fallback : value;
  }

  public record DocumentRow(long id, String fileName, String description, String attachmentTypeCode) {}

  public record CountryCodeRow(String code, String description, long groupBy, long orderBy) {}

  public record AttachmentTypeRow(String code, String description, long groupBy, long orderBy) {}

  public record PermitScaleDetailRow(
      String exportScaleDetailId,
      String timberMark,
      String exportSpeciesCode,
      String exportGradeCode,
      double speciesGradeVolume,
      long piecesCount,
      Long applicationNumber,
      String exportPermitDetailNumber,
      String packageNumber,
      String cascadeSplitCode,
      String ewb,
      String fil,
      String mf) {}

  public record PermitPolicyContextRow(
      Long permitNumber,
      Long orgUnitNo,
      LocalDate applicationDate,
      String exemptionNumber,
      String exportCountryCode,
      double overrideFee) {}

  public record PackageInfoRow(
      String packageNumber,
      Long applicationNumber,
      double packageVolume,
      double averageLength,
      double averageDiameter,
      String growthTypeCode,
      String productTypeCode) {}

  public record ApplicationInfoRow(
      Long applicationNumber,
      String exemptionNumber,
      Long orgUnitNo,
      String regionName,
      String productTypeCode,
      String growthTypeCode,
      String endUseSort) {}

  public record PackageDetailsRow(
      String packageNumber,
      double packageVolume,
      double averageLength,
      double averageDiameter,
      String packageStatusCode,
      String comments,
      String reprocessedIndicator,
      String growthTypeCode) {}

  public record EndUsePairRow(String speciesCode, String endUseCode) {}

  public record PackageCandidateRow(
      Long applicationNumber,
      String packageNumber,
      Long exportPermitNumber) {}

  public record SalesInvoiceRow(
      String salesInvoiceNumber,
      double exportValue,
      double currencyConversionRate,
      double feeInLieu) {}

  public record GbmsInvoiceHistoryRow(
      String invoiceNumber,
      String cancelledByInvoice,
      String replacedByInvoice,
      double invoiceAmount,
      LocalDate printedDate,
      LocalDate entryDate,
      LocalDate updateDate) {}
}

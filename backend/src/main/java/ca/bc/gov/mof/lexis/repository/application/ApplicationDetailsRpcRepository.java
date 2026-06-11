package ca.bc.gov.mof.lexis.repository.application;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.io.InputStream;
import java.sql.CallableStatement;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Repository
@Profile("oracle")
public class ApplicationDetailsRpcRepository extends OracleRepositorySupport {

  private static final String FIND_APPLICATION_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPL_FILE_DETAILS(?,?)";
  private static final String FIND_PERMIT_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_FILE_DETAILS(?,?)";
  private static final String FIND_FILE_ATTACHMENT = LEXIS_GROUP_5_PACKAGE + "FIND_FILE_ATTACHMENT(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_APP(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PKG(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_ID(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_APP(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_ID(?,?)";
  private static final String FIND_PACKAGE_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGE_BY_NUMBER(?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_END_USE_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_APP(?,?)";
  private static final String FIND_END_USE_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_PACK(?,?)";
  private static final String FIND_ATTACHMENT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ATTACH_TYPE_CODE(?,?)";
  private static final String FIND_ALL_SPECIES_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_SPECIES_CODES(?)";
  private static final String FIND_ALL_PACKAGE_STATUS_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_PACKAGE_STATUS_CODES(?)";
  private static final String FIND_SPECIES_CODE = LEXIS_CODES_PACKAGE + "FIND_SPECIES_CODE(?,?)";
  private static final String FIND_GRADE_CODE = LEXIS_CODES_PACKAGE + "FIND_GRADE_CODE(?,?)";
  private static final String FIND_END_USE_CODE = LEXIS_CODES_PACKAGE + "FIND_END_USE_CODE(?,?)";
  private static final String FIND_GROWTH_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_GROWTH_TYPE_CODE(?,?)";
  private static final String FIND_PACKAGE_STATUS_CODE =
      LEXIS_CODES_PACKAGE + "FIND_PACKAGE_STATUS_CODE(?,?)";
  private static final String FIND_PRODUCT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_PRODUCT_TYPE_CODE(?,?)";
  private static final String FIND_SPECIES_GRADE_BY_REGION_SPECIES =
      LEXIS_CODES_PACKAGE + "FIND_SPEC_GRAD_BY_REG_SPEC(?,?,?)";
  private static final String FIND_SPECIES_GRADE_BY_REGION =
      LEXIS_CODES_PACKAGE + "FIND_SPEC_GRAD_BY_REGION(?,?)";
  private static final String FIND_CANDIDATE_END_USES =
      LEXIS_CODES_PACKAGE + "FIND_CANDIDATE_END_USES(?,?,?,?)";
  private static final String FIND_CANDIDATE_EXCOL_COMBINATIONS =
      LEXIS_CODES_PACKAGE + "FIND_CANDIDATE_EXCOL_COMBOS(?,?,?,?)";
  private static final String DELETE_APPLICATION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_APPL_FILE_ATTACHMENT(?)";
  private static final String FIND_REMARK_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_REMARK_BY_NUMBER(?,?)";
  private static final String INSERT_REMARK =
      LEXIS_GROUP_14_PACKAGE + "INSERT_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";
  private static final String UPDATE_REMARK =
      LEXIS_GROUP_14_PACKAGE + "UPDATE_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";
  private static final String DELETE_SCALE_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "DELETE_SCALE_DETAIL(?,?)";
  private static final String DELETE_PACKAGE =
      LEXIS_GROUP_9_PACKAGE + "DELETE_PACKAGE(?,?)";
  private static final String INSERT_PACKAGE =
      LEXIS_GROUP_9_PACKAGE + "INSERT_PACKAGE(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String UPDATE_PACKAGE =
      LEXIS_GROUP_9_PACKAGE + "UPDATE_PACKAGE(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_SCALE_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "INSERT_SCALE_DETAIL(?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String UPDATE_SCALE =
      LEXIS_GROUP_9_PACKAGE + "UPDATE_SCALE(?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_END_USE_PACKAGE =
      LEXIS_GROUP_14_PACKAGE + "INSERT_END_USE_PACKAGE(?,?,?)";
  private static final String DELETE_END_USE_PACKAGE =
      LEXIS_GROUP_14_PACKAGE + "DELETE_END_USE_PACKAGE(?)";
  private static final String INSERT_EXEMPTION_APPLICATION =
      LEXIS_GROUP_13_PACKAGE
          + "INSERT_EXEMPTION_APPLICATION(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String UPDATE_EXEMPTION_APPLICATION =
      LEXIS_GROUP_14_PACKAGE + "UPDATE_EXEMPTION_APPLICATION(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

  public ApplicationDetailsRpcRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
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

  public List<Long> findPermitNumbersByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
            FIND_SCALE_DETAIL_BY_APPLICATION,
            cs -> cs.setLong(1, applicationNumber),
            2,
            rs -> parsePositiveLong(getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER")))
        .stream()
        .filter(value -> value != null && value > 0)
        .distinct()
        .toList();
  }

  public List<ApplicationScaleRow> findScaleDetailsByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_APPLICATION,
        cs -> cs.setLong(1, applicationNumber),
        2,
        rs -> new ApplicationScaleRow(getString(rs, "TIMBER_MARK")));
  }

  public List<ApplicationPermitRow> findPermitsByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_PERMIT_DETAIL_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> new ApplicationPermitRow(getLong(rs, "EXPORT_PERMIT_NUMBER"), getString(rs, "STATUS_DESCRIPTION")));
  }

  public List<ApplicationScaleDetailRow> findScaleDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PACKAGE,
        cs -> cs.setString(1, normalized),
        2,
        this::mapApplicationScaleDetailRow);
  }

  public Optional<ApplicationScaleDetailRow> findScaleDetailById(String scaleDetailId) {
    String normalized = trim(scaleDetailId);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_SCALE_DETAIL_BY_ID,
        cs -> cs.setString(1, normalized),
        2,
        this::mapApplicationScaleDetailRow);
  }

  public Optional<String> findPermitStatusCodeByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
            FIND_PERMIT_DETAIL_BY_ID,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs -> trim(getString(rs, "EXPORT_PERMIT_STATUS_CODE")))
        .filter(value -> value != null && !value.isBlank());
  }

  public boolean packageExists(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return false;
    }
    return queryCursorSingle(
            FIND_PACKAGE_BY_NUMBER,
            cs -> cs.setString(1, normalized),
            2,
            rs -> getString(rs, "PACKAGE_NUMBER"))
        .isPresent();
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
                zeroIfNull(getDouble(rs, "PACKAGE_VOLUME")),
                zeroIfNull(getDouble(rs, "AVERAGE_LENGTH")),
                zeroIfNull(getDouble(rs, "AVERAGE_DIAMETER")),
                getString(rs, "EXPORT_PACKAGE_STATUS_CODE"),
                getString(rs, "COMMENTS"),
                getString(rs, "PACKAGE_REPROCESSED_INDICATOR"),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
                getString(rs, "EXPORT_PRODUCT_TYPE_CODE")));
  }

  public Optional<PackageMutationRow> findPackageMutationByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        this::mapPackageMutationRow);
  }

  @Transactional
  public Optional<PackageMutationRow> insertPackage(PackageMutationRecord record) {
    if (record == null || trim(record.packageNumber()) == null) {
      return Optional.empty();
    }
    Optional<PackageMutationRow> inserted =
        queryCursorSingle(
            INSERT_PACKAGE,
            cs -> bindPackageInsert(cs, record),
            18,
            this::mapPackageMutationRow);

    if (inserted.isPresent() && !insertPackageEndUses(record.packageNumber(), record.endUses())) {
      markRollbackOnly();
      return Optional.empty();
    }
    return inserted;
  }

  @Transactional
  public boolean updatePackage(PackageMutationRecord record) {
    if (record == null || trim(record.packageNumber()) == null) {
      return false;
    }

    boolean updated =
        executeProcedure(
            UPDATE_PACKAGE,
            cs -> bindPackageUpdate(cs, record));
    if (!updated) {
      return false;
    }

    if (!deletePackageEndUses(record.packageNumber())
        || !insertPackageEndUses(record.packageNumber(), record.endUses())) {
      markRollbackOnly();
      return false;
    }
    return true;
  }

  public Optional<ApplicationScaleDetailRow> insertScaleDetail(ScaleMutationRecord record) {
    if (record == null || trim(record.packageNumber()) == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        INSERT_SCALE_DETAIL,
        cs -> bindScaleInsert(cs, record),
        13,
        this::mapApplicationScaleDetailRow);
  }

  public List<ScaleMutationRow> findScaleMutationDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SCALE_DETAIL_BY_PACKAGE,
        cs -> cs.setString(1, normalized),
        2,
        this::mapScaleMutationRow);
  }

  public boolean updateScaleDetail(ScaleMutationRecord record) {
    if (record == null || trim(record.scaleDetailId()) == null) {
      return false;
    }
    return executeProcedure(UPDATE_SCALE, cs -> bindScaleUpdate(cs, record));
  }

  public boolean deleteScaleById(String scaleDetailId, String userId) {
    String normalizedScaleDetailId = trim(scaleDetailId);
    if (normalizedScaleDetailId == null) {
      return false;
    }
    return executeProcedure(
        DELETE_SCALE_DETAIL,
        cs -> {
          cs.setString(1, normalizedScaleDetailId);
          cs.setString(2, auditUserOrDefault(userId));
        });
  }

  public boolean deletePackageById(String packageNumber, String userId) {
    String normalizedPackageNumber = trim(packageNumber);
    if (normalizedPackageNumber == null) {
      return false;
    }
    return executeProcedure(
        DELETE_PACKAGE,
        cs -> {
          cs.setString(1, normalizedPackageNumber);
          cs.setString(2, auditUserOrDefault(userId));
        });
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
                    try {
                      return Optional.of(input.readAllBytes());
                    } catch (java.io.IOException ex) {
                      logger.warn(
                          "Oracle file attachment read failed [{}]: {}",
                          FIND_FILE_ATTACHMENT,
                          ex.getMessage());
                      return Optional.empty();
                    }
                  } finally {
                    try {
                      input.close();
                    } catch (java.io.IOException ignored) {
                      // Ignore stream close exceptions for read-only download lookups.
                    }
                  }
                }
              });
    } catch (DataAccessException ex) {
      logger.warn("Oracle file attachment lookup failed [{}]: {}", FIND_FILE_ATTACHMENT, ex.getMessage());
      return Optional.empty();
    }
  }

  public boolean deleteApplicationFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    return executeProcedure(DELETE_APPLICATION_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
  }

  public Optional<RemarkRow> findRemarkByNumber(Long remarkId) {
    if (remarkId == null || remarkId < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_REMARK_BY_NUMBER,
        cs -> cs.setLong(1, remarkId),
        2,
        this::mapRemarkRow);
  }

  public Optional<RemarkRow> insertRemark(
      Long applicationNumber, String remarkBody, String entryUserId, Instant remarkDate) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    Timestamp timestamp = Timestamp.from(remarkDate == null ? Instant.now() : remarkDate);
    String remark = normalizeRemarkBody(remarkBody);

    return queryCursorSingle(
        INSERT_REMARK,
        cs -> {
          cs.setTimestamp(1, timestamp);
          cs.setString(2, remark);
          cs.setString(3, auditUserOrDefault(entryUserId));
          cs.setTimestamp(4, Timestamp.from(Instant.now()));
          cs.setLong(5, applicationNumber);
        },
        6,
        this::mapRemarkRow);
  }

  public boolean updateRemark(
      Long remarkId, Long applicationNumber, String remarkBody, String updateUserId, Instant remarkDate) {
    if (remarkId == null || remarkId < 1 || applicationNumber == null || applicationNumber < 1) {
      return false;
    }

    Timestamp timestamp = Timestamp.from(remarkDate == null ? Instant.now() : remarkDate);
    String remark = normalizeRemarkBody(remarkBody);

    return executeProcedure(
        UPDATE_REMARK,
        cs -> {
          cs.setLong(1, remarkId);
          cs.setTimestamp(2, timestamp);
          cs.setString(3, remark);
          cs.setString(4, auditUserOrDefault(updateUserId));
          cs.setTimestamp(5, Timestamp.from(Instant.now()));
          cs.setLong(6, applicationNumber);
        });
  }

  public Optional<ApplicationInsertRow> insertApplication(ApplicationInsertRecord record) {
    if (record == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        INSERT_EXEMPTION_APPLICATION,
        cs -> bindApplicationInsert(cs, record),
        28,
        this::mapApplicationInsertRow);
  }

  public Optional<ApplicationUpdateRecord> findApplicationUpdateRecord(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapApplicationUpdateRecord);
  }

  public boolean updateApplication(ApplicationUpdateRecord record) {
    if (record == null || record.applicationNumber() == null || record.applicationNumber() < 1) {
      return false;
    }
    return executeProcedure(UPDATE_EXEMPTION_APPLICATION, cs -> bindApplicationUpdate(cs, record));
  }

  public Optional<ApplicationClientSnapshotRow> findApplicationClientSnapshot(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ApplicationClientSnapshotRow(
                getString(rs, "AGENT_CLIENT_NUMBER"),
                getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
                getString(rs, "AGENT_CONTACT_NAME"),
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                getString(rs, "OWNER_CONTACT_NAME")));
  }

  public List<EndUseRow> findEndUsesByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_END_USE_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapEndUseRow);
  }

  public List<EndUseRow> findEndUsesByPackageNumber(String packageNumber) {
    String normalizedPackageNumber = trim(packageNumber);
    if (normalizedPackageNumber == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_END_USE_BY_PACKAGE,
        cs -> cs.setString(1, normalizedPackageNumber),
        2,
        this::mapEndUseRow);
  }

  public List<CodeRow> findAllSpeciesCodes() {
    return queryCursorProcedure(
            FIND_ALL_SPECIES_CODES,
            null,
            1,
            rs ->
                new CodeRow(
                    getString(rs, "CODE"),
                    getString(rs, "DESCRIPTION"),
                    zeroIfNull(getLong(rs, "GROUP_BY")),
                    zeroIfNull(getLong(rs, "ORDER_BY"))))
        .stream()
        .filter(row -> trim(row.code()) != null && trim(row.description()) != null)
        .sorted(Comparator.comparingLong(CodeRow::groupBy).thenComparingLong(CodeRow::orderBy))
        .toList();
  }

  public List<CodeRow> findAllPackageStatusCodes() {
    return queryCursorProcedure(
            FIND_ALL_PACKAGE_STATUS_CODES,
            null,
            1,
            rs ->
                new CodeRow(
                    getString(rs, "CODE"),
                    getString(rs, "DESCRIPTION"),
                    zeroIfNull(getLong(rs, "GROUP_BY")),
                    zeroIfNull(getLong(rs, "ORDER_BY"))))
        .stream()
        .filter(row -> trim(row.code()) != null && trim(row.description()) != null)
        .sorted(Comparator.comparingLong(CodeRow::groupBy).thenComparingLong(CodeRow::orderBy))
        .toList();
  }

  public Optional<CodeRow> findGradeCode(String gradeCode) {
    String normalized = trim(gradeCode);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_GRADE_CODE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new CodeRow(
                getString(rs, "CODE"),
                getString(rs, "DESCRIPTION"),
                zeroIfNull(getLong(rs, "GROUP_BY")),
                zeroIfNull(getLong(rs, "ORDER_BY"))));
  }

  public Optional<CodeRow> findSpeciesCode(String speciesCode) {
    String normalized = trim(speciesCode);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_SPECIES_CODE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new CodeRow(
                getString(rs, "CODE"),
                getString(rs, "DESCRIPTION"),
                zeroIfNull(getLong(rs, "GROUP_BY")),
                zeroIfNull(getLong(rs, "ORDER_BY"))));
  }

  public Optional<CodeRow> findEndUseCode(String endUseCode) {
    String normalized = trim(endUseCode);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
        FIND_END_USE_CODE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new CodeRow(
                getString(rs, "CODE"),
                getString(rs, "DESCRIPTION"),
                zeroIfNull(getLong(rs, "GROUP_BY")),
                zeroIfNull(getLong(rs, "ORDER_BY"))));
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

  public List<SpeciesGradeEndUseRow> findSpeciesEndUsesByRegionSpecies(
      String orgUnitNumber, String speciesCode) {
    String normalizedOrgUnitNumber = trim(orgUnitNumber);
    String normalizedSpeciesCode = trim(speciesCode);
    if (normalizedOrgUnitNumber == null || normalizedSpeciesCode == null) {
      return List.of();
    }
    return queryCursorProcedure(
            FIND_SPECIES_GRADE_BY_REGION_SPECIES,
            cs -> {
              cs.setString(1, normalizedOrgUnitNumber);
              cs.setString(2, normalizedSpeciesCode);
            },
            3,
            this::mapSpeciesGradeEndUseRow)
        .stream()
        .filter(row -> trim(row.gradeCode()) != null)
        .toList();
  }

  public List<SpeciesGradeEndUseRow> findSpeciesEndUsesByRegion(String orgUnitNumber) {
    String normalizedOrgUnitNumber = trim(orgUnitNumber);
    if (normalizedOrgUnitNumber == null) {
      return List.of();
    }
    return queryCursorProcedure(
        FIND_SPECIES_GRADE_BY_REGION,
        cs -> cs.setString(1, normalizedOrgUnitNumber),
        2,
        this::mapSpeciesGradeEndUseRow);
  }

  public List<ExcolValidationRow> findCandidateEndUseCodes(
      int speciesCount, String speciesCode, Long orgUnitNumber) {
    return findCandidateExcolRows(
        FIND_CANDIDATE_END_USES, excolPattern(speciesCount, false), speciesCode, orgUnitNumber);
  }

  public List<ExcolValidationRow> findCandidateExcolCombinations(
      int speciesCount, String speciesCode, Long orgUnitNumber) {
    return findCandidateExcolRows(
        FIND_CANDIDATE_EXCOL_COMBINATIONS,
        excolPattern(speciesCount, true),
        speciesCode,
        orgUnitNumber);
  }

  private EndUseRow mapEndUseRow(ResultSet rs) throws SQLException {
    return new EndUseRow(
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_END_USE_CODE"));
  }

  private SpeciesGradeEndUseRow mapSpeciesGradeEndUseRow(ResultSet rs) {
    return new SpeciesGradeEndUseRow(
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_GRADE_CODE"),
        getString(rs, "EXPORT_END_USE_CODE"),
        getString(rs, "EXCOL_TRANSLATION_VALUE"),
        getLong(rs, "ORG_UNIT_NO"));
  }

  private List<ExcolValidationRow> findCandidateExcolRows(
      String procedureSignature, String excolPattern, String speciesCode, Long orgUnitNumber) {
    String normalizedSpeciesCode = trim(speciesCode);
    if (excolPattern == null
        || normalizedSpeciesCode == null
        || orgUnitNumber == null
        || orgUnitNumber < 1) {
      return List.of();
    }
    return queryCursorProcedure(
        procedureSignature,
        cs -> {
          cs.setString(1, excolPattern);
          cs.setString(2, normalizedSpeciesCode);
          cs.setLong(3, orgUnitNumber);
        },
        4,
        rs -> new ExcolValidationRow(getString(rs, "EXCOL_TRANSLATION_VALUE")));
  }

  private String excolPattern(int speciesCount, boolean includeAdditionalSpecies) {
    if (speciesCount < 1) {
      return null;
    }
    StringBuilder pattern = new StringBuilder();
    for (int i = 0; i < speciesCount; i++) {
      pattern.append("__/");
    }
    pattern.append("__");
    if (includeAdditionalSpecies) {
      pattern.append("/%");
    }
    return pattern.toString();
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
        .filter(value -> value != null && !value.isBlank())
        .or(() -> fallbackCodeDescription(procedureSignature, normalized));
  }

  private void bindApplicationInsert(CallableStatement cs, ApplicationInsertRecord record)
      throws SQLException {
    int index = 1;
    setDateOrNull(cs, index++, record.applicationDate());
    setLongOrNull(cs, index++, emptyToNull(record.federalApplicationNumber()));
    setLongOrNull(cs, index++, record.termDays());
    setDateOrNull(cs, index++, record.receivedDate());
    setDoubleOrNull(cs, index++, record.applicationVolume());
    setDoubleOrNull(cs, index++, record.averageLogVolume());
    setStringOrNull(cs, index++, record.productLocation());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    cs.setTimestamp(index++, Timestamp.from(Instant.now()));
    cs.setNull(index++, Types.VARCHAR);
    cs.setNull(index++, Types.TIMESTAMP);
    setLongOrNull(cs, index++, record.exportScheduleId());
    setStringOrNull(cs, index++, record.agentClientNumber());
    setStringOrNull(cs, index++, record.agentClientLocationCode());
    setStringOrNull(cs, index++, record.ownerClientNumber());
    setStringOrNull(cs, index++, record.ownerClientLocationCode());
    setStringOrNull(cs, index++, record.exemptionNumber());
    setStringOrNull(cs, index++, record.exemptionReasonCode());
    setStringOrNull(cs, index++, record.applicationStatusCode());
    setStringOrNull(cs, index++, record.applicantTypeCode());
    setLongOrNull(cs, index++, record.orgUnitNumber());
    setStringOrNull(cs, index++, record.productTypeCode());
    setStringOrNull(cs, index++, record.jurisdictionCode());
    setStringOrNull(cs, index++, record.growthTypeCode());
    setStringOrNull(cs, index++, record.agentContactName());
    setStringOrNull(cs, index++, record.ownerContactName());
    setStringOrNull(cs, index, record.oicIndicator());
  }

  private void bindApplicationUpdate(CallableStatement cs, ApplicationUpdateRecord record)
      throws SQLException {
    int index = 1;
    setLongOrNull(cs, index++, record.applicationNumber());
    setLongOrNull(cs, index++, emptyToNull(record.federalApplicationNumber()));
    setDateOrNull(cs, index++, record.applicationDate());
    setLongOrNull(cs, index++, record.termDays());
    setDateOrNull(cs, index++, record.receivedDate());
    setDoubleOrNull(cs, index++, record.applicationVolume());
    setDoubleOrNull(cs, index++, record.averageLogVolume());
    setStringOrNull(cs, index++, record.productLocation());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    cs.setString(index++, auditUserOrDefault(record.updateUserId()));
    setTimestampOrNull(cs, index++, record.updateTimestamp());
    setLongOrNull(cs, index++, record.exportScheduleId());
    setStringOrNull(cs, index++, record.agentClientNumber());
    setStringOrNull(cs, index++, record.agentClientLocationCode());
    setStringOrNull(cs, index++, record.ownerClientNumber());
    setStringOrNull(cs, index++, record.ownerClientLocationCode());
    setStringOrNull(cs, index++, record.exemptionNumber());
    setStringOrNull(cs, index++, record.exemptionReasonCode());
    setStringOrNull(cs, index++, record.applicationStatusCode());
    setStringOrNull(cs, index++, record.applicantTypeCode());
    setLongOrNull(cs, index++, record.orgUnitNumber());
    setStringOrNull(cs, index++, record.productTypeCode());
    setStringOrNull(cs, index++, record.jurisdictionCode());
    setStringOrNull(cs, index++, record.growthTypeCode());
    setStringOrNull(cs, index++, record.agentContactName());
    setStringOrNull(cs, index++, record.ownerContactName());
    setStringOrNull(cs, index, record.oicIndicator());
  }

  private void bindPackageInsert(CallableStatement cs, PackageMutationRecord record)
      throws SQLException {
    int index = 1;
    setStringOrNull(cs, index++, record.packageNumber());
    setLongOrNull(cs, index++, emptyToNull(record.applicationNumber()));
    setStringOrNull(cs, index++, record.reprocessedIndicator());
    setDoubleOrNull(cs, index++, record.packageVolume());
    setDoubleOrNull(cs, index++, record.averageLength());
    setDoubleOrNull(cs, index++, record.averageDiameter());
    setStringOrNull(cs, index++, record.comments());
    setDoubleOrNull(cs, index++, record.packageFee());
    setLongOrNull(cs, index++, emptyToNull(record.federalPermitNumber()));
    setLongOrNull(cs, index++, emptyToNull(record.reservePermitNumber()));
    setStringOrNull(cs, index++, record.packageStatusCode());
    setStringOrNull(cs, index++, record.growthTypeCode());
    setStringOrNull(cs, index++, record.productTypeCode());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    setStringOrNull(cs, index++, null);
    setTimestampOrNull(cs, index, null);
  }

  private void bindPackageUpdate(CallableStatement cs, PackageMutationRecord record)
      throws SQLException {
    int index = 1;
    setStringOrNull(cs, index++, record.packageNumber());
    setLongOrNull(cs, index++, record.applicationNumber());
    setStringOrNull(cs, index++, record.reprocessedIndicator());
    setDoubleOrNull(cs, index++, record.packageVolume());
    setDoubleOrNull(cs, index++, record.averageLength());
    setDoubleOrNull(cs, index++, record.averageDiameter());
    setStringOrNull(cs, index++, record.comments());
    setDoubleOrNull(cs, index++, record.packageFee());
    setLongOrNull(cs, index++, emptyToNull(record.federalPermitNumber()));
    setLongOrNull(cs, index++, emptyToNull(record.reservePermitNumber()));
    setStringOrNull(cs, index++, record.packageStatusCode());
    setStringOrNull(cs, index++, record.growthTypeCode());
    setStringOrNull(cs, index++, record.productTypeCode());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    cs.setString(index++, auditUserOrDefault(record.updateUserId()));
    cs.setTimestamp(index, Timestamp.from(Instant.now()));
  }

  private void bindScaleInsert(CallableStatement cs, ScaleMutationRecord record)
      throws SQLException {
    int index = 1;
    setStringOrNull(cs, index++, record.timberMark());
    setLongOrNull(cs, index++, record.piecesCount());
    setDoubleOrNull(cs, index++, record.speciesGradeVolume());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    setStringOrNull(cs, index++, null);
    setTimestampOrNull(cs, index++, null);
    setStringOrNull(cs, index++, record.packageNumber());
    setStringOrNull(cs, index++, record.speciesCode());
    setStringOrNull(cs, index++, record.gradeCode());
    setLongOrNull(cs, index++, emptyToNull(record.exportPermitDetailNumber()));
    setDoubleOrNull(cs, index, record.exemptionOverrideRate());
  }

  private void bindScaleUpdate(CallableStatement cs, ScaleMutationRecord record)
      throws SQLException {
    int index = 1;
    setLongOrNull(cs, index++, parsePositiveLong(record.scaleDetailId()));
    setLongOrNull(cs, index++, emptyToNull(record.exportPermitDetailNumber()));
    setStringOrNull(cs, index++, record.timberMark());
    setLongOrNull(cs, index++, record.piecesCount());
    setDoubleOrNull(cs, index++, record.speciesGradeVolume());
    setStringOrNull(cs, index++, record.packageNumber());
    setStringOrNull(cs, index++, record.speciesCode());
    setStringOrNull(cs, index++, record.gradeCode());
    cs.setString(index++, auditUserOrDefault(record.entryUserId()));
    setTimestampOrNull(cs, index++, record.entryTimestamp());
    cs.setString(index++, auditUserOrDefault(record.updateUserId()));
    cs.setTimestamp(index, Timestamp.from(Instant.now()));
  }

  private boolean insertPackageEndUses(String packageNumber, List<PackageEndUseRecord> endUses) {
    String normalizedPackageNumber = trim(packageNumber);
    if (normalizedPackageNumber == null) {
      return false;
    }
    if (endUses == null || endUses.isEmpty()) {
      return true;
    }
    for (PackageEndUseRecord endUse : endUses) {
      String speciesCode = trim(endUse.speciesCode());
      String endUseCode = trim(endUse.endUseCode());
      if (speciesCode == null || endUseCode == null) {
        continue;
      }
      boolean inserted =
          executeProcedure(
          INSERT_END_USE_PACKAGE,
          cs -> {
            cs.setString(1, normalizedPackageNumber);
            cs.setString(2, speciesCode);
            cs.setString(3, endUseCode);
          });
      if (!inserted) {
        return false;
      }
    }
    return true;
  }

  private boolean deletePackageEndUses(String packageNumber) {
    String normalizedPackageNumber = trim(packageNumber);
    if (normalizedPackageNumber == null) {
      return false;
    }
    return executeProcedure(DELETE_END_USE_PACKAGE, cs -> cs.setString(1, normalizedPackageNumber));
  }

  private DocumentRow mapDocumentRow(ResultSet rs) {
    Long attachmentId = getLong(rs, "EXPORT_ATTACHMENT_ID");
    String fileName = safeFileName(getString(rs, "FILE_NAME"));
    String description = trim(getString(rs, "DESCRIPTION"));
    String attachmentTypeCode = getString(rs, "EXPORT_ATTACHMENT_TYPE_CODE");
    return new DocumentRow(
        attachmentId == null ? 0L : attachmentId,
        fileName == null ? "" : fileName,
        description == null ? "" : description,
        attachmentTypeCode);
  }

  private RemarkRow mapRemarkRow(ResultSet rs) {
    Long remarkId = getLong(rs, "EXPORT_EXMPTN_APPL_REMARK_NMBR");
    String remark = getString(rs, "REMARK");
    String user = getString(rs, "ENTRY_USERID");
    Instant date = getInstant(rs, "ENTRY_TIMESTAMP");
    return new RemarkRow(remarkId == null ? 0L : remarkId, remark == null ? "" : remark, user, date);
  }

  private ApplicationInsertRow mapApplicationInsertRow(ResultSet rs) {
    return new ApplicationInsertRow(getLong(rs, "APPLICATION_NUMBER"));
  }

  private ApplicationUpdateRecord mapApplicationUpdateRecord(ResultSet rs) {
    return new ApplicationUpdateRecord(
        getLong(rs, "APPLICATION_NUMBER"),
        getLong(rs, "FED_APPLICATION_NUMBER"),
        getLocalDate(rs, "APPLICATION_DATE"),
        getLong(rs, "TERM_DAYS"),
        getLocalDate(rs, "RECEIVED_DATE"),
        getDouble(rs, "EXEMPTION_APPLICATION_VOLUME"),
        getDouble(rs, "AVERAGE_LOG_VOLUME"),
        getString(rs, "PRODUCT_LOCATION"),
        getString(rs, "ENTRY_USERID"),
        getInstant(rs, "ENTRY_TIMESTAMP"),
        getString(rs, "UPDATE_USERID"),
        getInstant(rs, "UPDATE_TIMESTAMP"),
        getLong(rs, "EXPORT_SCHEDULE_ID"),
        getString(rs, "AGENT_CLIENT_NUMBER"),
        getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
        getString(rs, "OWNER_CLIENT_NUMBER"),
        getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
        getString(rs, "EXEMPTION_NUMBER"),
        getString(rs, "EXPORT_EXEMPTION_REASON_CODE"),
        getString(rs, "EXPORT_APPLICATION_STATUS_CODE"),
        getString(rs, "EXPORT_APPLICANT_TYPE_CODE"),
        getLong(rs, "ORG_UNIT_NO"),
        getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
        getString(rs, "EXPORT_JURISDICTION_CODE"),
        getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
        getString(rs, "AGENT_CONTACT_NAME"),
        getString(rs, "OWNER_CONTACT_NAME"),
        getString(rs, "OIC_INDICATOR"));
  }

  private ApplicationScaleDetailRow mapApplicationScaleDetailRow(ResultSet rs) {
    return new ApplicationScaleDetailRow(
        getString(rs, "EXPORT_SCALE_DETAIL_ID"),
        getString(rs, "TIMBER_MARK"),
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_GRADE_CODE"),
        zeroIfNull(getDouble(rs, "SPECIES_GRADE_VOLUME")),
        zeroIfNull(getLong(rs, "PIECES_COUNT")),
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
        getString(rs, "PACKAGE_NUMBER"),
        getString(rs, "CASCADE_SPLIT_CODE"));
  }

  private PackageMutationRow mapPackageMutationRow(ResultSet rs) {
    return new PackageMutationRow(
        getString(rs, "PACKAGE_NUMBER"),
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "PACKAGE_REPROCESSED_INDICATOR"),
        getDouble(rs, "PACKAGE_VOLUME"),
        getDouble(rs, "AVERAGE_LENGTH"),
        getDouble(rs, "AVERAGE_DIAMETER"),
        getString(rs, "COMMENTS"),
        getDouble(rs, "PACKAGE_FEE"),
        getLong(rs, "EXPORT_FED_PERMIT_DETAIL_ID"),
        getLong(rs, "EXPORT_INDIAN_RSRV_PRMT_DTL_ID"),
        getString(rs, "EXPORT_PACKAGE_STATUS_CODE"),
        getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
        getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
        getString(rs, "ENTRY_USERID"),
        getInstant(rs, "ENTRY_TIMESTAMP"));
  }

  private ScaleMutationRow mapScaleMutationRow(ResultSet rs) {
    return new ScaleMutationRow(
        getString(rs, "EXPORT_SCALE_DETAIL_ID"),
        getString(rs, "TIMBER_MARK"),
        getLong(rs, "PIECES_COUNT"),
        getDouble(rs, "SPECIES_GRADE_VOLUME"),
        getString(rs, "PACKAGE_NUMBER"),
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_GRADE_CODE"),
        getLong(rs, "APPLICATION_NUMBER"),
        getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
        getString(rs, "ENTRY_USERID"),
        getInstant(rs, "ENTRY_TIMESTAMP"));
  }

  private Instant getInstant(ResultSet rs, String column) {
    try {
      Timestamp value = rs.getTimestamp(column);
      return value == null ? null : value.toInstant();
    } catch (SQLException ex) {
      return null;
    }
  }

  private Long parsePositiveLong(String value) {
    String normalized = trim(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // No surrounding transaction exists for this call path.
    }
  }

  private String normalizeRemarkBody(String remarkBody) {
    return remarkBody == null ? "" : remarkBody;
  }

  private String safeFileName(String value) {
    if (value == null || value.isBlank()) {
      return value;
    }
    int slashIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    if (slashIndex < 0 || slashIndex >= value.length() - 1) {
      return value;
    }
    return value.substring(slashIndex + 1);
  }

  public record DocumentRow(
      long id, String fileName, String description, String attachmentTypeCode) {}

  public record RemarkRow(long remarkId, String remark, String user, Instant date) {}

  public record ApplicationInsertRecord(
      LocalDate applicationDate,
      Long federalApplicationNumber,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String productLocation,
      String entryUserId,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String exemptionNumber,
      String exemptionReasonCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator) {}

  public record ApplicationInsertRow(Long applicationNumber) {}

  public record ApplicationUpdateRecord(
      Long applicationNumber,
      Long federalApplicationNumber,
      LocalDate applicationDate,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String productLocation,
      String entryUserId,
      Instant entryTimestamp,
      String updateUserId,
      Instant updateTimestamp,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String exemptionNumber,
      String exemptionReasonCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator) {}

  public record ApplicationClientSnapshotRow(
      String agentClientNumber,
      String agentClientLocationCode,
      String agentContactName,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String ownerContactName) {}

  public record CodeRow(String code, String description, long groupBy, long orderBy) {}

  public record EndUseRow(String speciesCode, String endUseCode) {}

  public record SpeciesGradeEndUseRow(
      String speciesCode,
      String gradeCode,
      String endUseCode,
      String excolTranslationValue,
      Long orgUnitNumber) {}

  public record ExcolValidationRow(String excolCode) {}

  public record ApplicationScaleRow(String timberMark) {}

  public record ApplicationPermitRow(Long permitNumber, String statusDescription) {}

  public record ApplicationScaleDetailRow(
      String exportScaleDetailId,
      String timberMark,
      String exportSpeciesCode,
      String exportGradeCode,
      double speciesGradeVolume,
      long piecesCount,
      Long applicationNumber,
      String exportPermitDetailNumber,
      String packageNumber,
      String cascadeSplitCode) {}

  public record PackageEndUseRecord(String speciesCode, String endUseCode) {}

  public record PackageMutationRecord(
      String packageNumber,
      Long applicationNumber,
      String reprocessedIndicator,
      Double packageVolume,
      Double averageLength,
      Double averageDiameter,
      String comments,
      Double packageFee,
      Long federalPermitNumber,
      Long reservePermitNumber,
      String packageStatusCode,
      String growthTypeCode,
      String productTypeCode,
      String entryUserId,
      Instant entryTimestamp,
      String updateUserId,
      List<PackageEndUseRecord> endUses) {}

  public record PackageMutationRow(
      String packageNumber,
      Long applicationNumber,
      String reprocessedIndicator,
      Double packageVolume,
      Double averageLength,
      Double averageDiameter,
      String comments,
      Double packageFee,
      Long federalPermitNumber,
      Long reservePermitNumber,
      String packageStatusCode,
      String growthTypeCode,
      String productTypeCode,
      String entryUserId,
      Instant entryTimestamp) {}

  public record ScaleMutationRecord(
      String scaleDetailId,
      String timberMark,
      Long piecesCount,
      Double speciesGradeVolume,
      String packageNumber,
      String speciesCode,
      String gradeCode,
      Long applicationNumber,
      Long exportPermitDetailNumber,
      Double exemptionOverrideRate,
      String entryUserId,
      Instant entryTimestamp,
      String updateUserId) {}

  public record ScaleMutationRow(
      String scaleDetailId,
      String timberMark,
      Long piecesCount,
      Double speciesGradeVolume,
      String packageNumber,
      String speciesCode,
      String gradeCode,
      Long applicationNumber,
      Long exportPermitDetailNumber,
      String entryUserId,
      Instant entryTimestamp) {}

  public record PackageDetailsRow(
      String packageNumber,
      double packageVolume,
      double averageLength,
      double averageDiameter,
      String packageStatusCode,
      String comments,
      String reprocessedIndicator,
      String growthTypeCode,
      String productTypeCode) {}

  private void setStringOrNull(CallableStatement cs, int index, String value) throws SQLException {
    String normalized = trim(value);
    if (normalized == null) {
      cs.setNull(index, Types.VARCHAR);
    } else {
      cs.setString(index, normalized);
    }
  }

  private long zeroIfNull(Long value) {
    return value == null ? 0L : value;
  }

  private double zeroIfNull(Double value) {
    return value == null ? 0.0d : value;
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

  private Long emptyToNull(Long value) {
    return value == null || value <= 0 ? null : value;
  }
}

package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import java.text.DecimalFormat;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleApplicationDetailsRpcService implements ApplicationDetailsRpcService {

  private static final String DESCRIPTION_NOT_ON_FILE = "Not on file";
  private static final String APPLICATION_STATUS_NEW = "NEW";
  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String OIC_INDICATOR_NO = "N";
  private static final String SAVE_SUCCESS_MESSAGE = "The application was saved successfully.";
  private static final String EXPORT_PERMIT_STATUS_COMPLETE = "COM";
  private static final String PACKAGE_EXISTS_MESSAGE_TEMPLATE = "Package %s already exists.";
  private static final int REMARK_DISPLAY_LIMIT = 70;

  private final ApplicationDetailsRpcRepository repository;

  public OracleApplicationDetailsRpcService(ApplicationDetailsRpcRepository repository) {
    this.repository = repository;
  }

  @Override
  public List<DocumentItem> getDocumentDetails(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    List<ApplicationDetailsRpcRepository.DocumentRow> allDocuments = new ArrayList<>();
    allDocuments.addAll(repository.findApplicationDocumentDetailsByApplicationNumber(applicationNumber));

    for (Long permitNumber : repository.findPermitNumbersByApplicationNumber(applicationNumber)) {
      allDocuments.addAll(repository.findPermitDocumentDetailsByPermitNumber(permitNumber));
    }

    Map<String, String> attachmentTypeByCode = new LinkedHashMap<>();
    return allDocuments.stream()
        .map(
            row ->
                new DocumentItem(
                    row.id(),
                    row.fileName(),
                    normalizeDescription(row.description()),
                    resolveAttachmentTypeDescription(row.attachmentTypeCode(), attachmentTypeByCode)))
        .toList();
  }

  @Override
  public Optional<DocumentContent> getDocument(Long fileId) {
    return repository.findFileAttachmentBytes(fileId).map(DocumentContent::new);
  }

  @Override
  public boolean removeDocument(Long documentId) {
    return repository.deleteApplicationFile(documentId);
  }

  @Override
  public Optional<String> getRemark(Long remarkId) {
    if (remarkId == null || remarkId < 1) {
      return Optional.empty();
    }
    return repository.findRemarkByNumber(remarkId).map(ApplicationDetailsRpcRepository.RemarkRow::remark);
  }

  @Override
  public Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    String normalizedRemarkId = trimToNull(remarkId);
    String normalizedUserId = trimToNull(userId);
    String remark = remarkBody == null ? "" : remarkBody;

    if (normalizedRemarkId == null || "new".equalsIgnoreCase(normalizedRemarkId)) {
      return repository
          .insertRemark(applicationNumber, remark, normalizedUserId, Instant.now())
          .map(this::toPersistedRemark);
    }

    Long parsedRemarkId = parsePositiveLong(normalizedRemarkId);
    if (parsedRemarkId == null) {
      return Optional.empty();
    }

    boolean updated =
        repository.updateRemark(parsedRemarkId, applicationNumber, remark, normalizedUserId, Instant.now());
    if (!updated) {
      return Optional.empty();
    }
    return repository.findRemarkByNumber(parsedRemarkId).map(this::toPersistedRemark);
  }

  @Override
  public CreateApplicationResult addApplication(CreateApplicationRequest request, String userId) {
    CreateApplicationRequest normalized = normalizeCreateApplicationRequest(request);
    List<String> errors = validateCreateApplication(normalized);
    List<String> warnings = List.of();

    if (normalized.validationEnabled() && !errors.isEmpty()) {
      return new CreateApplicationResult(false, null, null, errors, warnings);
    }

    String entryUserId = trimToNull(userId);
    Optional<ApplicationDetailsRpcRepository.ApplicationInsertRow> inserted =
        repository.insertApplication(toInsertRecord(normalized, entryUserId));

    Long applicationNumber =
        inserted.map(ApplicationDetailsRpcRepository.ApplicationInsertRow::applicationNumber).orElse(null);
    if (applicationNumber == null || applicationNumber < 1) {
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please note the time this error occurred and report to someone.",
          null,
          List.of(),
          warnings);
    }

    return new CreateApplicationResult(
        true, SAVE_SUCCESS_MESSAGE, applicationNumber, List.of(), warnings);
  }

  @Override
  public Optional<ApplicationClientSnapshot> getApplicationClientSnapshot(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findApplicationClientSnapshot(applicationNumber)
        .map(
            row ->
                new ApplicationClientSnapshot(
                    trimToNull(row.agentClientNumber()),
                    trimToNull(row.agentClientLocationCode()),
                    trimToNull(row.agentContactName()),
                    trimToNull(row.ownerClientNumber()),
                    trimToNull(row.ownerClientLocationCode()),
                    trimToNull(row.ownerContactName())));
  }

  @Override
  public List<CodeItem> getSpeciesCodes() {
    return repository.findAllSpeciesCodes().stream().map(this::toCodeItem).toList();
  }

  @Override
  public List<CodeItem> getGradeCodes(String orgUnitNumber, String speciesCode) {
    TreeSet<String> gradeCodes = new TreeSet<>();
    for (ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow row :
        repository.findSpeciesEndUsesByRegionSpecies(orgUnitNumber, speciesCode)) {
      String gradeCode = trimToNull(row.gradeCode());
      if (gradeCode != null) {
        gradeCodes.add(gradeCode);
      }
    }

    List<CodeItem> response = new ArrayList<>();
    for (String gradeCode : gradeCodes) {
      response.add(
          repository
              .findGradeCode(gradeCode)
              .map(this::toCodeItem)
              .orElse(new CodeItem(gradeCode, gradeCode)));
    }
    return response;
  }

  @Override
  public Optional<String> getSelectedEndUse(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findEndUsesByApplicationNumber(applicationNumber).stream()
        .map(ApplicationDetailsRpcRepository.EndUseRow::endUseCode)
        .map(this::trimToNull)
        .filter(value -> value != null)
        .findFirst();
  }

  @Override
  public Optional<String> getPackageSelectedEndUse(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return Optional.empty();
    }
    return repository.findEndUsesByPackageNumber(normalizedPackageNumber).stream()
        .map(ApplicationDetailsRpcRepository.EndUseRow::endUseCode)
        .map(this::trimToNull)
        .filter(value -> value != null)
        .findFirst();
  }

  @Override
  public List<SpeciesEndUseItem> getSpeciesForApplication(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return toSpeciesEndUseItems(repository.findEndUsesByApplicationNumber(applicationNumber));
  }

  @Override
  public List<SpeciesEndUseItem> getSpeciesForPackage(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return List.of();
    }
    return toSpeciesEndUseItems(repository.findEndUsesByPackageNumber(normalizedPackageNumber));
  }

  @Override
  public List<ApplicationScaleItem> getUniqueScalesForApplication(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    TreeSet<String> timberMarks = new TreeSet<>();
    for (ApplicationDetailsRpcRepository.ApplicationScaleRow row :
        repository.findScaleDetailsByApplicationNumber(applicationNumber)) {
      String timberMark = trimToNull(row.timberMark());
      if (timberMark != null) {
        timberMarks.add(timberMark);
      }
    }
    return timberMarks.stream().map(ApplicationScaleItem::new).toList();
  }

  @Override
  public List<ApplicationPermitItem> findPermits(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    Map<Long, ApplicationPermitItem> permitsByNumber = new LinkedHashMap<>();
    for (ApplicationDetailsRpcRepository.ApplicationPermitRow row :
        repository.findPermitsByApplicationNumber(applicationNumber)) {
      Long permitNumber = row.permitNumber();
      if (permitNumber != null && permitNumber > 0 && !permitsByNumber.containsKey(permitNumber)) {
        permitsByNumber.put(
            permitNumber,
            new ApplicationPermitItem(permitNumber, trimToNull(row.statusDescription())));
      }
    }
    return List.copyOf(permitsByNumber.values());
  }

  @Override
  public List<ApplicationPackageScaleItem> getScalesForPackage(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return List.of();
    }

    Map<String, String> speciesDescriptionByCode = new LinkedHashMap<>();
    Map<String, String> gradeDescriptionByCode = new LinkedHashMap<>();
    Map<Long, Boolean> permittedByPermitNumber = new LinkedHashMap<>();
    return repository.findScaleDetailsByPackageNumber(normalizedPackageNumber).stream()
        .sorted(
            Comparator
                .comparing(
                    ApplicationDetailsRpcRepository.ApplicationScaleDetailRow::timberMark,
                    Comparator.nullsLast(String::compareTo))
                .thenComparing(
                    ApplicationDetailsRpcRepository.ApplicationScaleDetailRow::exportSpeciesCode,
                    Comparator.nullsLast(String::compareTo)))
        .map(
            row ->
                new ApplicationPackageScaleItem(
                    isCompletedPermit(row.exportPermitDetailNumber(), permittedByPermitNumber),
                    formatTimberMark(row.timberMark()),
                    resolveSpeciesDescription(row.exportSpeciesCode(), speciesDescriptionByCode),
                    row.piecesCount(),
                    resolveGradeDescription(row.exportGradeCode(), gradeDescriptionByCode),
                    formatOneDecimal(row.speciesGradeVolume()),
                    nonNull(trimToNull(row.exportScaleDetailId())),
                    nonNull(trimToNull(row.cascadeSplitCode()))))
        .toList();
  }

  @Override
  public ApplicationScaleDetailItem getScaleById(String scaleDetailId) {
    String normalizedScaleDetailId = trimToNull(scaleDetailId);
    if (normalizedScaleDetailId == null) {
      return missingScaleDetail();
    }

    return repository
        .findScaleDetailById(normalizedScaleDetailId)
        .map(
            row ->
                new ApplicationScaleDetailItem(
                    true,
                    formatTimberMark(row.timberMark()),
                    trimToNull(row.exportSpeciesCode()),
                    Long.toString(row.piecesCount()),
                    trimToNull(row.exportGradeCode()),
                    formatOneDecimal(row.speciesGradeVolume()),
                    trimToNull(row.exportScaleDetailId())))
        .orElseGet(this::missingScaleDetail);
  }

  @Override
  public PackageValidityItem isPackageValid(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null || !repository.packageExists(normalizedPackageNumber)) {
      return new PackageValidityItem(true, null);
    }
    return new PackageValidityItem(
        false, PACKAGE_EXISTS_MESSAGE_TEMPLATE.formatted(normalizedPackageNumber));
  }

  @Override
  public boolean deleteScaleById(String scaleDetailId, String userId) {
    String normalizedScaleDetailId = trimToNull(scaleDetailId);
    if (normalizedScaleDetailId == null) {
      return false;
    }
    return repository.deleteScaleById(normalizedScaleDetailId, trimToNull(userId));
  }

  @Override
  public boolean deletePackageById(String packageNumber, String userId) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return false;
    }
    return repository.deletePackageById(normalizedPackageNumber, trimToNull(userId));
  }

  private List<SpeciesEndUseItem> toSpeciesEndUseItems(
      List<ApplicationDetailsRpcRepository.EndUseRow> rows) {
    Map<String, String> endUseDescriptionByCode = new LinkedHashMap<>();
    return rows.stream()
        .map(
            row ->
                new SpeciesEndUseItem(
                    trimToNull(row.speciesCode()),
                    trimToNull(row.endUseCode()),
                    resolveEndUseDescription(row.endUseCode(), endUseDescriptionByCode)))
        .toList();
  }

  private String resolveEndUseDescription(
      String endUseCode, Map<String, String> endUseDescriptionByCode) {
    String normalizedCode = trimToNull(endUseCode);
    if (normalizedCode == null) {
      return "";
    }
    String cached = endUseDescriptionByCode.get(normalizedCode);
    if (cached != null) {
      return cached;
    }
    String resolved =
        repository
            .findEndUseCode(normalizedCode)
            .map(ApplicationDetailsRpcRepository.CodeRow::description)
            .map(this::trimToNull)
            .orElse(normalizedCode);
    endUseDescriptionByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private CodeItem toCodeItem(ApplicationDetailsRpcRepository.CodeRow row) {
    return new CodeItem(trimToNull(row.code()), trimToNull(row.description()));
  }

  private String resolveSpeciesDescription(
      String speciesCode, Map<String, String> speciesDescriptionByCode) {
    String normalizedCode = trimToNull(speciesCode);
    if (normalizedCode == null) {
      return "";
    }
    String cached = speciesDescriptionByCode.get(normalizedCode);
    if (cached != null) {
      return cached;
    }
    String resolved =
        repository
            .findSpeciesCode(normalizedCode)
            .map(ApplicationDetailsRpcRepository.CodeRow::description)
            .map(this::trimToNull)
            .orElse(normalizedCode);
    speciesDescriptionByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private String resolveGradeDescription(
      String gradeCode, Map<String, String> gradeDescriptionByCode) {
    String normalizedCode = trimToNull(gradeCode);
    if (normalizedCode == null) {
      return "";
    }
    String cached = gradeDescriptionByCode.get(normalizedCode);
    if (cached != null) {
      return cached;
    }
    String resolved =
        repository
            .findGradeCode(normalizedCode)
            .map(ApplicationDetailsRpcRepository.CodeRow::description)
            .map(this::trimToNull)
            .orElse(normalizedCode);
    gradeDescriptionByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private boolean isCompletedPermit(
      String exportPermitDetailNumber, Map<Long, Boolean> permittedByPermitNumber) {
    Long permitNumber = parsePositiveLong(trimToNull(exportPermitDetailNumber));
    if (permitNumber == null) {
      return false;
    }
    if (permittedByPermitNumber.containsKey(permitNumber)) {
      return permittedByPermitNumber.get(permitNumber);
    }
    boolean permitted =
        repository
            .findPermitStatusCodeByPermitNumber(permitNumber)
            .map(EXPORT_PERMIT_STATUS_COMPLETE::equals)
            .orElse(false);
    permittedByPermitNumber.put(permitNumber, permitted);
    return permitted;
  }

  private ApplicationScaleDetailItem missingScaleDetail() {
    return new ApplicationScaleDetailItem(false, null, null, null, null, null, null);
  }

  private String formatTimberMark(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "Unmanufactured" : normalized;
  }

  private String formatOneDecimal(double value) {
    return new DecimalFormat("0.0").format(value);
  }

  private String nonNull(String value) {
    return value == null ? "" : value;
  }

  private PersistedRemark toPersistedRemark(ApplicationDetailsRpcRepository.RemarkRow row) {
    String remark = row.remark() == null ? "" : row.remark();
    return new PersistedRemark(
        row.remarkId(),
        remark,
        truncateRemarkForDisplay(remark),
        row.user(),
        row.date());
  }

  private String resolveAttachmentTypeDescription(
      String attachmentTypeCode, Map<String, String> attachmentTypeByCode) {
    String normalizedCode = trimToNull(attachmentTypeCode);
    if (normalizedCode == null) {
      return "";
    }

    String known = attachmentTypeByCode.get(normalizedCode);
    if (known != null) {
      return known;
    }

    String resolved =
        repository.findAttachmentTypeDescription(normalizedCode).orElse(normalizedCode);
    attachmentTypeByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private String normalizeDescription(String description) {
    String normalized = trimToNull(description);
    return normalized == null ? DESCRIPTION_NOT_ON_FILE : normalized;
  }

  private String truncateRemarkForDisplay(String remark) {
    String normalized = remark == null ? "" : remark;
    String value =
        normalized.length() > REMARK_DISPLAY_LIMIT
            ? normalized.substring(0, REMARK_DISPLAY_LIMIT) + "..."
            : normalized;
    return sanitize(value);
  }

  private String sanitize(String input) {
    if (input == null || input.isEmpty()) {
      return "";
    }
    return input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;");
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private Long parsePositiveLong(String value) {
    try {
      long parsed = Long.parseLong(value);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private CreateApplicationRequest normalizeCreateApplicationRequest(CreateApplicationRequest input) {
    if (input == null) {
      return new CreateApplicationRequest(
          null, null, null, null, null, null, null, null, null, null, null, null, null,
          null, null, null, null, JURISDICTION_PROVINCIAL, null, null, null, OIC_INDICATOR_NO, true);
    }

    return new CreateApplicationRequest(
        input.federalApplicationNumber(),
        input.applicationDate(),
        input.termDays(),
        input.receivedDate(),
        input.applicationVolume(),
        input.averageLogVolume() == null ? 0.0d : input.averageLogVolume(),
        trimToNull(input.productLocation()),
        input.exportScheduleId(),
        trimToNull(input.agentClientNumber()),
        trimToNull(input.agentClientLocationCode()),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.ownerClientLocationCode()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.exemptionReasonCode()),
        trimToNull(input.applicantTypeCode()),
        input.orgUnitNumber(),
        trimToNull(input.productTypeCode()),
        firstNonBlank(input.jurisdictionCode(), JURISDICTION_PROVINCIAL),
        trimToNull(input.growthTypeCode()),
        trimToNull(input.agentContactName()),
        trimToNull(input.ownerContactName()),
        firstNonBlank(input.oicIndicator(), OIC_INDICATOR_NO),
        input.validationEnabled());
  }

  private List<String> validateCreateApplication(CreateApplicationRequest request) {
    List<String> errors = new ArrayList<>();
    if (request.applicationDate() == null) {
      errors.add(required("application date"));
    }
    if (request.termDays() == null || request.termDays() <= 0) {
      errors.add("The application term days must be greater than or equal to 0");
    }
    if (request.receivedDate() == null) {
      errors.add(required("application received date"));
    }
    if (request.applicationVolume() == null || request.applicationVolume() <= 0.0d) {
      errors.add("The application volume must be greater than or equal to 0");
    }
    if (trimToNull(request.productTypeCode()) == null) {
      errors.add(required("product type code"));
    }
    if (request.orgUnitNumber() == null || request.orgUnitNumber() <= 0) {
      errors.add(required("application region"));
    }
    if (trimToNull(request.ownerClientNumber()) == null) {
      errors.add(required("application owner number"));
    }
    if (trimToNull(request.ownerClientLocationCode()) == null) {
      errors.add(required("application owner location"));
    }
    if (trimToNull(request.ownerContactName()) == null) {
      errors.add(required("application owner name"));
    }
    return errors;
  }

  private ApplicationDetailsRpcRepository.ApplicationInsertRecord toInsertRecord(
      CreateApplicationRequest request, String entryUserId) {
    return new ApplicationDetailsRpcRepository.ApplicationInsertRecord(
        request.applicationDate(),
        request.federalApplicationNumber(),
        request.termDays(),
        request.receivedDate(),
        request.applicationVolume(),
        request.averageLogVolume(),
        request.productLocation(),
        entryUserId,
        request.exportScheduleId(),
        request.agentClientNumber(),
        request.agentClientLocationCode(),
        request.ownerClientNumber(),
        request.ownerClientLocationCode(),
        request.exemptionNumber(),
        request.exemptionReasonCode(),
        APPLICATION_STATUS_NEW,
        request.applicantTypeCode(),
        request.orgUnitNumber(),
        request.productTypeCode(),
        request.jurisdictionCode(),
        request.growthTypeCode(),
        request.agentContactName(),
        request.ownerContactName(),
        request.oicIndicator());
  }

  private String required(String fieldName) {
    return "A valid " + fieldName + " is required.";
  }

  private String firstNonBlank(String value, String fallback) {
    String normalized = trimToNull(value);
    return normalized == null ? fallback : normalized;
  }
}

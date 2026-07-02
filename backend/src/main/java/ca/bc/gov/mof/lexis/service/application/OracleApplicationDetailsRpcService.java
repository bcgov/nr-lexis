package ca.bc.gov.mof.lexis.service.application;

import static ca.bc.gov.mof.lexis.util.TextUtils.defaultSystemUser;
import static ca.bc.gov.mof.lexis.util.TextUtils.firstNonBlank;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.parsePositiveLong;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class OracleApplicationDetailsRpcService implements ApplicationDetailsRpcService {

  private static final String DESCRIPTION_NOT_ON_FILE = "Not on file";
  private static final String APPLICATION_STATUS_NEW = "NEW";
  private static final String APPLICATION_STATUS_APPROVED = "APP";
  private static final String APPLICATION_STATUS_EXPIRED = "EXP";
  private static final String APPLICATION_DETAILS_LOCKED_MESSAGE =
      "Application details can only be edited while the application is new or approved.";
  private static final String APPLICANT_TYPE_OWNER = "O";
  private static final String APPLICANT_TYPE_AGENT = "A";
  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String JURISDICTION_FEDERAL = "F";
  private static final String OIC_INDICATOR_NO = "N";
  private static final String EXPORT_PRODUCT_TYPE_HARVESTED = "H";
  private static final String EXPORT_PRODUCT_TYPE_STANDING = "S";
  private static final String EXPORT_PRODUCT_TYPE_UNMANUFACTURED = "T";
  private static final String UNMANUFACTURED_TIMBER_MARK = "UNMANU";
  private static final Set<String> VALID_TIMBER_MARK_STATUSES =
      Set.of("HI", "HA", "HB", "HC", "HN", "HP", "LC", "HX", "ACT");
  private static final String SPECIES_TYPE_CEDAR = "CE";
  private static final String EXPORT_SPECIES_ENDUSE_OTHER = "OT";
  private static final String SAVE_SUCCESS_MESSAGE = "The application was saved successfully.";
  private static final String EXPORT_PERMIT_STATUS_COMPLETE = "COM";
  private static final String PACKAGE_EXISTS_MESSAGE_TEMPLATE = "Package %s already exists.";
  private static final String PACKAGE_PERMITTED_SCALE_MESSAGE =
      "Package changes are not allowed after a scale has been permitted.";
  private static final String SCALE_PERMITTED_MESSAGE =
      "Scale changes are not allowed after a permit has been completed.";
  private static final int REMARK_DISPLAY_LIMIT = 70;
  private static final double MAX_APPLICATION_VOLUME = 9_999_999.9d;
  private static final double MAX_AVERAGE_LOG_VOLUME = 99.9d;

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
    String normalizedUserId = defaultMutationUser(userId);
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
  @Transactional(readOnly = true)
  public CreateApplicationResult validateApplication(CreateApplicationRequest request) {
    CreateApplicationRequest normalized = normalizeCreateApplicationRequest(request);
    List<String> errors = validateCreateApplication(normalized);
    if (!errors.isEmpty()) {
      return new CreateApplicationResult(false, null, null, errors, List.of());
    }
    return new CreateApplicationResult(true, null, null, List.of(), List.of());
  }

  @Override
  @Transactional
  public CreateApplicationResult addApplication(CreateApplicationRequest request, String userId) {
    CreateApplicationRequest normalized = normalizeCreateApplicationRequest(request);
    List<String> errors = validateCreateApplication(normalized);
    List<String> warnings = List.of();

    if (normalized.validationEnabled() && !errors.isEmpty()) {
      return new CreateApplicationResult(false, null, null, errors, warnings);
    }

    String entryUserId = defaultMutationUser(userId);
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

    if (normalized.speciesCodes() != null
        && !repository.replaceApplicationEndUses(
            applicationNumber, toEndUses(normalized.speciesCodes(), normalized.endUseCode()))) {
      markRollbackOnly();
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please note the time this error occurred and report to someone.",
          null,
          List.of(),
          warnings);
    }

    String remarkBody = trimToNull(normalized.remarkBody());
    if (remarkBody != null
        && repository.insertRemark(applicationNumber, remarkBody, entryUserId, Instant.now()).isEmpty()) {
      markRollbackOnly();
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
  @Transactional
  public CreateApplicationResult updateApplicationSummary(
      ApplicationSummaryUpdateRequest request, String userId) {
    ApplicationSummaryUpdateRequest normalized = normalizeApplicationSummaryUpdateRequest(request);
    if (normalized.applicationNumber() == null || normalized.applicationNumber() < 1) {
      return new CreateApplicationResult(
          false, null, null, List.of(required("application number")), List.of());
    }

    Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> existing =
        repository.findApplicationUpdateRecord(normalized.applicationNumber());
    if (existing.isEmpty()) {
      return new CreateApplicationResult(
          false,
          "No application was found for " + normalized.applicationNumber() + ".",
          normalized.applicationNumber(),
          List.of(),
          List.of());
    }
    if (!isEditableApplicationDetailStatus(existing.get().applicationStatusCode())) {
      return new CreateApplicationResult(
          false,
          null,
          normalized.applicationNumber(),
          List.of(APPLICATION_DETAILS_LOCKED_MESSAGE),
          List.of());
    }

    ApplicationDetailsRpcRepository.ApplicationUpdateRecord updateRecord =
        toApplicationUpdateRecord(existing.get(), normalized, defaultMutationUser(userId));
    List<String> errors = validateApplicationUpdate(updateRecord);
    validateApplicationSpeciesEndUse(
        updateRecord.orgUnitNumber(),
        updateRecord.productTypeCode(),
        normalized.endUseCode(),
        normalized.speciesCodes(),
        false,
        errors);
    if (normalized.validationEnabled() && !errors.isEmpty()) {
      return new CreateApplicationResult(
          false, null, normalized.applicationNumber(), errors, List.of());
    }

    if (!repository.updateApplication(updateRecord)) {
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please try again.",
          normalized.applicationNumber(),
          List.of(),
          List.of());
    }

    if (normalized.speciesCodes() != null
        && !repository.replaceApplicationEndUses(
            normalized.applicationNumber(), toEndUses(normalized.speciesCodes(), normalized.endUseCode()))) {
      markRollbackOnly();
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please try again.",
          normalized.applicationNumber(),
          List.of(),
          List.of());
    }

    return new CreateApplicationResult(
        true, SAVE_SUCCESS_MESSAGE, normalized.applicationNumber(), List.of(), List.of());
  }

  @Override
  public Optional<ApplicationSummarySnapshot> getApplicationSummarySnapshot(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findApplicationUpdateRecord(applicationNumber).map(this::toApplicationSummarySnapshot);
  }

  @Override
  public boolean isApplicationVolumeUsed(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return true;
    }

    Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> application =
        repository.findApplicationUpdateRecord(applicationNumber);
    if (application.isEmpty()
        || APPLICATION_STATUS_EXPIRED.equalsIgnoreCase(application.get().applicationStatusCode())) {
      return true;
    }

    BigDecimal applicationVolume = roundOneDecimal(application.get().applicationVolume());
    BigDecimal totalPackageVolume = BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
    for (ApplicationDetailsRpcRepository.PackageDetailsRow row :
        repository.findPackagesByApplicationNumber(applicationNumber)) {
      totalPackageVolume =
          totalPackageVolume.add(roundOneDecimal(row.packageVolume())).setScale(1, RoundingMode.HALF_UP);
    }
    return applicationVolume.compareTo(totalPackageVolume) == 0;
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
  public List<CodeItem> getPackageStatusCodes() {
    return repository.findAllPackageStatusCodes().stream().map(this::toCodeItem).toList();
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
  public List<CodeItem> getEndUsesForSpeciesRegion(
      String orgUnitNumber, List<String> speciesCodes) {
    List<String> normalizedSpeciesCodes = normalizeCodes(speciesCodes);
    Long parsedOrgUnitNumber = parsePositiveLong(trimToNull(orgUnitNumber));
    if (normalizedSpeciesCodes.isEmpty() || parsedOrgUnitNumber == null) {
      return List.of();
    }

    TreeSet<String> endUseCodes = new TreeSet<>();
    for (ApplicationDetailsRpcRepository.ExcolValidationRow row :
        repository.findCandidateEndUseCodes(
            normalizedSpeciesCodes.size(), normalizedSpeciesCodes.get(0), parsedOrgUnitNumber)) {
      String endUseCode = trimToNull(row.excolCode());
      if (endUseCode != null) {
        endUseCodes.add(endUseCode);
      }
    }

    List<CodeItem> response = new ArrayList<>();
    for (String endUseCode : endUseCodes) {
      repository.findEndUseCode(endUseCode).map(this::toCodeItem).ifPresent(response::add);
    }
    return response;
  }

  @Override
  public List<SpeciesCodeItem> getRemainingSpecies(
      String orgUnitNumber, String productTypeCode, List<String> selectedSpeciesCodes) {
    List<String> normalizedSelectedSpecies = normalizeCodes(selectedSpeciesCodes);
    TreeSet<String> speciesCodeSet = new TreeSet<>();

    if (normalizedSelectedSpecies.isEmpty()) {
      for (ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow row :
          repository.findSpeciesEndUsesByRegion(orgUnitNumber)) {
        String speciesCode = trimToNull(row.speciesCode());
        if (speciesCode != null) {
          speciesCodeSet.add(speciesCode);
        }
      }
    } else {
      Long parsedOrgUnitNumber = parsePositiveLong(trimToNull(orgUnitNumber));
      if (parsedOrgUnitNumber == null) {
        return List.of();
      }
      for (ApplicationDetailsRpcRepository.ExcolValidationRow row :
          repository.findCandidateExcolCombinations(
              normalizedSelectedSpecies.size(),
              normalizedSelectedSpecies.get(0),
              parsedOrgUnitNumber)) {
        String excolCode = trimToNull(row.excolCode());
        if (excolCode == null || !containsAllLegacy(excolCode, normalizedSelectedSpecies)) {
          continue;
        }
        String[] excolTokens = excolCode.split("/");
        for (int i = 0; i < excolTokens.length - 1; i++) {
          String speciesCode = trimToNull(excolTokens[i]);
          if (speciesCode != null && !normalizedSelectedSpecies.contains(speciesCode)) {
            speciesCodeSet.add(speciesCode);
          }
        }
      }
    }

    if (EXPORT_PRODUCT_TYPE_STANDING.equals(trimToNull(productTypeCode))) {
      speciesCodeSet.remove(SPECIES_TYPE_CEDAR);
    }

    return speciesCodeSet.stream().map(SpeciesCodeItem::new).toList();
  }

  @Override
  public Optional<String> getSelectedEndUse(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findEndUsesByApplicationNumber(applicationNumber).stream()
        .map(ApplicationDetailsRpcRepository.EndUseRow::endUseCode)
        .map(TextUtils::trimToNull)
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
        .map(TextUtils::trimToNull)
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
  public PackageDetailsItem getPackageDetails(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return emptyPackageDetails();
    }

    ApplicationDetailsRpcRepository.PackageDetailsRow packageDetails =
        repository.findPackageDetailsByPackageNumber(normalizedPackageNumber).orElse(null);
    if (packageDetails == null) {
      return emptyPackageDetails();
    }

    BigDecimal scaledVolume = BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
    for (ApplicationDetailsRpcRepository.ApplicationScaleDetailRow scale :
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber)) {
      BigDecimal speciesGradeVolume =
          BigDecimal.valueOf(scale.speciesGradeVolume()).setScale(1, RoundingMode.HALF_UP);
      scaledVolume = scaledVolume.add(speciesGradeVolume).setScale(1, RoundingMode.HALF_UP);
    }

    String statusCode = trimToNull(packageDetails.packageStatusCode());
    String growthTypeCode = trimToNull(packageDetails.growthTypeCode());
    String productTypeCode = trimToNull(packageDetails.productTypeCode());

    String statusDescription =
        repository.findPackageStatusDescription(statusCode).orElse(nonNull(statusCode));
    String growthTypeDescription =
        repository.findGrowthTypeDescription(growthTypeCode).orElse(nonNull(growthTypeCode));
    String productTypeDescription =
        repository.findProductTypeDescription(productTypeCode).orElse(nonNull(productTypeCode));

    return new PackageDetailsItem(
        true,
        nonNull(trimToNull(packageDetails.packageNumber())),
        formatOneDecimal(packageDetails.packageVolume()),
        scaledVolume.doubleValue(),
        formatOneDecimal(packageDetails.averageLength()),
        formatOneDecimal(packageDetails.averageDiameter()),
        nonNull(statusCode),
        nonNull(packageDetails.comments()),
        statusDescription,
        nonNull(trimToNull(packageDetails.reprocessedIndicator())),
        nonNull(growthTypeCode),
        growthTypeDescription,
        nonNull(productTypeCode),
        productTypeDescription);
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
  public PackagePersistenceResult addPackage(PackageMutationRequest request, String userId) {
    PackageMutationRequest normalized = normalizePackageMutationRequest(request);
    List<String> errors = validatePackageMutation(normalized, false, null);
    if (!errors.isEmpty()) {
      return invalidPackageResult(normalized.packageNumber(), errors);
    }

    ApplicationDetailsRpcRepository.PackageMutationRecord record =
        toPackageMutationRecord(normalized, null, normalized.packageNumber(), defaultMutationUser(userId), true);
    Optional<ApplicationDetailsRpcRepository.PackageMutationRow> inserted = repository.insertPackage(record);
    if (inserted.isEmpty()) {
      return invalidPackageResult(
          normalized.packageNumber(),
          List.of("We were unable to save this package. Please try again."));
    }

    return packageSuccess(record.packageNumber(), record);
  }

  @Override
  @Transactional
  public PackagePersistenceResult updatePackage(PackageMutationRequest request, String userId) {
    PackageMutationRequest normalized = normalizePackageMutationRequest(request);
    String currentPackageNumber = trimToNull(normalized.packageNumber());
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        repository.findPackageMutationByPackageNumber(currentPackageNumber).orElse(null);
    List<String> errors = validatePackageMutation(normalized, true, existing);
    if (existing == null) {
      errors.add("Package number " + nonNull(currentPackageNumber) + " does not exist.");
    }
    if (!errors.isEmpty()) {
      return invalidPackageResult(firstNonBlank(normalized.newPackageNumber(), currentPackageNumber), errors);
    }

    String targetPackageNumber = firstNonBlank(normalized.newPackageNumber(), currentPackageNumber);
    ApplicationDetailsRpcRepository.PackageMutationRecord record =
        toPackageMutationRecord(normalized, existing, targetPackageNumber, defaultMutationUser(userId), false);

    boolean saved;
    if (!targetPackageNumber.equals(currentPackageNumber)) {
      saved = renamePackage(currentPackageNumber, record, defaultMutationUser(userId));
    } else {
      saved = repository.updatePackage(record);
    }

    if (!saved) {
      return invalidPackageResult(
          targetPackageNumber, List.of("We were unable to save this package. Please try again."));
    }
    return packageSuccess(targetPackageNumber, record);
  }

  @Override
  public ScalePersistenceResult addScaleToPackage(ScaleMutationRequest request, String userId) {
    ScaleMutationRequest normalized = normalizeScaleMutationRequest(request);
    List<String> errors = validateScaleMutation(normalized);
    if (!errors.isEmpty()) {
      return new ScalePersistenceResult(false, null, errors, List.of());
    }

    ApplicationDetailsRpcRepository.ScaleMutationRecord record =
        new ApplicationDetailsRpcRepository.ScaleMutationRecord(
            null,
            normalized.timberMark(),
            normalized.pieces(),
            normalized.volume(),
            normalized.packageNumber(),
            normalized.speciesCode(),
            normalized.gradeCode(),
            normalized.applicationNumber(),
            null,
            0.0d,
            defaultMutationUser(userId),
            Instant.now(),
            null);

    Optional<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> inserted =
        repository.insertScaleDetail(record);
    if (inserted.isEmpty()) {
      return new ScalePersistenceResult(
          false,
          null,
          List.of("We were unable to save this scale. Please try again."),
          List.of());
    }

    return new ScalePersistenceResult(
        true, toScalePersistenceItem(inserted.get()), List.of(), List.of());
  }

  @Override
  public boolean deleteScaleById(String scaleDetailId, String userId) {
    String normalizedScaleDetailId = trimToNull(scaleDetailId);
    if (normalizedScaleDetailId == null) {
      return false;
    }
    ApplicationDetailsRpcRepository.ApplicationScaleDetailRow scale =
        repository.findScaleDetailById(normalizedScaleDetailId).orElse(null);
    if (scale == null || isCompletedPermit(scale.exportPermitDetailNumber(), new LinkedHashMap<>())) {
      return false;
    }
    return repository.deleteScaleById(normalizedScaleDetailId, defaultMutationUser(userId));
  }

  @Override
  public boolean deletePackageById(String packageNumber, String userId) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return false;
    }
    List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows =
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber);
    long scalePieces =
        scaleRows.stream()
            .mapToLong(ApplicationDetailsRpcRepository.ApplicationScaleDetailRow::piecesCount)
            .sum();
    if (hasPermittedScale(scaleRows) || scalePieces > 0) {
      return false;
    }
    return repository.deletePackageById(normalizedPackageNumber, defaultMutationUser(userId));
  }

  private PackageMutationRequest normalizePackageMutationRequest(PackageMutationRequest request) {
    if (request == null) {
      return new PackageMutationRequest(
          null, null, null, null, null, null, null, null, null, null, null, null, List.of());
    }
    return new PackageMutationRequest(
        trimToNull(request.packageNumber()),
        trimToNull(request.newPackageNumber()),
        request.applicationNumber(),
        request.volume(),
        request.averageLength(),
        request.averageDiameter(),
        trimToNull(request.status()),
        request.comments() == null ? "" : request.comments(),
        trimToNull(request.reprocessed()),
        trimToNull(request.ageClass()),
        trimToNull(request.productType()),
        trimToNull(request.endUseCode()),
        normalizeCodes(request.speciesCodes()));
  }

  private List<String> validatePackageMutation(
      PackageMutationRequest request,
      boolean update,
      ApplicationDetailsRpcRepository.PackageMutationRow existing) {
    List<String> errors = new ArrayList<>();
    String packageNumber = trimToNull(request.packageNumber());
    String newPackageNumber = trimToNull(request.newPackageNumber());
    String targetPackageNumber = update ? firstNonBlank(newPackageNumber, packageNumber) : packageNumber;

    if (packageNumber == null) {
      errors.add(required("package number"));
    } else if (packageNumber.length() > 20) {
      errors.add("The package number must be 20 characters or fewer.");
    }

    if (targetPackageNumber != null && targetPackageNumber.length() > 20) {
      errors.add("The new package number must be 20 characters or fewer.");
    }

    if (!update && packageNumber != null && repository.packageExists(packageNumber)) {
      errors.add(PACKAGE_EXISTS_MESSAGE_TEMPLATE.formatted(packageNumber));
    }

    if (update
        && newPackageNumber != null
        && !newPackageNumber.equals(packageNumber)
        && repository.packageExists(newPackageNumber)) {
      errors.add(PACKAGE_EXISTS_MESSAGE_TEMPLATE.formatted(newPackageNumber));
    }

    if (request.averageDiameter() == null || request.averageDiameter() <= 0.0d) {
      errors.add("The package average diameter must be greater than 0.");
    } else if (request.averageDiameter() > 99.99d) {
      errors.add("The package average diameter must be less than 99.9.");
    }

    if (request.averageLength() == null || request.averageLength() <= 0.0d) {
      errors.add("The package average length must be greater than 0.");
    } else if (request.averageLength() > 99.0d) {
      errors.add("The package average length must be less than 99.9.");
    }

    if (request.volume() == null || request.volume() < 0.0d) {
      errors.add("The package volume must be greater than or equal to 0.");
    } else if (!hasAtMostOneDecimal(request.volume())) {
      errors.add("The package volume must have no more than one decimal place.");
    }

    String effectiveProductType =
        firstNonBlank(request.productType(), existing == null ? null : existing.productTypeCode());
    String effectiveAgeClass =
        firstNonBlank(request.ageClass(), existing == null ? null : existing.growthTypeCode());
    if (effectiveProductType == null) {
      errors.add(required("package product type code"));
    }
    if (requiresGrowthType(effectiveProductType) && effectiveAgeClass == null) {
      errors.add(required("package growth type code"));
    }

    if (request.status() == null) {
      errors.add(required("package status code"));
    }

    if (update && packageNumber != null && request.volume() != null) {
      List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows =
          repository.findScaleDetailsByPackageNumber(packageNumber);
      if (hasPermittedScale(scaleRows)) {
        errors.add(PACKAGE_PERMITTED_SCALE_MESSAGE);
      }
      double scaledVolume =
          scaleRows.stream()
              .mapToDouble(ApplicationDetailsRpcRepository.ApplicationScaleDetailRow::speciesGradeVolume)
              .sum();
      if (BigDecimal.valueOf(request.volume()).compareTo(BigDecimal.valueOf(scaledVolume)) < 0) {
        errors.add(
            "The package volume must be more than the total scale volume ("
                + formatOneDecimal(scaledVolume)
                + ").");
      }
    }

    validatePackageApplicationVolume(request, update, existing, targetPackageNumber, errors);

    return errors;
  }

  private void validatePackageApplicationVolume(
      PackageMutationRequest request,
      boolean update,
      ApplicationDetailsRpcRepository.PackageMutationRow existing,
      String targetPackageNumber,
      List<String> errors) {
    Long applicationNumber =
        request.applicationNumber() == null && existing != null
            ? existing.applicationNumber()
            : request.applicationNumber();
    if (applicationNumber == null || applicationNumber < 1 || request.volume() == null) {
      return;
    }

    Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> application =
        repository.findApplicationUpdateRecord(applicationNumber);
    if (application.isEmpty()
        || APPLICATION_STATUS_EXPIRED.equalsIgnoreCase(application.get().applicationStatusCode())) {
      return;
    }

    String currentPackageNumber =
        existing == null ? null : trimToNull(existing.packageNumber());
    BigDecimal totalPackageVolume = BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
    for (ApplicationDetailsRpcRepository.PackageDetailsRow row :
        repository.findPackagesByApplicationNumber(applicationNumber)) {
      String rowPackageNumber = trimToNull(row.packageNumber());
      if (update
          && (equalsNullable(rowPackageNumber, currentPackageNumber)
              || equalsNullable(rowPackageNumber, targetPackageNumber))) {
        continue;
      }
      totalPackageVolume =
          totalPackageVolume.add(roundOneDecimal(row.packageVolume())).setScale(1, RoundingMode.HALF_UP);
    }

    BigDecimal requestedTotal =
        totalPackageVolume.add(roundOneDecimal(request.volume())).setScale(1, RoundingMode.HALF_UP);
    BigDecimal applicationVolume = roundOneDecimal(application.get().applicationVolume());
    if (requestedTotal.compareTo(applicationVolume) > 0) {
      errors.add(
          "The total package volume must not exceed the application volume ("
              + applicationVolume.toPlainString()
              + ").");
    }
  }

  private boolean hasAtMostOneDecimal(Double value) {
    if (value == null) {
      return false;
    }
    return BigDecimal.valueOf(value).stripTrailingZeros().scale() <= 1;
  }

  private void validateOptionalVolumeRange(
      Double value,
      String label,
      double maxValue,
      List<String> errors) {
    if (value == null) {
      return;
    }
    validateVolumeRange(value, label, maxValue, errors);
  }

  private void validateVolumeRange(
      Double value,
      String label,
      double maxValue,
      List<String> errors) {
    if (value < 0.0d) {
      errors.add("The " + label + " must be greater than or equal to 0.");
      return;
    }
    if (value > maxValue) {
      errors.add("The " + label + " must be less than or equal to " + formatOneDecimal(maxValue) + ".");
    }
    if (!hasAtMostOneDecimal(value)) {
      errors.add("The " + label + " must have no more than one decimal place.");
    }
  }

  private ApplicationDetailsRpcRepository.PackageMutationRecord toPackageMutationRecord(
      PackageMutationRequest request,
      ApplicationDetailsRpcRepository.PackageMutationRow existing,
      String packageNumber,
      String userId,
      boolean insert) {
    return new ApplicationDetailsRpcRepository.PackageMutationRecord(
        packageNumber,
        request.applicationNumber() == null && existing != null
            ? existing.applicationNumber()
            : request.applicationNumber(),
        firstNonBlank(request.reprocessed(), existing == null ? null : existing.reprocessedIndicator()),
        request.volume() == null && existing != null ? existing.packageVolume() : request.volume(),
        request.averageLength() == null && existing != null ? existing.averageLength() : request.averageLength(),
        request.averageDiameter() == null && existing != null ? existing.averageDiameter() : request.averageDiameter(),
        request.comments(),
        existing == null ? null : existing.packageFee(),
        existing == null ? null : existing.federalPermitNumber(),
        existing == null ? null : existing.reservePermitNumber(),
        firstNonBlank(request.status(), existing == null ? null : existing.packageStatusCode()),
        firstNonBlank(request.ageClass(), existing == null ? null : existing.growthTypeCode()),
        firstNonBlank(request.productType(), existing == null ? null : existing.productTypeCode()),
        insert ? defaultMutationUser(userId) : existing == null ? defaultMutationUser(userId) : existing.entryUserId(),
        insert || existing == null ? Instant.now() : existing.entryTimestamp(),
        insert ? null : defaultMutationUser(userId),
        toEndUses(request.speciesCodes(), request.endUseCode()));
  }

  private List<ApplicationDetailsRpcRepository.EndUseMutationRecord> toEndUses(
      List<String> speciesCodes, String endUseCode) {
    List<String> normalizedSpeciesCodes = normalizeCodes(speciesCodes);
    if (normalizedSpeciesCodes.isEmpty()) {
      return List.of();
    }

    String normalizedEndUseCode = firstNonBlank(endUseCode, EXPORT_SPECIES_ENDUSE_OTHER);
    return normalizedSpeciesCodes.stream()
        .map(code -> new ApplicationDetailsRpcRepository.EndUseMutationRecord(code, normalizedEndUseCode))
        .toList();
  }

  private boolean renamePackage(
      String currentPackageNumber,
      ApplicationDetailsRpcRepository.PackageMutationRecord record,
      String userId) {
    if (repository.insertPackage(record).isEmpty()) {
      markRollbackOnly();
      return false;
    }

    for (ApplicationDetailsRpcRepository.ScaleMutationRow scale :
        repository.findScaleMutationDetailsByPackageNumber(currentPackageNumber)) {
      boolean updated =
          repository.updateScaleDetail(
              new ApplicationDetailsRpcRepository.ScaleMutationRecord(
                  scale.scaleDetailId(),
                  scale.timberMark(),
                  scale.piecesCount(),
                  scale.speciesGradeVolume(),
                  record.packageNumber(),
                  scale.speciesCode(),
                  scale.gradeCode(),
                  scale.applicationNumber(),
                  scale.exportPermitDetailNumber(),
                  0.0d,
                  scale.entryUserId(),
                  scale.entryTimestamp(),
                  defaultMutationUser(userId)));
      if (!updated) {
        markRollbackOnly();
        return false;
      }
    }

    boolean deleted = repository.deletePackageById(currentPackageNumber, defaultMutationUser(userId));
    if (!deleted) {
      markRollbackOnly();
    }
    return deleted;
  }

  private PackagePersistenceResult invalidPackageResult(String packageNumber, List<String> errors) {
    return new PackagePersistenceResult(
        false, nonNull(trimToNull(packageNumber)), null, null, null, null, errors, List.of());
  }

  private PackagePersistenceResult packageSuccess(
      String packageNumber, ApplicationDetailsRpcRepository.PackageMutationRecord record) {
    return new PackagePersistenceResult(
        true,
        nonNull(trimToNull(packageNumber)),
        formatOneDecimal(record.packageVolume() == null ? 0.0d : record.packageVolume()),
        formatOneDecimal(record.averageLength() == null ? 0.0d : record.averageLength()),
        formatOneDecimal(record.averageDiameter() == null ? 0.0d : record.averageDiameter()),
        nonNull(trimToNull(record.packageStatusCode())),
        List.of(),
        List.of());
  }

  private ScaleMutationRequest normalizeScaleMutationRequest(ScaleMutationRequest request) {
    if (request == null) {
      return new ScaleMutationRequest(null, null, null, null, null, null, null);
    }
    return new ScaleMutationRequest(
        trimToNull(request.timberMark()),
        trimToNull(request.packageNumber()),
        trimToNull(request.gradeCode()),
        trimToNull(request.speciesCode()),
        request.applicationNumber(),
        request.pieces(),
        request.volume());
  }

  private List<String> validateScaleMutation(ScaleMutationRequest request) {
    List<String> errors = new ArrayList<>();
    String packageNumber = trimToNull(request.packageNumber());

    if (packageNumber == null) {
      errors.add(required("scale package number"));
    } else if (!repository.packageExists(packageNumber)) {
      errors.add("Package number " + packageNumber + " does not exist.");
    }

    if (trimToNull(request.timberMark()) == null) {
      errors.add(required("timber mark"));
    } else {
      validateTimberMark(request, errors);
    }
    if (trimToNull(request.gradeCode()) == null) {
      errors.add(required("grade code"));
    }
    if (trimToNull(request.speciesCode()) == null) {
      errors.add(required("species code"));
    }

    if (request.pieces() == null || request.pieces() < 0) {
      errors.add("The scale pieces must be greater than or equal to 0.");
    } else if (request.pieces() > 999_999_999L) {
      errors.add("The scale pieces must be less than 999999999.");
    }

    if (request.volume() == null || request.volume() < 0.0d) {
      errors.add("The scale volume must be greater than or equal to 0.");
    } else if (request.volume() > 99_999.9d) {
      errors.add("The scale volume must be less than 99999.9.");
    }

    if (packageNumber != null) {
      List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows =
          repository.findScaleDetailsByPackageNumber(packageNumber);
      if (hasPermittedScale(scaleRows)) {
        errors.add(SCALE_PERMITTED_MESSAGE);
      }
      boolean duplicate =
          scaleRows.stream()
              .anyMatch(
                  row ->
                      equalsNullable(trimToNull(request.timberMark()), trimToNull(row.timberMark()))
                          && equalsNullable(trimToNull(request.speciesCode()), trimToNull(row.exportSpeciesCode()))
                          && equalsNullable(trimToNull(request.gradeCode()), trimToNull(row.exportGradeCode())));
      if (duplicate) {
        errors.add("A scale with this timber mark, species, and grade already exists.");
      }

      if (request.volume() != null) {
        double packageVolume =
            repository
                .findPackageDetailsByPackageNumber(packageNumber)
                .map(ApplicationDetailsRpcRepository.PackageDetailsRow::packageVolume)
                .orElse(0.0d);
        double scaleTotal =
            scaleRows.stream()
                .mapToDouble(ApplicationDetailsRpcRepository.ApplicationScaleDetailRow::speciesGradeVolume)
                .sum();
        if (BigDecimal.valueOf(scaleTotal + request.volume()).compareTo(BigDecimal.valueOf(packageVolume)) > 0) {
          double allowedVolume = packageVolume - scaleTotal;
          errors.add(
              allowedVolume <= 0.0d
                  ? "The package volume has already been met."
                  : "The scale volume must be less than " + formatOneDecimal(allowedVolume) + ".");
        }
      }
    }

    return errors;
  }

  private void validateTimberMark(ScaleMutationRequest request, List<String> errors) {
    String timberMark = trimToNull(request.timberMark());
    if (timberMark == null) {
      return;
    }

    Optional<ApplicationDetailsRpcRepository.TimberMarkRow> baseMark =
        repository.findTimberMark(timberMark);
    Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> application =
        request.applicationNumber() == null
            ? Optional.empty()
            : repository.findApplicationUpdateRecord(request.applicationNumber());

    if (application
        .map(ApplicationDetailsRpcRepository.ApplicationUpdateRecord::productTypeCode)
        .map(TextUtils::trimToNull)
        .map(EXPORT_PRODUCT_TYPE_UNMANUFACTURED::equals)
        .orElse(false)
        && UNMANUFACTURED_TIMBER_MARK.equalsIgnoreCase(timberMark)) {
      return;
    }

    if (baseMark.isEmpty()) {
      errors.add("Timber mark " + timberMark + " does not exist.");
      return;
    }

    ApplicationDetailsRpcRepository.TimberMarkRow mark = baseMark.get();
    if (application.isPresent()) {
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord app = application.get();
      Optional<ApplicationDetailsRpcRepository.TimberMarkRow> regionalMark =
          repository.findTimberMarkByOrgUnit(timberMark, app.orgUnitNumber());
      if (regionalMark.isEmpty()) {
        errors.add("Timber mark " + timberMark + " is not valid for this region.");
        return;
      }
      mark = regionalMark.get();

      String fileTypeCode = trimToNull(mark.fileTypeCode());
      String jurisdictionCode = trimToNull(app.jurisdictionCode());
      if (JURISDICTION_PROVINCIAL.equals(jurisdictionCode)
          && ("B08".equals(fileTypeCode) || "B14".equals(fileTypeCode))) {
        errors.add("Timber mark " + timberMark + " is not valid for provincial applications.");
        return;
      }
      if (JURISDICTION_FEDERAL.equals(jurisdictionCode) && !"B08".equals(fileTypeCode)) {
        errors.add("Timber mark " + timberMark + " is not valid for federal applications.");
        return;
      }
    }

    String status = trimToNull(mark.markStatus());
    if (status == null || !VALID_TIMBER_MARK_STATUSES.contains(status.toUpperCase(Locale.ROOT))) {
      errors.add(
          "Timber mark " + timberMark + " is not valid for this scale"
              + (status == null ? "." : " due to a status of " + status + "."));
    }
  }

  private boolean hasPermittedScale(List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows) {
    Map<Long, Boolean> permittedByPermitNumber = new LinkedHashMap<>();
    return scaleRows.stream()
        .anyMatch(row -> isCompletedPermit(row.exportPermitDetailNumber(), permittedByPermitNumber));
  }

  private ApplicationPackageScaleItem toScalePersistenceItem(
      ApplicationDetailsRpcRepository.ApplicationScaleDetailRow row) {
    return new ApplicationPackageScaleItem(
        false,
        formatTimberMark(row.timberMark()),
        resolveSpeciesDescription(row.exportSpeciesCode(), new LinkedHashMap<>()),
        row.piecesCount(),
        resolveGradeDescription(row.exportGradeCode(), new LinkedHashMap<>()),
        formatOneDecimal(row.speciesGradeVolume()),
        nonNull(trimToNull(row.exportScaleDetailId())),
        nonNull(trimToNull(row.cascadeSplitCode())));
  }

  private boolean equalsNullable(String left, String right) {
    return left == null ? right == null : left.equals(right);
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // No surrounding transaction exists for this call path.
    }
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
            .map(TextUtils::trimToNull)
            .orElse(normalizedCode);
    endUseDescriptionByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private List<String> normalizeCodes(List<String> codes) {
    if (codes == null || codes.isEmpty()) {
      return List.of();
    }
    return codes.stream().map(TextUtils::trimToNull).filter(value -> value != null).distinct().toList();
  }

  private boolean containsAllLegacy(String excolCode, List<String> selectedSpeciesCodes) {
    for (String selectedSpeciesCode : selectedSpeciesCodes) {
      if (!excolCode.contains(selectedSpeciesCode)) {
        return false;
      }
    }
    return true;
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
            .map(TextUtils::trimToNull)
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
            .map(TextUtils::trimToNull)
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

  private PackageDetailsItem emptyPackageDetails() {
    return new PackageDetailsItem(
        false, "", "", 0.0d, "", "", "", "", "", "", "", "", "", "");
  }

  private String formatTimberMark(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "Unmanufactured" : normalized;
  }

  private String formatOneDecimal(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private BigDecimal roundOneDecimal(Double value) {
    return BigDecimal.valueOf(value == null ? 0.0d : value).setScale(1, RoundingMode.HALF_UP);
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

  private CreateApplicationRequest normalizeCreateApplicationRequest(CreateApplicationRequest input) {
    if (input == null) {
      return new CreateApplicationRequest(
          null, null, null, null, null, null, null, null, null, null, null, null, null,
          null, APPLICANT_TYPE_OWNER, null, null, JURISDICTION_PROVINCIAL, null, null, null,
          OIC_INDICATOR_NO, null, null, null, true);
    }

    String applicantTypeCode =
        firstNonBlank(input.applicantTypeCode(), APPLICANT_TYPE_OWNER).toUpperCase(Locale.ROOT);
    boolean ownerApplicant = APPLICANT_TYPE_OWNER.equals(applicantTypeCode);

    return new CreateApplicationRequest(
        input.federalApplicationNumber(),
        input.applicationDate(),
        input.termDays(),
        input.receivedDate(),
        input.applicationVolume(),
        input.averageLogVolume() == null ? 0.0d : input.averageLogVolume(),
        trimToNull(input.productLocation()),
        input.exportScheduleId(),
        ownerApplicant ? null : trimToNull(input.agentClientNumber()),
        ownerApplicant ? null : trimToNull(input.agentClientLocationCode()),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.ownerClientLocationCode()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.exemptionReasonCode()),
        applicantTypeCode,
        input.orgUnitNumber(),
        trimToNull(input.productTypeCode()),
        firstNonBlank(input.jurisdictionCode(), JURISDICTION_PROVINCIAL),
        trimToNull(input.growthTypeCode()),
        ownerApplicant ? null : trimToNull(input.agentContactName()),
        trimToNull(input.ownerContactName()),
        firstNonBlank(input.oicIndicator(), OIC_INDICATOR_NO),
        trimToNull(input.endUseCode()),
        input.speciesCodes() == null ? null : normalizeCodes(input.speciesCodes()),
        trimToNull(input.remarkBody()),
        input.validationEnabled());
  }

  private ApplicationSummaryUpdateRequest normalizeApplicationSummaryUpdateRequest(
      ApplicationSummaryUpdateRequest input) {
    if (input == null) {
      return new ApplicationSummaryUpdateRequest(
          null, null, null, null, null, null, null, null, null, null, null, null, null, null,
          null, null, null, null, null, null, null, null, null, null, true);
    }
    return new ApplicationSummaryUpdateRequest(
        input.applicationNumber(),
        input.applicationDate(),
        input.termDays(),
        input.receivedDate(),
        input.applicationVolume(),
        input.averageLogVolume(),
        trimToNull(input.exemptionReasonCode()),
        trimToNull(input.productLocation()),
        input.exportScheduleId(),
        trimToNull(input.agentClientNumber()),
        trimToNull(input.agentClientLocationCode()),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.ownerClientLocationCode()),
        trimToNull(input.applicationStatusCode()),
        trimToNull(input.applicantTypeCode()),
        input.orgUnitNumber(),
        trimToNull(input.productTypeCode()),
        trimToNull(input.jurisdictionCode()),
        trimToNull(input.growthTypeCode()),
        trimToNull(input.agentContactName()),
        trimToNull(input.ownerContactName()),
        trimToNull(input.oicIndicator()),
        trimToNull(input.endUseCode()),
        input.speciesCodes() == null ? null : normalizeCodes(input.speciesCodes()),
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
      errors.add("The application volume must be greater than 0.");
    } else {
      validateVolumeRange(
          request.applicationVolume(), "application volume", MAX_APPLICATION_VOLUME, errors);
    }
    validateOptionalVolumeRange(
        request.averageLogVolume(), "average log volume", MAX_AVERAGE_LOG_VOLUME, errors);
    if (trimToNull(request.productLocation()) == null) {
      errors.add(required("location of logs"));
    }
    if (trimToNull(request.productTypeCode()) == null) {
      errors.add(required("product type code"));
    }
    if (requiresGrowthType(request.productTypeCode())
        && trimToNull(request.growthTypeCode()) == null) {
      errors.add(required("growth type code"));
    }
    if (request.orgUnitNumber() == null || request.orgUnitNumber() <= 0) {
      errors.add(required("application region"));
    }
    if (trimToNull(request.ownerClientNumber()) == null) {
      errors.add(required("application owner number"));
    }

    String exemptionReasonCode = trimToNull(request.exemptionReasonCode());
    if (exemptionReasonCode == null) {
      errors.add(required("application exemption reason code"));
    } else if (exemptionReasonCode.length() > 1) {
      errors.add(maxLength("application exemption reason code", 1));
    }

    String ownerClientLocationCode = trimToNull(request.ownerClientLocationCode());
    if (ownerClientLocationCode == null) {
      errors.add(required("application owner location"));
    } else if (ownerClientLocationCode.length() > 2) {
      errors.add(maxLength("application owner location code", 2));
    }

    String agentClientLocationCode = trimToNull(request.agentClientLocationCode());
    if (agentClientLocationCode != null && agentClientLocationCode.length() > 2) {
      errors.add(maxLength("application agent location code", 2));
    }

    if (trimToNull(request.ownerContactName()) == null) {
      errors.add(required("application owner name"));
    }

    String applicantTypeCode = trimToNull(request.applicantTypeCode());
    if (applicantTypeCode == null) {
      errors.add(required("applicant type code"));
    } else if (!APPLICANT_TYPE_OWNER.equals(applicantTypeCode)
        && !APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      errors.add("The applicant type code must be O or A.");
    }
    if (APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      if (trimToNull(request.agentClientNumber()) == null) {
        errors.add(required("application agent number"));
      }
      if (trimToNull(request.agentClientLocationCode()) == null) {
        errors.add(required("application agent location"));
      }
      if (trimToNull(request.agentContactName()) == null) {
        errors.add(required("application agent name"));
      }
    }
    validateApplicationSpeciesEndUse(
        request.orgUnitNumber(),
        request.productTypeCode(),
        request.endUseCode(),
        request.speciesCodes(),
        true,
        errors);
    return errors;
  }

  private List<String> validateApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record) {
    List<String> errors = new ArrayList<>();
    if (!isEditableApplicationDetailStatus(record.applicationStatusCode())) {
      errors.add(APPLICATION_DETAILS_LOCKED_MESSAGE);
    }
    if (record.applicationDate() == null) {
      errors.add(required("application date"));
    }
    if (record.termDays() == null || record.termDays() <= 0) {
      errors.add("The application term days must be greater than or equal to 0");
    }
    if (record.receivedDate() == null) {
      errors.add(required("application received date"));
    }
    if (record.applicationVolume() == null || record.applicationVolume() <= 0.0d) {
      errors.add("The application volume must be greater than 0.");
    } else {
      validateVolumeRange(
          record.applicationVolume(), "application volume", MAX_APPLICATION_VOLUME, errors);
    }
    validateOptionalVolumeRange(
        record.averageLogVolume(), "average log volume", MAX_AVERAGE_LOG_VOLUME, errors);
    String exemptionReasonCode = trimToNull(record.exemptionReasonCode());
    if (exemptionReasonCode == null) {
      errors.add(required("application exemption reason code"));
    } else if (exemptionReasonCode.length() > 1) {
      errors.add(maxLength("application exemption reason code", 1));
    }
    if (trimToNull(record.productLocation()) == null) {
      errors.add(required("location of logs"));
    }
    if (trimToNull(record.productTypeCode()) == null) {
      errors.add(required("product type code"));
    }
    if (requiresGrowthType(record.productTypeCode())
        && trimToNull(record.growthTypeCode()) == null) {
      errors.add(required("growth type code"));
    }
    if (record.orgUnitNumber() == null || record.orgUnitNumber() <= 0) {
      errors.add(required("application region"));
    }
    if (trimToNull(record.ownerClientNumber()) == null) {
      errors.add(required("application owner number"));
    }
    String ownerClientLocationCode = trimToNull(record.ownerClientLocationCode());
    if (ownerClientLocationCode == null) {
      errors.add(required("application owner location"));
    } else if (ownerClientLocationCode.length() > 2) {
      errors.add(maxLength("application owner location code", 2));
    }
    String agentClientLocationCode = trimToNull(record.agentClientLocationCode());
    if (agentClientLocationCode != null && agentClientLocationCode.length() > 2) {
      errors.add(maxLength("application agent location code", 2));
    }
    if (trimToNull(record.ownerContactName()) == null) {
      errors.add(required("application owner name"));
    }
    String applicantTypeCode = trimToNull(record.applicantTypeCode());
    if (applicantTypeCode == null) {
      errors.add(required("applicant type code"));
    } else if (!APPLICANT_TYPE_OWNER.equals(applicantTypeCode)
        && !APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      errors.add("The applicant type code must be O or A.");
    }
    if (APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      if (trimToNull(record.agentClientNumber()) == null) {
        errors.add(required("application agent number"));
      }
      if (trimToNull(record.agentClientLocationCode()) == null) {
        errors.add(required("application agent location"));
      }
      if (trimToNull(record.agentContactName()) == null) {
        errors.add(required("application agent name"));
      }
    }
    return errors;
  }

  private void validateApplicationSpeciesEndUse(
      Long orgUnitNumber,
      String productTypeCode,
      String endUseCode,
      List<String> speciesCodes,
      boolean required,
      List<String> errors) {
    List<String> normalizedSpeciesCodes = normalizeCodes(speciesCodes);
    if (normalizedSpeciesCodes.isEmpty()) {
      if (required) {
        errors.add(required("application species/enduse sort"));
      }
      return;
    }
    if (orgUnitNumber == null || orgUnitNumber <= 0) {
      return;
    }

    String normalizedEndUseCode = firstNonBlank(endUseCode, EXPORT_SPECIES_ENDUSE_OTHER);
    String normalizedProductTypeCode = trimToNull(productTypeCode);
    boolean matchesCandidate = false;
    for (ApplicationDetailsRpcRepository.ExcolValidationRow row :
        repository.findCandidateExcolCodes(
            normalizedSpeciesCodes.size(),
            normalizedSpeciesCodes.get(0),
            normalizedEndUseCode,
            orgUnitNumber)) {
      String excolCode = trimToNull(row.excolCode());
      if (excolCode == null || !containsAllLegacy(excolCode, normalizedSpeciesCodes)) {
        continue;
      }
      if (!EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equals(normalizedProductTypeCode)
          && !excolCode.contains(normalizedEndUseCode)) {
        continue;
      }
      matchesCandidate = true;
      break;
    }

    if (!matchesCandidate) {
      errors.add("The application species/enduse sort is not valid for the selected region.");
    }
  }

  private boolean isEditableApplicationDetailStatus(String applicationStatusCode) {
    String normalizedStatus = trimToNull(applicationStatusCode);
    return APPLICATION_STATUS_NEW.equals(normalizedStatus)
        || APPLICATION_STATUS_APPROVED.equals(normalizedStatus);
  }

  private ApplicationSummarySnapshot toApplicationSummarySnapshot(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record) {
    return new ApplicationSummarySnapshot(
        record.applicationNumber(),
        record.federalApplicationNumber(),
        record.applicationDate(),
        record.termDays(),
        record.receivedDate(),
        record.applicationVolume(),
        record.averageLogVolume(),
        record.productLocation(),
        record.exportScheduleId(),
        record.agentClientNumber(),
        record.agentClientLocationCode(),
        record.ownerClientNumber(),
        record.ownerClientLocationCode(),
        record.exemptionNumber(),
        record.exemptionReasonCode(),
        record.applicationStatusCode(),
        record.applicantTypeCode(),
        record.orgUnitNumber(),
        record.productTypeCode(),
        record.jurisdictionCode(),
        record.growthTypeCode(),
        record.agentContactName(),
        record.ownerContactName(),
        record.oicIndicator());
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

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord toApplicationUpdateRecord(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      ApplicationSummaryUpdateRequest request,
      String updateUserId) {
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        existing.applicationNumber(),
        existing.federalApplicationNumber(),
        request.applicationDate() == null ? existing.applicationDate() : request.applicationDate(),
        request.termDays() == null ? existing.termDays() : request.termDays(),
        request.receivedDate() == null ? existing.receivedDate() : request.receivedDate(),
        request.applicationVolume() == null ? existing.applicationVolume() : request.applicationVolume(),
        request.averageLogVolume() == null ? existing.averageLogVolume() : request.averageLogVolume(),
        request.productLocation() == null ? existing.productLocation() : request.productLocation(),
        existing.entryUserId(),
        existing.entryTimestamp(),
        updateUserId,
        Instant.now(),
        request.exportScheduleId() == null ? existing.exportScheduleId() : request.exportScheduleId(),
        request.agentClientNumber() == null ? existing.agentClientNumber() : request.agentClientNumber(),
        request.agentClientLocationCode() == null
            ? existing.agentClientLocationCode()
            : request.agentClientLocationCode(),
        request.ownerClientNumber() == null ? existing.ownerClientNumber() : request.ownerClientNumber(),
        request.ownerClientLocationCode() == null
            ? existing.ownerClientLocationCode()
            : request.ownerClientLocationCode(),
        existing.exemptionNumber(),
        request.exemptionReasonCode() == null
            ? existing.exemptionReasonCode()
            : request.exemptionReasonCode(),
        request.applicationStatusCode() == null
            ? existing.applicationStatusCode()
            : request.applicationStatusCode(),
        request.applicantTypeCode() == null ? existing.applicantTypeCode() : request.applicantTypeCode(),
        request.orgUnitNumber() == null ? existing.orgUnitNumber() : request.orgUnitNumber(),
        request.productTypeCode() == null ? existing.productTypeCode() : request.productTypeCode(),
        request.jurisdictionCode() == null ? existing.jurisdictionCode() : request.jurisdictionCode(),
        request.growthTypeCode() == null ? existing.growthTypeCode() : request.growthTypeCode(),
        request.agentContactName() == null ? existing.agentContactName() : request.agentContactName(),
        request.ownerContactName() == null ? existing.ownerContactName() : request.ownerContactName(),
        request.oicIndicator() == null ? existing.oicIndicator() : request.oicIndicator());
  }

  private String required(String fieldName) {
    return "A valid " + fieldName + " is required.";
  }

  private String maxLength(String fieldName, int maxLength) {
    String unit = maxLength == 1 ? "character" : "characters";
    return "The " + fieldName + " must be " + maxLength + " " + unit + " or fewer.";
  }

  private boolean requiresGrowthType(String productTypeCode) {
    String normalized = trimToNull(productTypeCode);
    return EXPORT_PRODUCT_TYPE_HARVESTED.equals(normalized)
        || EXPORT_PRODUCT_TYPE_STANDING.equals(normalized);
  }

  private String defaultMutationUser(String userId) {
    return defaultSystemUser(userId);
  }
}

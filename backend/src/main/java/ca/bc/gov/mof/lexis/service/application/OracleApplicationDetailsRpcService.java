package ca.bc.gov.mof.lexis.service.application;

import static ca.bc.gov.mof.lexis.util.TextUtils.defaultSystemUser;
import static ca.bc.gov.mof.lexis.util.TextUtils.firstNonBlank;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.parsePositiveLong;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.DuplicatePackageNumberException;
import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository;
import ca.bc.gov.mof.lexis.service.ScaleDomainValidator;
import ca.bc.gov.mof.lexis.service.ScaleDomainValidator.ScaleValues;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
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
  private static final String APPLICANT_TYPE_MINISTERIAL = "M";
  private static final String APPLICANT_TYPE_AGENT = "A";
  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String JURISDICTION_FEDERAL = "F";
  private static final String OIC_INDICATOR_NO = "N";
  private static final String OIC_INDICATOR_YES = "Y";
  private static final String SYSTEM_OIC_APPLICATION_MESSAGE =
      "Blanket OIC system applications can only be changed through Blanket OIC workflows.";
  private static final String EXPORT_PRODUCT_TYPE_HARVESTED = "H";
  private static final String EXPORT_PRODUCT_TYPE_STANDING = "S";
  private static final String EXPORT_PRODUCT_TYPE_UNMANUFACTURED = "T";
  private static final String SCALE_REQUIRES_HARVESTED_APPLICATION_MESSAGE =
      "Summary of Scale entries can only be added to Harvested applications.";
  private static final String PRODUCT_TYPE_CHANGE_WITH_SCALES_MESSAGE =
      "Product type cannot be changed to Unmanufactured Timber while Summary of Scale records exist. "
          + "Remove the Summary of Scale records first.";
  private static final String PRODUCT_TYPE_CHANGE_WITH_PACKAGES_MESSAGE =
      "Product type cannot be changed to Standing Timber while packages exist. Remove the packages first.";
  private static final String UNMANUFACTURED_TIMBER_MARK = "UNMANU";
  private static final Set<String> VALID_TIMBER_MARK_STATUSES =
      Set.of("HI", "HA", "HB", "HC", "HN", "HP", "LC", "HX", "ACT");
  private static final String SPECIES_TYPE_CEDAR = "CE";
  private static final String EXPORT_SPECIES_ENDUSE_OTHER = "OT";
  private static final String SAVE_SUCCESS_MESSAGE = "The application was saved successfully.";
  private static final Set<String> MUTATION_LOCKED_EXPORT_PERMIT_STATUSES =
      Set.of("COM", "PPD", "EXP", "CAN");
  private static final Set<Long> COASTAL_ORG_UNITS =
      Set.of(1832L, 1909L, 1910L, 15L, 23L, 27L, 43L, 48L, 1619L);
  private static final Set<Long> SKEENA_ORG_UNITS =
      Set.of(1621L, 24L, 40L, 1908L, 28L, 1823L, 1824L, 32L, 16L, 20L, 36L);
  private static final String PACKAGE_EXISTS_MESSAGE_TEMPLATE = "Package %s already exists.";
  private static final String PACKAGE_PERMITTED_SCALE_MESSAGE =
      "Package changes are not allowed after a scale has been permitted.";
  private static final String SCALE_PERMITTED_MESSAGE =
      "Scale changes are not allowed after a permit has been completed.";
  private static final int REMARK_DISPLAY_LIMIT = 70;
  private static final int PRODUCT_LOCATION_MAX_BYTES = 250;
  private static final String ORACLE_IGNORED_PRODUCT_LOCATION = " ";
  private static final int CONTACT_NAME_MAX_BYTES = 120;
  private static final int REMARK_MAX_BYTES = 254;
  private static final int PACKAGE_NUMBER_MAX_BYTES = 20;
  private static final int PACKAGE_COMMENTS_MAX_BYTES = 180;
  private static final long MAX_APPLICATION_TERM_DAYS = 99_999L;
  private static final double MAX_APPLICATION_VOLUME = 9_999_999.99d;
  private static final double MAX_AVERAGE_LOG_VOLUME = 99.9d;

  private final ApplicationDetailsRpcRepository repository;
  private final ClientLookupRepository clientRepository;
  private final ExemptionService exemptionService;

  public OracleApplicationDetailsRpcService(
      ApplicationDetailsRpcRepository repository,
      ClientLookupRepository clientRepository,
      ExemptionService exemptionService) {
    this.repository = repository;
    this.clientRepository = clientRepository;
    this.exemptionService = exemptionService;
  }

  @Override
  public List<DocumentItem> getDocumentDetails(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    Map<String, String> attachmentTypeByCode = new LinkedHashMap<>();
    List<DocumentItem> documents = new ArrayList<>();
    repository.findApplicationDocumentDetailsByApplicationNumber(applicationNumber).stream()
        .map(
            row ->
                toDocumentItem(
                    row,
                    "application",
                    applicationNumber,
                    null,
                    true,
                    attachmentTypeByCode))
        .forEach(documents::add);

    for (Long permitNumber : repository.findPermitNumbersByApplicationNumber(applicationNumber)) {
      repository.findPermitDocumentDetailsByPermitNumber(permitNumber).stream()
          .map(
              row ->
                  toDocumentItem(
                      row,
                      "permit",
                      null,
                      permitNumber,
                      false,
                      attachmentTypeByCode))
          .forEach(documents::add);
    }

    return List.copyOf(documents);
  }

  private DocumentItem toDocumentItem(
      ApplicationDetailsRpcRepository.DocumentRow row,
      String source,
      Long sourceApplicationNumber,
      Long sourcePermitNumber,
      boolean deletable,
      Map<String, String> attachmentTypeByCode) {
    return new DocumentItem(
        row.id(),
        row.fileName(),
        normalizeDescription(row.description()),
        resolveAttachmentTypeDescription(row.attachmentTypeCode(), attachmentTypeByCode),
        source,
        sourceApplicationNumber,
        sourcePermitNumber,
        deletable);
  }

  @Override
  public Optional<DocumentStreamer> streamDocument(Long fileId) {
    if (fileId == null || fileId < 1) {
      return Optional.empty();
    }
    return Optional.of(
        outputStream -> {
          if (!repository.streamFileAttachment(fileId, outputStream)) {
            throw new java.io.FileNotFoundException("Application attachment was not found.");
          }
        });
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
  public Optional<Long> findApplicationNumberForRemark(Long remarkId) {
    if (remarkId == null || remarkId < 1) {
      return Optional.empty();
    }
    return repository
        .findRemarkByNumber(remarkId)
        .map(ApplicationDetailsRpcRepository.RemarkRow::applicationNumber)
        .filter(value -> value != null && value > 0);
  }

  @Override
  public Optional<Long> findApplicationNumberForPackage(String packageNumber) {
    return repository
        .findPackageMutationByPackageNumber(packageNumber)
        .map(ApplicationDetailsRpcRepository.PackageMutationRow::applicationNumber)
        .filter(value -> value != null && value > 0);
  }

  @Override
  public Optional<Long> findApplicationNumberForScale(String scaleDetailId) {
    return repository
        .findScaleDetailById(scaleDetailId)
        .map(ApplicationDetailsRpcRepository.ApplicationScaleDetailRow::applicationNumber)
        .filter(value -> value != null && value > 0);
  }

  @Override
  @Transactional
  public Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    String normalizedRemarkId = trimToNull(remarkId);
    String normalizedUserId = defaultMutationUser(userId);
    String remark = remarkBody == null ? "" : remarkBody;
    if (!isStorableOracleText(remark, REMARK_MAX_BYTES)) {
      return Optional.empty();
    }

    if (normalizedRemarkId == null || "new".equalsIgnoreCase(normalizedRemarkId)) {
      Optional<ApplicationDetailsRpcRepository.RemarkRow> inserted =
          repository.insertRemark(applicationNumber, remark, normalizedUserId, Instant.now());
      if (inserted
          .filter(
              row ->
                  matchesInsertedRemark(
                      row, applicationNumber, remark, normalizedUserId))
          .isEmpty()) {
        markRollbackOnly();
        return Optional.empty();
      }
      return inserted.map(this::toPersistedRemark);
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
    Optional<PersistedRemark> persisted =
        repository.findRemarkByNumberRequired(parsedRemarkId).map(this::toPersistedRemark);
    if (persisted.isEmpty()) {
      markRollbackOnly();
    }
    return persisted;
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
  @Transactional(readOnly = true)
  public SubmissionImportValidationResult validateApplicationSubmissionImport(
      CreateApplicationRequest applicationRequest,
      PackageMutationRequest packageRequest,
      List<ScaleMutationRequest> scaleRequests) {
    CreateApplicationRequest application = normalizeCreateApplicationRequest(applicationRequest);
    PackageMutationRequest packageMutation =
        packageRequest == null ? null : normalizePackageMutationRequest(packageRequest);
    List<ScaleMutationRequest> scales =
        scaleRequests == null
            ? List.of()
            : scaleRequests.stream().map(this::normalizeScaleMutationRequest).toList();

    List<String> errors = new ArrayList<>(validateCreateApplication(application));
    validateApplicationStorageText(application, errors);
    validateFederalImportMetadata(application, errors);
    if (packageMutation == null) {
      boolean legacyFederalStandingWithoutPackage =
          JURISDICTION_FEDERAL.equals(trimToNull(application.jurisdictionCode()))
              && EXPORT_PRODUCT_TYPE_STANDING.equals(trimToNull(application.productTypeCode()));
      if (!legacyFederalStandingWithoutPackage || !scales.isEmpty()) {
        errors.add(required("package number"));
      }
    } else {
      errors.addAll(validatePackageImportPreflight(packageMutation, application));
      errors.addAll(validateScaleImportPreflight(scales, packageMutation, application));
    }
    return new SubmissionImportValidationResult(errors.isEmpty(), errors, List.of());
  }

  @Override
  @Transactional
  public CreateApplicationResult addApplication(CreateApplicationRequest request, String userId) {
    return persistApplication(normalizePublicProvincialCreateRequest(request), userId, true);
  }

  @Override
  @Transactional
  public CreateApplicationResult addFederalImportedApplication(
      CreateApplicationRequest request, String userId) {
    CreateApplicationRequest normalized = normalizeCreateApplicationRequest(request);
    List<String> ingressErrors = new ArrayList<>();
    if (!JURISDICTION_FEDERAL.equals(normalized.jurisdictionCode())) {
      ingressErrors.add("Federal application imports must use jurisdiction F.");
    }
    if (normalized.federalApplicationNumber() == null
        || normalized.federalApplicationNumber() < 0) {
      ingressErrors.add("A non-negative federal application number is required for federal imports.");
    }
    if (!APPLICATION_STATUS_APPROVED.equals(normalized.applicationStatusCode())) {
      ingressErrors.add("Federal application imports must enter LEXIS in approved status.");
    }
    if (!ingressErrors.isEmpty()) {
      return new CreateApplicationResult(false, null, null, ingressErrors, List.of());
    }
    return persistApplication(normalized, userId, true);
  }

  @Override
  @Transactional
  public CreateApplicationResult addHiddenBlanketOicApplication(
      CreateApplicationRequest request, String userId) {
    return persistApplication(request, userId, false);
  }

  private CreateApplicationResult persistApplication(
      CreateApplicationRequest request, String userId, boolean validate) {
    CreateApplicationRequest normalized = normalizeCreateApplicationRequest(request);
    List<String> errors = new ArrayList<>();
    validateApplicationStorageText(normalized, errors);
    if (validate) {
      errors.addAll(validateCreateApplication(normalized));
    }
    List<String> warnings = List.of();

    if (!errors.isEmpty()) {
      return new CreateApplicationResult(false, null, null, errors, warnings);
    }

    String entryUserId = defaultMutationUser(userId);
    Optional<ApplicationDetailsRpcRepository.ApplicationInsertRow> inserted =
        repository.insertApplication(toInsertRecord(normalized, entryUserId));

    Long applicationNumber =
        inserted.map(ApplicationDetailsRpcRepository.ApplicationInsertRow::applicationNumber).orElse(null);
    if (applicationNumber == null || applicationNumber < 1) {
      markRollbackOnly();
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please note the time this error occurred and report to someone.",
          null,
          List.of(),
          warnings);
    }

    if (normalized.speciesCodes() != null
        && !repository.replaceApplicationEndUses(
            applicationNumber,
            toApplicationEndUses(
                normalized.speciesCodes(), normalized.endUseCode(), normalized.productTypeCode()))) {
      markRollbackOnly();
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please note the time this error occurred and report to someone.",
          null,
          List.of(),
          warnings);
    }

    String remarkBody = trimToNull(normalized.remarkBody());
    if (remarkBody != null) {
      Optional<ApplicationDetailsRpcRepository.RemarkRow> insertedRemark =
          repository.insertRemark(applicationNumber, remarkBody, entryUserId, Instant.now());
      if (insertedRemark
          .filter(
              row ->
                  matchesInsertedRemark(
                      row, applicationNumber, remarkBody, entryUserId))
          .isEmpty()) {
        markRollbackOnly();
        return new CreateApplicationResult(
            false,
            "We were unable to save this application. Please note the time this error occurred and report to someone.",
            null,
            List.of(),
            warnings);
      }
    }

    return new CreateApplicationResult(
        true, SAVE_SUCCESS_MESSAGE, applicationNumber, List.of(), warnings);
  }

  @Override
  @Transactional
  public CreateApplicationResult updateApplicationSummary(
      ApplicationSummaryUpdateRequest request, String userId) {
    ApplicationSummaryUpdateRequest normalized = normalizeApplicationSummaryUpdateRequest(request);
    ApplicationSummaryUpdateRequest scoped = restrictToSaveSource(normalized);
    if (scoped.applicationNumber() == null || scoped.applicationNumber() < 1) {
      return new CreateApplicationResult(
          false, null, null, List.of(required("application number")), List.of());
    }

    Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> existing =
        repository.findApplicationUpdateRecord(scoped.applicationNumber());
    if (existing.isEmpty()) {
      return new CreateApplicationResult(
          false,
          "No application was found for " + scoped.applicationNumber() + ".",
          scoped.applicationNumber(),
          List.of(),
          List.of());
    }
    if (isSystemOwnedOicApplication(existing.get())) {
      return new CreateApplicationResult(
          false,
          null,
          scoped.applicationNumber(),
          List.of(SYSTEM_OIC_APPLICATION_MESSAGE),
          List.of());
    }
    if (!isEditableApplicationDetailStatus(existing.get().applicationStatusCode())) {
      return new CreateApplicationResult(
          false,
          null,
          scoped.applicationNumber(),
          List.of(APPLICATION_DETAILS_LOCKED_MESSAGE),
          List.of());
    }

    ApplicationDetailsRpcRepository.ApplicationUpdateRecord updateRecord =
        toApplicationUpdateRecord(existing.get(), scoped, defaultMutationUser(userId));
    List<String> errors = validateApplicationUpdate(existing.get(), updateRecord, scoped);
    if (!errors.isEmpty()) {
      return new CreateApplicationResult(
          false, null, scoped.applicationNumber(), errors, List.of());
    }

    if (!repository.updateApplication(updateRecord)) {
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please try again.",
          scoped.applicationNumber(),
          List.of(),
          List.of());
    }

    if (scoped.speciesCodes() != null
        && !repository.replaceApplicationEndUses(
            scoped.applicationNumber(),
            toApplicationEndUses(
                scoped.speciesCodes(), scoped.endUseCode(), updateRecord.productTypeCode()))) {
      markRollbackOnly();
      return new CreateApplicationResult(
          false,
          "We were unable to save this application. Please try again.",
          scoped.applicationNumber(),
          List.of(),
          List.of());
    }

    return new CreateApplicationResult(
        true, SAVE_SUCCESS_MESSAGE, scoped.applicationNumber(), List.of(), List.of());
  }

  @Override
  @Transactional
  public boolean synchronizeApplicationOwner(
      Long applicationNumber,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String userId) {
    String normalizedOwnerClientNumber = trimToNull(ownerClientNumber);
    String normalizedOwnerClientLocationCode = trimToNull(ownerClientLocationCode);
    if (applicationNumber == null
        || applicationNumber < 1
        || normalizedOwnerClientNumber == null
        || normalizedOwnerClientLocationCode == null) {
      return false;
    }

    ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing =
        repository.findApplicationUpdateRecord(applicationNumber).orElse(null);
    if (existing == null) {
      return false;
    }

    ApplicationDetailsRpcRepository.ApplicationUpdateRecord synchronizedRecord =
        copyApplicationWithOwner(
            existing,
            normalizedOwnerClientNumber,
            normalizedOwnerClientLocationCode,
            defaultMutationUser(userId));
    if (!repository.updateApplication(synchronizedRecord)) {
      markRollbackOnly();
      return false;
    }

    Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> persisted =
        repository.findApplicationUpdateRecord(applicationNumber);
    if (persisted.isEmpty()
        || !normalizedOwnerClientNumber.equals(trimToNull(persisted.get().ownerClientNumber()))
        || !normalizedOwnerClientLocationCode.equals(
            trimToNull(persisted.get().ownerClientLocationCode()))) {
      markRollbackOnly();
      return false;
    }
    return true;
  }

  @Override
  public Optional<ApplicationSummarySnapshot> getApplicationSummarySnapshot(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findApplicationUpdateRecord(applicationNumber).map(this::toApplicationSummarySnapshot);
  }

  @Override
  public Optional<ApplicationEditContext> getApplicationEditContext(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    ApplicationDetailsRpcRepository.ApplicationEditContextRow application =
        repository.findApplicationEditContext(applicationNumber).orElse(null);
    if (application == null) {
      return Optional.empty();
    }

    List<ApplicationDetailsRpcRepository.PackageMutationRow> packages =
        repository.findPackageMutationsByApplicationNumber(applicationNumber);
    List<ApplicationDetailsRpcRepository.ScaleMutationRow> scales =
        repository.findScaleMutationsByApplicationNumber(applicationNumber);
    Instant approvalDate = application.approvalDate();

    boolean hasPackageBeforeApproval =
        packages.stream()
            .anyMatch(
                item ->
                    approvalDate == null
                        || item.entryTimestamp() == null
                        || item.entryTimestamp().isBefore(approvalDate));
    boolean hasScaleBeforeApproval =
        scales.stream()
            .anyMatch(
                item ->
                    approvalDate == null
                        || item.entryTimestamp() == null
                        || item.entryTimestamp().isBefore(approvalDate));
    Set<Long> referencedPermitNumbers = new LinkedHashSet<>();
    scales.stream()
        .map(ApplicationDetailsRpcRepository.ScaleMutationRow::exportPermitDetailNumber)
        .filter(value -> value != null)
        .forEach(referencedPermitNumbers::add);
    boolean hasCompletePermit =
        referencedPermitNumbers.stream().anyMatch(this::isMutationLockedOrUnknownPermit);

    return Optional.of(
        new ApplicationEditContext(
            application.applicationNumber(),
            trimToNull(application.applicationStatusCode()),
            trimToNull(application.jurisdictionCode()),
            trimToNull(application.productTypeCode()),
            application.exportScheduleId(),
            application.advertisingDate(),
            hasPackageBeforeApproval,
            hasScaleBeforeApproval,
            hasCompletePermit,
            trimToNull(application.oicIndicator()),
            isInteriorMinisterialItemOverrideEligible(application, scales)));
  }

  private boolean isInteriorMinisterialItemOverrideEligible(
      ApplicationDetailsRpcRepository.ApplicationEditContextRow application,
      List<ApplicationDetailsRpcRepository.ScaleMutationRow> scales) {
    String exemptionNumber = trimToNull(application.exemptionNumber());
    Long orgUnitNumber = application.orgUnitNumber();
    if (exemptionNumber == null || orgUnitNumber == null) {
      return false;
    }

    return exemptionService
        .findByExemptionNumber(exemptionNumber)
        .filter(exemption -> exemptionNumber.equals(trimToNull(exemption.exemptionNumber())))
        .filter(exemption -> "M".equalsIgnoreCase(trimToNull(exemption.exemptionTypeCode())))
        .filter(
            exemption ->
                Double.isFinite(exemption.remainingVolume())
                    && exemption.remainingVolume() > 0.0d)
        .filter(exemption -> isInteriorAdministration(orgUnitNumber, scales))
        .isPresent();
  }

  private boolean isInteriorAdministration(
      Long orgUnitNumber, List<ApplicationDetailsRpcRepository.ScaleMutationRow> scales) {
    if (COASTAL_ORG_UNITS.contains(orgUnitNumber)) {
      return false;
    }
    if (!SKEENA_ORG_UNITS.contains(orgUnitNumber)) {
      return true;
    }
    if (scales == null) {
      return false;
    }
    for (ApplicationDetailsRpcRepository.ScaleMutationRow scale : scales) {
      String grade = scale == null ? null : normalizeCode(scale.gradeCode());
      if (grade == null) {
        continue;
      }
      if (grade.chars().anyMatch(value -> value >= 'A' && value <= 'Y')) {
        return false;
      }
      if (grade.chars().anyMatch(Character::isDigit)) {
        return true;
      }
    }
    return false;
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
    return repository.findAllSpeciesCodesRequired().stream().map(this::toCodeItem).toList();
  }

  @Override
  public List<CodeItem> getPackageStatusCodes() {
    return repository.findAllPackageStatusCodesRequired().stream().map(this::toCodeItem).toList();
  }

  @Override
  public List<CodeItem> getGradeCodes(String orgUnitNumber, String speciesCode) {
    TreeSet<String> gradeCodes = new TreeSet<>();
    for (ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow row :
        repository.findSpeciesEndUsesByRegionSpeciesRequired(orgUnitNumber, speciesCode)) {
      String gradeCode = trimToNull(row.gradeCode());
      if (gradeCode != null) {
        gradeCodes.add(gradeCode);
      }
    }

    List<CodeItem> response = new ArrayList<>();
    for (String gradeCode : gradeCodes) {
      response.add(
          repository
              .findGradeCodeRequired(gradeCode)
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
        repository.findCandidateEndUseCodesRequired(
            normalizedSpeciesCodes.size(), normalizedSpeciesCodes.get(0), parsedOrgUnitNumber)) {
      String endUseCode = trimToNull(row.excolCode());
      if (endUseCode != null) {
        endUseCodes.add(endUseCode);
      }
    }

    List<CodeItem> response = new ArrayList<>();
    for (String endUseCode : endUseCodes) {
      repository.findEndUseCodeRequired(endUseCode).map(this::toCodeItem).ifPresent(response::add);
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
          repository.findSpeciesEndUsesByRegionRequired(orgUnitNumber)) {
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
          repository.findCandidateExcolCombinationsRequired(
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
    return repository.findEndUsesByApplicationNumberRequired(applicationNumber).stream()
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
    return repository.findEndUsesByPackageNumberRequired(normalizedPackageNumber).stream()
        .map(ApplicationDetailsRpcRepository.EndUseRow::endUseCode)
        .map(TextUtils::trimToNull)
        .filter(value -> value != null)
        .findFirst();
  }

  @Override
  public String getApplicationSpeciesEndUseSort(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return "";
    }

    ApplicationDetailsRpcRepository.ApplicationUpdateRecord application =
        repository.findApplicationUpdateRecord(applicationNumber).orElse(null);
    if (application == null
        || application.orgUnitNumber() == null
        || application.orgUnitNumber() < 1) {
      return "";
    }

    List<ApplicationDetailsRpcRepository.EndUseRow> endUses =
        repository.findEndUsesByApplicationNumberRequired(applicationNumber);
    if (endUses.isEmpty()) {
      return "";
    }

    ApplicationDetailsRpcRepository.EndUseRow firstEndUse = endUses.get(0);
    String firstSpeciesCode = trimToNull(firstEndUse.speciesCode());
    String firstEndUseCode = trimToNull(firstEndUse.endUseCode());
    if (firstSpeciesCode == null || firstEndUseCode == null) {
      return "";
    }

    List<ApplicationDetailsRpcRepository.ExcolValidationRow> candidates =
        repository.findCandidateExcolCodesRequired(
            endUses.size(), firstSpeciesCode, firstEndUseCode, application.orgUnitNumber());
    if (candidates.size() == 1) {
      String candidate = trimToNull(candidates.get(0).excolCode());
      return candidate == null ? "" : candidate;
    }

    for (ApplicationDetailsRpcRepository.ExcolValidationRow candidateRow : candidates) {
      String candidate = trimToNull(candidateRow.excolCode());
      if (matchesLegacyApplicationEndUseSort(
          candidate, endUses, firstEndUseCode, application.productTypeCode())) {
        return candidate;
      }
    }
    return "";
  }

  @Override
  public List<SpeciesEndUseItem> getSpeciesForApplication(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return toSpeciesEndUseItems(
        repository.findEndUsesByApplicationNumberRequired(applicationNumber));
  }

  @Override
  public List<SpeciesEndUseItem> getSpeciesForPackage(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return List.of();
    }
    return toSpeciesEndUseItems(
        repository.findEndUsesByPackageNumberRequired(normalizedPackageNumber));
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
  public List<Long> getPermitNumbersForApplicationMutation(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      throw new IllegalArgumentException("Application number must be positive.");
    }

    Set<Long> permitNumbers = new TreeSet<>();
    List<ApplicationDetailsRpcRepository.ApplicationPermitRow> ordinaryPermits =
        repository.findPermitsByApplicationNumberRequired(applicationNumber);
    List<ApplicationDetailsRpcRepository.ApplicationPermitRow> oicPermits =
        repository.findPermitsByOicApplicationNumberRequired(applicationNumber);
    if (ordinaryPermits == null || oicPermits == null) {
      throw new DataRetrievalFailureException(
          "Permit relationships could not be loaded for application " + applicationNumber + ".");
    }
    ordinaryPermits.forEach(row -> addPermitNumberForMutation(row, permitNumbers));
    oicPermits.forEach(row -> addPermitNumberForMutation(row, permitNumbers));
    return List.copyOf(permitNumbers);
  }

  private void addPermitNumberForMutation(
      ApplicationDetailsRpcRepository.ApplicationPermitRow row, Set<Long> permitNumbers) {
    Long permitNumber = row == null ? null : row.permitNumber();
    if (permitNumber == null || permitNumber < 1) {
      throw new DataRetrievalFailureException(
          "An application permit relationship returned an invalid permit number.");
    }
    permitNumbers.add(permitNumber);
  }

  @Override
  public List<ApplicationPackageScaleItem> getScalesForPackage(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return List.of();
    }

    Map<String, String> speciesDescriptionByCode = new LinkedHashMap<>();
    Map<String, String> gradeDescriptionByCode = new LinkedHashMap<>();
    Map<Long, Boolean> mutationLockedByPermitNumber = new LinkedHashMap<>();
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
                    isMutationLockedPermit(
                        row.exportPermitDetailNumber(), mutationLockedByPermitNumber),
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
        repository.findPackageDetailsByPackageNumberRequired(normalizedPackageNumber).orElse(null);
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
  @Transactional
  public PackagePersistenceResult addPackage(PackageMutationRequest request, String userId) {
    return addPackage(request, userId, false);
  }

  @Override
  @Transactional
  public PackagePersistenceResult addHiddenBlanketOicPackage(
      PackageMutationRequest request, String userId) {
    return addPackage(request, userId, true);
  }

  private PackagePersistenceResult addPackage(
      PackageMutationRequest request, String userId, boolean hiddenBlanketOicWorkflow) {
    PackageMutationRequest normalized = normalizePackageMutationRequest(request);
    List<String> errors =
        validatePackageMutation(normalized, false, null, hiddenBlanketOicWorkflow, null);
    if (!errors.isEmpty()) {
      return invalidPackageResult(normalized.packageNumber(), errors);
    }

    ApplicationDetailsRpcRepository.PackageMutationRecord record =
        toPackageMutationRecord(normalized, null, normalized.packageNumber(), defaultMutationUser(userId), true);
    Optional<ApplicationDetailsRpcRepository.PackageMutationRow> inserted;
    try {
      inserted = repository.insertPackage(record);
    } catch (DuplicatePackageNumberException exception) {
      markRollbackOnly();
      return duplicatePackageResult(normalized.packageNumber());
    }
    if (inserted.filter(row -> matchesInsertedPackage(row, record)).isEmpty()) {
      markRollbackOnly();
      return invalidPackageResult(
          normalized.packageNumber(),
          List.of("We were unable to save this package. Please try again."));
    }

    return packageSuccess(record.packageNumber(), record);
  }

  @Override
  @Transactional
  public PackagePersistenceResult updatePackage(PackageMutationRequest request, String userId) {
    return updatePackage(request, userId, false);
  }

  @Override
  @Transactional
  public PackagePersistenceResult updateHiddenBlanketOicPackage(
      PackageMutationRequest request, String userId) {
    return updatePackage(request, userId, true);
  }

  private PackagePersistenceResult updatePackage(
      PackageMutationRequest request, String userId, boolean hiddenBlanketOicWorkflow) {
    PackageMutationRequest normalized = normalizePackageMutationRequest(request);
    String currentPackageNumber = trimToNull(normalized.packageNumber());
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        repository.findPackageMutationByPackageNumber(currentPackageNumber).orElse(null);
    List<String> errors =
        validatePackageMutation(normalized, true, existing, hiddenBlanketOicWorkflow, null);
    if (existing == null) {
      errors.add("Package number " + nonNull(currentPackageNumber) + " does not exist.");
    }
    if (!errors.isEmpty()) {
      return invalidPackageResult(firstNonBlank(normalized.newPackageNumber(), currentPackageNumber), errors);
    }

    String targetPackageNumber = firstNonBlank(normalized.newPackageNumber(), currentPackageNumber);
    if (!targetPackageNumber.equals(currentPackageNumber)
        && repository.hasPurchaseOffersForPackageRequired(
            existing.applicationNumber(), currentPackageNumber)) {
      return invalidPackageResult(
          targetPackageNumber,
          List.of("Package cannot be renamed while purchase offers are linked."));
    }
    ApplicationDetailsRpcRepository.PackageMutationRecord record =
        toPackageMutationRecord(normalized, existing, targetPackageNumber, defaultMutationUser(userId), false);

    boolean saved;
    if (!targetPackageNumber.equals(currentPackageNumber)) {
      try {
        saved = renamePackage(currentPackageNumber, record, defaultMutationUser(userId));
      } catch (DuplicatePackageNumberException exception) {
        markRollbackOnly();
        return duplicatePackageResult(targetPackageNumber);
      }
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
  @Transactional
  public boolean synchronizePackageForPermitTransition(
      String packageNumber,
      Double volume,
      String growthTypeCode,
      String productTypeCode,
      String userId) {
    return synchronizePackageForPermitTransition(
        packageNumber, volume, growthTypeCode, productTypeCode, userId, true);
  }

  @Override
  @Transactional
  public boolean synchronizePackageVolumeForPermitTransition(
      String packageNumber, Double volume, String userId) {
    return synchronizePackageForPermitTransition(
        packageNumber, volume, null, null, userId, false);
  }

  private boolean synchronizePackageForPermitTransition(
      String packageNumber,
      Double volume,
      String growthTypeCode,
      String productTypeCode,
      String userId,
      boolean fillMissingClassification) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null
        || (volume != null && (!Double.isFinite(volume) || volume < 0.0d))) {
      return false;
    }

    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        repository.findPackageMutationByPackageNumber(normalizedPackageNumber).orElse(null);
    if (existing == null) {
      return false;
    }

    Double synchronizedVolume = volume == null ? existing.packageVolume() : volume;
    String synchronizedGrowthTypeCode = trimToNull(existing.growthTypeCode());
    String synchronizedProductTypeCode = trimToNull(existing.productTypeCode());
    if (fillMissingClassification) {
      synchronizedGrowthTypeCode =
          firstNonBlank(synchronizedGrowthTypeCode, trimToNull(growthTypeCode));
      synchronizedProductTypeCode =
          firstNonBlank(synchronizedProductTypeCode, trimToNull(productTypeCode));
      if (synchronizedProductTypeCode == null
          || (requiresGrowthType(synchronizedProductTypeCode)
              && synchronizedGrowthTypeCode == null)) {
        return false;
      }
    }

    ApplicationDetailsRpcRepository.PackageMutationRecord synchronizedRecord =
        new ApplicationDetailsRpcRepository.PackageMutationRecord(
            existing.packageNumber(),
            existing.applicationNumber(),
            existing.reprocessedIndicator(),
            synchronizedVolume,
            existing.averageLength(),
            existing.averageDiameter(),
            existing.comments(),
            existing.packageFee(),
            existing.federalPermitNumber(),
            existing.reservePermitNumber(),
            existing.packageStatusCode(),
            synchronizedGrowthTypeCode,
            synchronizedProductTypeCode,
            existing.entryUserId(),
            existing.entryTimestamp(),
            defaultMutationUser(userId),
            List.of());
    if (!repository.updatePackagePreservingEndUses(synchronizedRecord)) {
      markRollbackOnly();
      return false;
    }

    Optional<ApplicationDetailsRpcRepository.PackageMutationRow> persisted =
        repository.findPackageMutationByPackageNumber(normalizedPackageNumber);
    if (persisted.isEmpty()
        || !sameNullableDecimal(synchronizedVolume, persisted.get().packageVolume())
        || !java.util.Objects.equals(
            synchronizedGrowthTypeCode, trimToNull(persisted.get().growthTypeCode()))
        || !java.util.Objects.equals(
            synchronizedProductTypeCode, trimToNull(persisted.get().productTypeCode()))) {
      markRollbackOnly();
      return false;
    }
    return true;
  }

  private boolean sameNullableDecimal(Double expected, Double actual) {
    if (expected == null || actual == null) {
      return expected == null && actual == null;
    }
    return BigDecimal.valueOf(expected).compareTo(BigDecimal.valueOf(actual)) == 0;
  }

  @Override
  @Transactional
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
    if (inserted.filter(row -> matchesInsertedScale(row, record)).isEmpty()) {
      markRollbackOnly();
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
  @Transactional
  public boolean deleteScaleById(String scaleDetailId, String userId) {
    String normalizedScaleDetailId = trimToNull(scaleDetailId);
    if (normalizedScaleDetailId == null) {
      return false;
    }
    ApplicationDetailsRpcRepository.ApplicationScaleDetailRow scale =
        repository.findScaleDetailById(normalizedScaleDetailId).orElse(null);
    if (scale == null
        || trimToNull(scale.exportPermitDetailNumber()) != null
        || !isGenericApplicationMutationAllowed(scale.applicationNumber())) {
      return false;
    }
    return repository.deleteScaleById(normalizedScaleDetailId, defaultMutationUser(userId));
  }

  @Override
  @Transactional
  public boolean deletePackageById(String packageNumber, String userId) {
    return deletePackageById(packageNumber, null, userId, false);
  }

  @Override
  @Transactional
  public boolean deleteHiddenBlanketOicPackageById(
      String packageNumber, Long applicationNumber, String userId) {
    return deletePackageById(packageNumber, applicationNumber, userId, true);
  }

  private boolean deletePackageById(
      String packageNumber,
      Long expectedApplicationNumber,
      String userId,
      boolean hiddenBlanketOicWorkflow) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return false;
    }
    List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows =
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber);
    if (!scaleRows.isEmpty()) {
      return false;
    }
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        repository.findPackageMutationByPackageNumber(normalizedPackageNumber).orElse(null);
    if (existing == null
        || (expectedApplicationNumber != null
            && !expectedApplicationNumber.equals(existing.applicationNumber()))
        || !isPackageApplicationMutationAllowed(
            existing.applicationNumber(), hiddenBlanketOicWorkflow)
        || repository.hasPurchaseOffersForPackageRequired(
            existing.applicationNumber(), normalizedPackageNumber)) {
      return false;
    }
    return repository.deletePackageById(normalizedPackageNumber, defaultMutationUser(userId));
  }

  private PackageMutationRequest normalizePackageMutationRequest(PackageMutationRequest request) {
    if (request == null) {
      return new PackageMutationRequest(
          null, null, null, null, null, null, null, null, null, null, null, null, null, null, List.of());
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
        request.federalPermitNumber(),
        request.reservePermitNumber(),
        trimToNull(request.reprocessed()),
        trimToNull(request.ageClass()),
        trimToNull(request.productType()),
        trimToNull(request.endUseCode()),
        normalizeCodes(request.speciesCodes()));
  }

  private List<String> validatePackageMutation(
      PackageMutationRequest request,
      boolean update,
      ApplicationDetailsRpcRepository.PackageMutationRow existing,
      boolean hiddenBlanketOicWorkflow,
      Long referenceOrgUnitNumber) {
    List<String> errors = new ArrayList<>();
    String packageNumber = trimToNull(request.packageNumber());
    String newPackageNumber = trimToNull(request.newPackageNumber());
    String targetPackageNumber = update ? firstNonBlank(newPackageNumber, packageNumber) : packageNumber;

    if (packageNumber == null) {
      errors.add(required("package number"));
    } else {
      validateOracleText(
          packageNumber, "Package number", PACKAGE_NUMBER_MAX_BYTES, errors);
    }

    if (newPackageNumber != null) {
      validateOracleText(
          newPackageNumber, "New package number", PACKAGE_NUMBER_MAX_BYTES, errors);
    }
    validateOracleText(
        request.comments(), "Package comments", PACKAGE_COMMENTS_MAX_BYTES, errors);

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

    validatePackageReferenceCodes(request, existing, referenceOrgUnitNumber, errors);

    if (update && packageNumber != null && request.volume() != null) {
      List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows =
          repository.findScaleDetailsByPackageNumber(packageNumber);
      if (hasMutationLockedScale(scaleRows)) {
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

    validatePackageApplicationVolume(
        request,
        update,
        existing,
        targetPackageNumber,
        hiddenBlanketOicWorkflow,
        errors);

    return errors;
  }

  private void validatePackageReferenceCodes(
      PackageMutationRequest request,
      ApplicationDetailsRpcRepository.PackageMutationRow existing,
      Long referenceOrgUnitNumber,
      List<String> errors) {
    String packageStatus =
        firstNonBlank(request.status(), existing == null ? null : existing.packageStatusCode());
    if (packageStatus != null && !repository.isPackageStatusCodeValidRequired(packageStatus)) {
      errors.add("Package status code does not exist.");
    }

    String productType =
        firstNonBlank(request.productType(), existing == null ? null : existing.productTypeCode());
    if (productType != null && !repository.isProductTypeCodeValidRequired(productType)) {
      errors.add("Package product type code does not exist.");
    }

    String growthType =
        firstNonBlank(request.ageClass(), existing == null ? null : existing.growthTypeCode());
    if (growthType != null && !repository.isGrowthTypeCodeValidRequired(growthType)) {
      errors.add("Package growth type code does not exist.");
    }

    List<String> speciesCodes = normalizeCodes(request.speciesCodes());
    if (speciesCodes.isEmpty()) {
      return;
    }

    boolean validSpecies = true;
    for (String speciesCode : speciesCodes) {
      if (repository.findSpeciesCodeRequired(speciesCode).isEmpty()) {
        errors.add("Package species code " + speciesCode + " does not exist.");
        validSpecies = false;
      }
    }

    String endUseCode = firstNonBlank(request.endUseCode(), EXPORT_SPECIES_ENDUSE_OTHER);
    boolean validEndUse = repository.findEndUseCodeRequired(endUseCode).isPresent();
    if (!validEndUse) {
      errors.add("Package end-use code does not exist.");
    }

    Long orgUnitNumber = referenceOrgUnitNumber;
    if (orgUnitNumber == null) {
      Long applicationNumber =
          request.applicationNumber() == null && existing != null
              ? existing.applicationNumber()
              : request.applicationNumber();
      if (applicationNumber != null && applicationNumber > 0) {
        orgUnitNumber =
            repository
                .findApplicationUpdateRecord(applicationNumber)
                .map(ApplicationDetailsRpcRepository.ApplicationUpdateRecord::orgUnitNumber)
                .orElse(null);
      }
    }
    if (!validSpecies || !validEndUse || orgUnitNumber == null || orgUnitNumber < 1) {
      return;
    }

    boolean matchesCandidate = false;
    for (ApplicationDetailsRpcRepository.ExcolValidationRow row :
        repository.findCandidateExcolCodesRequired(
            speciesCodes.size(), speciesCodes.get(0), endUseCode, orgUnitNumber)) {
      String excolCode = trimToNull(row.excolCode());
      if (excolCode == null || !containsAllLegacy(excolCode, speciesCodes)) {
        continue;
      }
      if (!EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equals(productType)
          && !excolCode.contains(endUseCode)) {
        continue;
      }
      matchesCandidate = true;
      break;
    }
    if (!matchesCandidate) {
      errors.add("The package species/enduse sort is not valid for the selected region.");
    }
  }

  private void validatePackageApplicationVolume(
      PackageMutationRequest request,
      boolean update,
      ApplicationDetailsRpcRepository.PackageMutationRow existing,
      String targetPackageNumber,
      boolean hiddenBlanketOicWorkflow,
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
    if (application.isEmpty()) {
      errors.add("Application " + applicationNumber + " could not be verified.");
      return;
    }
    boolean systemOwnedOicApplication = isSystemOwnedOicApplication(application.get());
    if (systemOwnedOicApplication != hiddenBlanketOicWorkflow) {
      errors.add(SYSTEM_OIC_APPLICATION_MESSAGE);
      return;
    }
    if (APPLICATION_STATUS_EXPIRED.equalsIgnoreCase(
        application.get().applicationStatusCode())) {
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

  private List<String> validatePackageImportPreflight(
      PackageMutationRequest packageRequest, CreateApplicationRequest applicationRequest) {
    List<String> errors =
        validatePackageMutation(
            packageRequest, false, null, false, applicationRequest.orgUnitNumber());
    if (packageRequest.volume() != null && applicationRequest.applicationVolume() != null) {
      BigDecimal requestedPackageVolume = roundOneDecimal(packageRequest.volume());
      BigDecimal applicationVolume = roundOneDecimal(applicationRequest.applicationVolume());
      if (requestedPackageVolume.compareTo(applicationVolume) > 0) {
        errors.add(
            "The total package volume must not exceed the application volume ("
                + applicationVolume.toPlainString()
                + ").");
      }
    }
    return errors;
  }

  private List<String> validateScaleImportPreflight(
      List<ScaleMutationRequest> scaleRequests,
      PackageMutationRequest packageRequest,
      CreateApplicationRequest applicationRequest) {
    List<String> errors = new ArrayList<>();
    List<ScaleValues> validatedScales = new ArrayList<>();
    BigDecimal scaleVolume = BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
    for (int index = 0; index < scaleRequests.size(); index++) {
      ScaleMutationRequest scaleRequest = scaleRequests.get(index);
      validateScaleImportPreflight(scaleRequest, applicationRequest, index == 0, errors);
      ScaleValues scaleValues = toScaleValues(scaleRequest);
      if (ScaleDomainValidator.containsCombination(validatedScales, scaleValues)) {
        errors.add("A scale with this timber mark, species, and grade already exists.");
      } else {
        validatedScales.add(scaleValues);
      }
      if (scaleRequest.volume() != null) {
        scaleVolume =
            scaleVolume.add(roundOneDecimal(scaleRequest.volume())).setScale(1, RoundingMode.HALF_UP);
      }
    }

    if (packageRequest.volume() != null && scaleVolume.compareTo(roundOneDecimal(packageRequest.volume())) > 0) {
      errors.add(
          "The scale volume total must not exceed the package volume ("
              + roundOneDecimal(packageRequest.volume()).toPlainString()
              + ").");
    }
    return errors;
  }

  private void validateScaleImportPreflight(
      ScaleMutationRequest request,
      CreateApplicationRequest applicationRequest,
      boolean validateTimberMarkRegion,
      List<String> errors) {
    if (trimToNull(request.packageNumber()) == null) {
      errors.add(required("scale package number"));
    }
    String timberMark = trimToNull(request.timberMark());
    if (timberMark == null) {
      errors.add(required("timber mark"));
    } else {
      validateTimberMarkForContext(
          timberMark,
          applicationRequest.orgUnitNumber(),
          applicationRequest.productTypeCode(),
          applicationRequest.jurisdictionCode(),
          validateTimberMarkRegion,
          errors);
    }
    if (trimToNull(request.gradeCode()) == null) {
      errors.add(required("grade code"));
    }
    if (trimToNull(request.speciesCode()) == null) {
      errors.add(required("species code"));
    }
    validateScaleCodes(request, errors);
    if (JURISDICTION_FEDERAL.equals(trimToNull(applicationRequest.jurisdictionCode()))) {
      validateScaleCodesForRegion(request, applicationRequest.orgUnitNumber(), errors);
    }
    errors.addAll(
        ScaleDomainValidator.validateNumericValues(request.pieces(), request.volume(), false));
  }

  private void validateScaleCodesForRegion(
      ScaleMutationRequest request, Long orgUnitNumber, List<String> errors) {
    String speciesCode = trimToNull(request.speciesCode());
    String gradeCode = trimToNull(request.gradeCode());
    if (orgUnitNumber == null || orgUnitNumber <= 0 || speciesCode == null) {
      return;
    }

    String region = orgUnitNumber.toString();
    boolean speciesValid =
        repository.findSpeciesEndUsesByRegionRequired(region).stream()
            .map(ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow::speciesCode)
            .map(TextUtils::trimToNull)
            .anyMatch(speciesCode::equalsIgnoreCase);
    if (!speciesValid) {
      errors.add("Species code " + speciesCode + " is not valid for this region.");
      return;
    }

    if (gradeCode != null
        && repository.findSpeciesEndUsesByRegionSpeciesRequired(region, speciesCode).stream()
            .map(ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow::gradeCode)
            .map(TextUtils::trimToNull)
            .noneMatch(gradeCode::equalsIgnoreCase)) {
      errors.add(
          "Grade code "
              + gradeCode
              + " is not valid for species "
              + speciesCode
              + " in this region.");
    }
  }

  private void validateFederalImportMetadata(
      CreateApplicationRequest application, List<String> errors) {
    if (!JURISDICTION_FEDERAL.equals(trimToNull(application.jurisdictionCode()))) {
      return;
    }
    if (application.federalApplicationNumber() == null
        || application.federalApplicationNumber() < 0) {
      errors.add("A non-negative federal application number is required for federal imports.");
    }
  }

  private boolean hasAtMostOneDecimal(Double value) {
    if (value == null) {
      return false;
    }
    return BigDecimal.valueOf(value).stripTrailingZeros().scale() <= 1;
  }

  private boolean hasAtMostTwoDecimals(Double value) {
    if (value == null) {
      return false;
    }
    return BigDecimal.valueOf(value).stripTrailingZeros().scale() <= 2;
  }

  private void validateApplicationVolumeRange(Double value, List<String> errors) {
    if (value < 0.0d) {
      errors.add("The application volume must be greater than or equal to 0.");
      return;
    }
    if (value > MAX_APPLICATION_VOLUME) {
      errors.add(
          "The application volume must be less than or equal to "
              + BigDecimal.valueOf(MAX_APPLICATION_VOLUME).stripTrailingZeros().toPlainString()
              + ".");
    }
    if (!hasAtMostTwoDecimals(value)) {
      errors.add("The application volume must have no more than two decimal places.");
    }
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
        request.federalPermitNumber() == null && existing != null
            ? existing.federalPermitNumber()
            : request.federalPermitNumber(),
        request.reservePermitNumber() == null && existing != null
            ? existing.reservePermitNumber()
            : request.reservePermitNumber(),
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

  private List<ApplicationDetailsRpcRepository.EndUseMutationRecord> toApplicationEndUses(
      List<String> speciesCodes, String endUseCode, String productTypeCode) {
    return toEndUses(
        speciesCodes,
        EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equals(trimToNull(productTypeCode)) ? null : endUseCode);
  }

  private boolean renamePackage(
      String currentPackageNumber,
      ApplicationDetailsRpcRepository.PackageMutationRecord record,
      String userId) {
    Optional<ApplicationDetailsRpcRepository.PackageMutationRow> inserted =
        repository.insertPackage(record);
    if (inserted.filter(row -> matchesInsertedPackage(row, record)).isEmpty()) {
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

  private PackagePersistenceResult duplicatePackageResult(String packageNumber) {
    return invalidPackageResult(
        packageNumber, List.of(PACKAGE_EXISTS_MESSAGE_TEMPLATE.formatted(packageNumber)));
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
    Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> application =
        request.applicationNumber() == null || request.applicationNumber() < 1
            ? Optional.empty()
            : repository.findApplicationUpdateRecord(request.applicationNumber());
    boolean federalApplication =
        application
            .map(ApplicationDetailsRpcRepository.ApplicationUpdateRecord::jurisdictionCode)
            .map(TextUtils::trimToNull)
            .filter(JURISDICTION_FEDERAL::equals)
            .isPresent();

    if (request.applicationNumber() == null || request.applicationNumber() < 1) {
      errors.add(required("application number"));
    } else if (application.isEmpty()) {
      errors.add("Application " + request.applicationNumber() + " could not be verified.");
    } else if (isSystemOwnedOicApplication(application.get())) {
      errors.add(SYSTEM_OIC_APPLICATION_MESSAGE);
    } else if (JURISDICTION_PROVINCIAL.equalsIgnoreCase(
            trimToNull(application.get().jurisdictionCode()))
        && !EXPORT_PRODUCT_TYPE_HARVESTED.equalsIgnoreCase(
            trimToNull(application.get().productTypeCode()))) {
      errors.add(SCALE_REQUIRES_HARVESTED_APPLICATION_MESSAGE);
    }

    if (packageNumber == null) {
      errors.add(required("scale package number"));
    } else if (!repository.packageExists(packageNumber)) {
      errors.add("Package number " + packageNumber + " does not exist.");
    }

    if (trimToNull(request.timberMark()) == null) {
      errors.add(required("timber mark"));
    } else {
      validateTimberMark(request, application, errors);
    }
    if (trimToNull(request.gradeCode()) == null) {
      errors.add(required("grade code"));
    }
    if (trimToNull(request.speciesCode()) == null) {
      errors.add(required("species code"));
    }
    validateScaleCodes(request, errors);
    if (federalApplication) {
      validateScaleCodesForRegion(request, application.get().orgUnitNumber(), errors);
    }
    errors.addAll(
        ScaleDomainValidator.validateNumericValues(request.pieces(), request.volume(), false));

    if (packageNumber != null) {
      List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows =
          repository.findScaleDetailsByPackageNumber(packageNumber);
      if (hasMutationLockedScale(scaleRows)) {
        errors.add(SCALE_PERMITTED_MESSAGE);
      }
      if (ScaleDomainValidator.containsCombination(
          scaleRows.stream().map(this::toScaleValues).toList(), toScaleValues(request))) {
        errors.add("A scale with this timber mark, species, and grade already exists.");
      }

      if (request.volume() != null) {
        double packageVolume =
            repository
                .findPackageDetailsByPackageNumberRequired(packageNumber)
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

  private void validateScaleCodes(ScaleMutationRequest request, List<String> errors) {
    String speciesCode = trimToNull(request.speciesCode());
    if (speciesCode != null
        && repository
            .findSpeciesCodeRequired(speciesCode)
            .filter(row -> speciesCode.equalsIgnoreCase(trimToNull(row.code())))
            .isEmpty()) {
      errors.add("Species code " + speciesCode + " does not exist.");
    }

    String gradeCode = trimToNull(request.gradeCode());
    if (gradeCode != null
        && repository
            .findGradeCodeRequired(gradeCode)
            .filter(row -> gradeCode.equalsIgnoreCase(trimToNull(row.code())))
            .isEmpty()) {
      errors.add("Grade code " + gradeCode + " does not exist.");
    }
  }

  private ScaleValues toScaleValues(ScaleMutationRequest request) {
    return new ScaleValues(
        request.timberMark(),
        request.speciesCode(),
        request.gradeCode(),
        request.pieces(),
        request.volume());
  }

  private ScaleValues toScaleValues(
      ApplicationDetailsRpcRepository.ApplicationScaleDetailRow row) {
    return new ScaleValues(
        row.timberMark(),
        row.exportSpeciesCode(),
        row.exportGradeCode(),
        row.piecesCount(),
        row.speciesGradeVolume());
  }

  private void validateTimberMark(
      ScaleMutationRequest request,
      Optional<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> application,
      List<String> errors) {
    String timberMark = trimToNull(request.timberMark());
    if (timberMark == null) {
      return;
    }

    validateTimberMarkForContext(
        timberMark,
        application.map(ApplicationDetailsRpcRepository.ApplicationUpdateRecord::orgUnitNumber).orElse(null),
        application.map(ApplicationDetailsRpcRepository.ApplicationUpdateRecord::productTypeCode).orElse(null),
        application.map(ApplicationDetailsRpcRepository.ApplicationUpdateRecord::jurisdictionCode).orElse(null),
        true,
        errors);
  }

  private boolean isGenericApplicationMutationAllowed(Long applicationNumber) {
    return isPackageApplicationMutationAllowed(applicationNumber, false);
  }

  private boolean isPackageApplicationMutationAllowed(
      Long applicationNumber, boolean hiddenBlanketOicWorkflow) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    return repository
        .findApplicationUpdateRecord(applicationNumber)
        .filter(
            record ->
                isSystemOwnedOicApplication(record) == hiddenBlanketOicWorkflow)
        .isPresent();
  }

  private boolean isSystemOwnedOicApplication(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord application) {
    return application != null
        && OIC_INDICATOR_YES.equalsIgnoreCase(trimToNull(application.oicIndicator()));
  }

  private void validateTimberMarkForContext(
      String timberMark,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      boolean validateRegion,
      List<String> errors) {
    Optional<ApplicationDetailsRpcRepository.TimberMarkRow> baseMark =
        repository.findTimberMark(timberMark);

    if (EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equals(trimToNull(productTypeCode))
        && UNMANUFACTURED_TIMBER_MARK.equalsIgnoreCase(timberMark)) {
      return;
    }

    if (baseMark.isEmpty()) {
      errors.add("Timber mark " + timberMark + " does not exist.");
      return;
    }

    ApplicationDetailsRpcRepository.TimberMarkRow mark = baseMark.get();
    String normalizedJurisdictionCode = trimToNull(jurisdictionCode);
    if (orgUnitNumber != null && validateRegion) {
      Optional<ApplicationDetailsRpcRepository.TimberMarkRow> regionalMark =
          repository.findTimberMarkByOrgUnit(timberMark, orgUnitNumber);
      if (regionalMark.isEmpty()) {
        errors.add("Timber mark " + timberMark + " is not valid for this region.");
        return;
      }
      mark = regionalMark.get();
    }

    String fileTypeCode = trimToNull(mark.fileTypeCode());
    if (JURISDICTION_PROVINCIAL.equals(normalizedJurisdictionCode)
        && ("B08".equals(fileTypeCode) || "B14".equals(fileTypeCode))) {
      errors.add("Timber mark " + timberMark + " is not valid for provincial applications.");
      return;
    }
    if (JURISDICTION_FEDERAL.equals(normalizedJurisdictionCode) && !"B08".equals(fileTypeCode)) {
      errors.add("Timber mark " + timberMark + " is not valid for federal applications.");
      return;
    }

    String status = trimToNull(mark.markStatus());
    if (status == null || !VALID_TIMBER_MARK_STATUSES.contains(status.toUpperCase(Locale.ROOT))) {
      errors.add(
          "Timber mark " + timberMark + " is not valid for this scale"
              + (status == null ? "." : " due to a status of " + status + "."));
    }
  }

  private boolean hasMutationLockedScale(
      List<ApplicationDetailsRpcRepository.ApplicationScaleDetailRow> scaleRows) {
    Map<Long, Boolean> mutationLockedByPermitNumber = new LinkedHashMap<>();
    return scaleRows.stream()
        .anyMatch(
            row ->
                isMutationLockedPermit(
                    row.exportPermitDetailNumber(), mutationLockedByPermitNumber));
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

  private boolean matchesInsertedRemark(
      ApplicationDetailsRpcRepository.RemarkRow row,
      Long expectedApplicationNumber,
      String expectedRemark,
      String expectedUserId) {
    return row != null
        && row.remarkId() > 0
        && java.util.Objects.equals(expectedApplicationNumber, row.applicationNumber())
        && java.util.Objects.equals(expectedRemark, row.remark())
        && java.util.Objects.equals(
            trimToNull(expectedUserId), trimToNull(row.user()));
  }

  private boolean matchesInsertedPackage(
      ApplicationDetailsRpcRepository.PackageMutationRow row,
      ApplicationDetailsRpcRepository.PackageMutationRecord expected) {
    return row != null
        && java.util.Objects.equals(
            trimToNull(expected.packageNumber()), trimToNull(row.packageNumber()))
        && java.util.Objects.equals(expected.applicationNumber(), row.applicationNumber())
        && sameNullableDecimal(expected.packageVolume(), row.packageVolume())
        && sameNullableDecimal(expected.averageLength(), row.averageLength())
        && sameNullableDecimal(expected.averageDiameter(), row.averageDiameter())
        && java.util.Objects.equals(
            trimToNull(expected.comments()), trimToNull(row.comments()))
        && java.util.Objects.equals(
            trimToNull(expected.reprocessedIndicator()),
            trimToNull(row.reprocessedIndicator()))
        && java.util.Objects.equals(
            expected.federalPermitNumber(), row.federalPermitNumber())
        && java.util.Objects.equals(
            expected.reservePermitNumber(), row.reservePermitNumber())
        && java.util.Objects.equals(
            trimToNull(expected.packageStatusCode()),
            trimToNull(row.packageStatusCode()))
        && java.util.Objects.equals(
            trimToNull(expected.growthTypeCode()), trimToNull(row.growthTypeCode()))
        && java.util.Objects.equals(
            trimToNull(expected.productTypeCode()), trimToNull(row.productTypeCode()));
  }

  private boolean matchesInsertedScale(
      ApplicationDetailsRpcRepository.ApplicationScaleDetailRow row,
      ApplicationDetailsRpcRepository.ScaleMutationRecord expected) {
    return row != null
        && parsePositiveLong(row.exportScaleDetailId()) != null
        && java.util.Objects.equals(expected.applicationNumber(), row.applicationNumber())
        && java.util.Objects.equals(
            trimToNull(expected.packageNumber()), trimToNull(row.packageNumber()))
        && java.util.Objects.equals(
            trimToNull(expected.timberMark()), trimToNull(row.timberMark()))
        && java.util.Objects.equals(
            trimToNull(expected.speciesCode()), trimToNull(row.exportSpeciesCode()))
        && java.util.Objects.equals(
            trimToNull(expected.gradeCode()), trimToNull(row.exportGradeCode()))
        && row.exportPermitDetailNumber() == null
        && expected.piecesCount() != null
        && expected.piecesCount() == row.piecesCount()
        && sameNullableDecimal(expected.speciesGradeVolume(), row.speciesGradeVolume());
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

  private boolean matchesLegacyApplicationEndUseSort(
      String candidate,
      List<ApplicationDetailsRpcRepository.EndUseRow> endUses,
      String firstEndUseCode,
      String productTypeCode) {
    if (candidate == null || firstEndUseCode == null) {
      return false;
    }
    for (ApplicationDetailsRpcRepository.EndUseRow endUse : endUses) {
      String speciesCode = trimToNull(endUse.speciesCode());
      if (speciesCode == null || !candidate.contains(speciesCode)) {
        return false;
      }
    }
    return EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equals(trimToNull(productTypeCode))
        || candidate.contains(firstEndUseCode);
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

  private boolean isMutationLockedPermit(
      String exportPermitDetailNumber, Map<Long, Boolean> mutationLockedByPermitNumber) {
    String normalizedPermitNumber = trimToNull(exportPermitDetailNumber);
    if (normalizedPermitNumber == null) {
      return false;
    }
    Long permitNumber = parsePositiveLong(normalizedPermitNumber);
    if (permitNumber == null) {
      return true;
    }
    if (mutationLockedByPermitNumber.containsKey(permitNumber)) {
      return mutationLockedByPermitNumber.get(permitNumber);
    }
    boolean mutationLocked =
        repository
            .findPermitStatusCodeByPermitNumber(permitNumber)
            .map(this::isMutationLockedPermitStatus)
            .orElse(true);
    mutationLockedByPermitNumber.put(permitNumber, mutationLocked);
    return mutationLocked;
  }

  private boolean isMutationLockedOrUnknownPermit(Long permitNumber) {
    if (permitNumber < 1) {
      return true;
    }
    return repository
        .findPermitStatusCodeByPermitNumber(permitNumber)
        .map(this::isMutationLockedPermitStatus)
        .orElse(true);
  }

  private boolean isMutationLockedPermitStatus(String status) {
    String normalized = trimToNull(status);
    return normalized != null
        && MUTATION_LOCKED_EXPORT_PERMIT_STATUSES.contains(normalized.toUpperCase(Locale.ROOT));
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

  private String normalizeCreateApplicationStatus(String applicationStatusCode) {
    return normalizeCode(applicationStatusCode);
  }

  private String normalizeCode(String code) {
    String normalized = trimToNull(code);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
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
    boolean agentApplicant = APPLICANT_TYPE_AGENT.equals(applicantTypeCode);

    return new CreateApplicationRequest(
        input.federalApplicationNumber(),
        input.applicationDate(),
        input.termDays(),
        input.receivedDate(),
        input.applicationVolume(),
        input.averageLogVolume() == null ? 0.0d : input.averageLogVolume(),
        trimToNull(input.productLocation()),
        input.exportScheduleId(),
        agentApplicant ? trimToNull(input.agentClientNumber()) : null,
        agentApplicant ? trimToNull(input.agentClientLocationCode()) : null,
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.ownerClientLocationCode()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.exemptionReasonCode()),
        normalizeCreateApplicationStatus(input.applicationStatusCode()),
        applicantTypeCode,
        input.orgUnitNumber(),
        trimToNull(input.productTypeCode()),
        firstNonBlank(input.jurisdictionCode(), JURISDICTION_PROVINCIAL),
        trimToNull(input.growthTypeCode()),
        agentApplicant ? trimToNull(input.agentContactName()) : null,
        trimToNull(input.ownerContactName()),
        firstNonBlank(input.oicIndicator(), OIC_INDICATOR_NO),
        trimToNull(input.endUseCode()),
        input.speciesCodes() == null ? null : normalizeCodes(input.speciesCodes()),
        trimToNull(input.remarkBody()),
        input.validationEnabled());
  }

  private CreateApplicationRequest normalizePublicProvincialCreateRequest(
      CreateApplicationRequest input) {
    CreateApplicationRequest normalized = normalizeCreateApplicationRequest(input);
    return new CreateApplicationRequest(
        null,
        normalized.applicationDate(),
        normalized.termDays(),
        normalized.receivedDate(),
        normalized.applicationVolume(),
        normalized.averageLogVolume(),
        normalized.productLocation(),
        normalized.exportScheduleId(),
        normalized.agentClientNumber(),
        normalized.agentClientLocationCode(),
        normalized.ownerClientNumber(),
        normalized.ownerClientLocationCode(),
        normalized.exemptionNumber(),
        normalized.exemptionReasonCode(),
        APPLICATION_STATUS_NEW,
        normalized.applicantTypeCode(),
        normalized.orgUnitNumber(),
        normalized.productTypeCode(),
        JURISDICTION_PROVINCIAL,
        normalized.growthTypeCode(),
        normalized.agentContactName(),
        normalized.ownerContactName(),
        normalized.oicIndicator(),
        normalized.endUseCode(),
        normalized.speciesCodes(),
        normalized.remarkBody(),
        true);
  }

  private ApplicationSummaryUpdateRequest normalizeApplicationSummaryUpdateRequest(
      ApplicationSummaryUpdateRequest input) {
    if (input == null) {
      return new ApplicationSummaryUpdateRequest(
          null, null, null, null, null, null, null, null, null, null, null, null, null, null,
          null, null, null, null, null, null, null, null, null, null, true,
          ApplicationSummarySaveSource.FULL);
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
        normalizeCode(input.applicationStatusCode()),
        normalizeCode(input.applicantTypeCode()),
        input.orgUnitNumber(),
        trimToNull(input.productTypeCode()),
        normalizeCode(input.jurisdictionCode()),
        trimToNull(input.growthTypeCode()),
        trimToNull(input.agentContactName()),
        trimToNull(input.ownerContactName()),
        trimToNull(input.oicIndicator()),
        trimToNull(input.endUseCode()),
        input.speciesCodes() == null ? null : normalizeCodes(input.speciesCodes()),
        input.validationEnabled(),
        input.saveSource() == null ? ApplicationSummarySaveSource.FULL : input.saveSource());
  }

  private ApplicationSummaryUpdateRequest restrictToSaveSource(
      ApplicationSummaryUpdateRequest request) {
    if (request.saveSource() == ApplicationSummarySaveSource.FULL) {
      return request;
    }
    ApplicationSummarySaveSource source = request.saveSource();
    return new ApplicationSummaryUpdateRequest(
        request.applicationNumber(),
        source.updatesSummaryFields() ? request.applicationDate() : null,
        source.updatesSummaryFields() ? request.termDays() : null,
        source.updatesSummaryFields() ? request.receivedDate() : null,
        source.updatesItemFields() ? request.applicationVolume() : null,
        source.updatesItemFields() ? request.averageLogVolume() : null,
        source.updatesSummaryFields() ? request.exemptionReasonCode() : null,
        source.updatesItemFields() ? request.productLocation() : null,
        source.updatesSummaryFields() ? request.exportScheduleId() : null,
        source.updatesAgentFields() ? request.agentClientNumber() : null,
        source.updatesAgentFields() ? request.agentClientLocationCode() : null,
        source.updatesOwnerFields() ? request.ownerClientNumber() : null,
        source.updatesOwnerFields() ? request.ownerClientLocationCode() : null,
        null,
        source.updatesApplicantType() ? request.applicantTypeCode() : null,
        source.updatesSummaryFields() ? request.orgUnitNumber() : null,
        source.updatesItemFields() ? request.productTypeCode() : null,
        null,
        source.updatesItemFields() ? request.growthTypeCode() : null,
        source.updatesAgentFields() ? request.agentContactName() : null,
        source.updatesOwnerFields() ? request.ownerContactName() : null,
        source.updatesSummaryFields() ? request.oicIndicator() : null,
        source.updatesItemFields() ? request.endUseCode() : null,
        source.updatesItemFields() ? request.speciesCodes() : null,
        request.validationEnabled(),
        request.saveSource());
  }

  private List<String> validateCreateApplication(CreateApplicationRequest request) {
    List<String> errors = new ArrayList<>();
    if (request.applicationDate() == null) {
      errors.add(required("application date"));
    }
    if (request.termDays() == null || request.termDays() <= 0) {
      errors.add("The application term days must be greater than 0.");
    } else if (request.termDays() > MAX_APPLICATION_TERM_DAYS) {
      errors.add("The application term days must be no more than 99999.");
    }
    if (request.receivedDate() == null) {
      errors.add(required("application received date"));
    }
    if (request.applicationVolume() == null || request.applicationVolume() <= 0.0d) {
      errors.add("The application volume must be greater than 0.");
    } else {
      validateApplicationVolumeRange(request.applicationVolume(), errors);
    }
    if (trimToNull(request.productTypeCode()) == null) {
      errors.add(required("product type code"));
    }
    if (isHarvestedProductType(request.productTypeCode())) {
      validateOptionalVolumeRange(
          request.averageLogVolume(), "average log volume", MAX_AVERAGE_LOG_VOLUME, errors);
      if (trimToNull(request.productLocation()) == null) {
        errors.add(required("location of logs"));
      }
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

    String applicationStatusCode = trimToNull(request.applicationStatusCode());
    if (applicationStatusCode != null && !isEditableApplicationDetailStatus(applicationStatusCode)) {
      errors.add("The application status code must be NEW or APP.");
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
        && !APPLICANT_TYPE_MINISTERIAL.equals(applicantTypeCode)
        && !APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      errors.add("The applicant type code must be O, M, or A.");
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
    if (errors.isEmpty()) {
      validateApplicationReferences(request, errors);
      validateApplicationSpeciesEndUse(
          request.orgUnitNumber(),
          request.productTypeCode(),
          request.endUseCode(),
          request.speciesCodes(),
          true,
          errors);
    }
    return errors;
  }

  private List<String> validateApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record,
      ApplicationSummaryUpdateRequest request) {
    return switch (request.saveSource()) {
      case FULL -> validateFullApplicationUpdate(existing, record, request);
      case SUMMARY -> validateSummaryApplicationUpdate(existing, record, request);
      case OWNER -> validateOwnerApplicationUpdate(existing, record, request);
      case AGENT -> validateAgentApplicationUpdate(record);
      case OWNER_AGENT -> validateOwnerAgentApplicationUpdate(record);
      case ITEMS -> validateItemsApplicationUpdate(existing, record, request);
    };
  }

  private List<String> validateFullApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record,
      ApplicationSummaryUpdateRequest request) {
    List<String> errors = new ArrayList<>();
    if (!isEditableApplicationDetailStatus(record.applicationStatusCode())) {
      errors.add(APPLICATION_DETAILS_LOCKED_MESSAGE);
    }
    String requestedApplicationStatusCode = trimToNull(request.applicationStatusCode());
    if (requestedApplicationStatusCode != null
        && !requestedApplicationStatusCode.equalsIgnoreCase(record.applicationStatusCode())) {
      errors.add(
          "Application status cannot be changed from the application summary. Use application review.");
    }
    if (!JURISDICTION_PROVINCIAL.equalsIgnoreCase(trimToNull(record.jurisdictionCode()))
        || (request.jurisdictionCode() != null
            && !JURISDICTION_PROVINCIAL.equals(request.jurisdictionCode()))) {
      errors.add("Application jurisdiction cannot be changed and must remain P.");
    }
    if (record.applicationDate() == null) {
      errors.add(required("application date"));
    }
    if (record.termDays() == null || record.termDays() <= 0) {
      errors.add("The application term days must be greater than 0.");
    } else if (record.termDays() > MAX_APPLICATION_TERM_DAYS) {
      errors.add("The application term days must be no more than 99999.");
    }
    if (record.receivedDate() == null) {
      errors.add(required("application received date"));
    }
    if (record.applicationVolume() == null || record.applicationVolume() <= 0.0d) {
      errors.add("The application volume must be greater than 0.");
    } else {
      validateApplicationVolumeRange(record.applicationVolume(), errors);
    }
    String exemptionReasonCode = trimToNull(record.exemptionReasonCode());
    if (exemptionReasonCode == null) {
      errors.add(required("application exemption reason code"));
    } else if (exemptionReasonCode.length() > 1) {
      errors.add(maxLength("application exemption reason code", 1));
    }
    validateApplicationStorageText(record, errors);
    if (trimToNull(record.productTypeCode()) == null) {
      errors.add(required("product type code"));
    }
    if (isHarvestedProductType(record.productTypeCode())) {
      validateOptionalVolumeRange(
          record.averageLogVolume(), "average log volume", MAX_AVERAGE_LOG_VOLUME, errors);
      if (trimToNull(record.productLocation()) == null) {
        errors.add(required("location of logs"));
      }
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
        && !APPLICANT_TYPE_MINISTERIAL.equals(applicantTypeCode)
        && !APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      errors.add("The applicant type code must be O, M, or A.");
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
    if (errors.isEmpty()) {
      validateApplicationReferences(record, errors);
      validateProductTypeTransition(existing, record, errors);
      validateStoredPackageVolume(record, errors);
      validateFirstScaleRegion(record, errors);
      validateMergedApplicationSpeciesEndUse(record, request, errors);
    }
    return errors;
  }

  private List<String> validateSummaryApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record,
      ApplicationSummaryUpdateRequest request) {
    List<String> errors = validateScopedApplicationFixedFields(record);
    if (!errors.isEmpty()) {
      return errors;
    }
    validateSummaryFields(record, errors);
    if (!errors.isEmpty()) {
      return errors;
    }
    validateSummaryReferences(record, errors);
    if (!errors.isEmpty()) {
      return errors;
    }
    if (!java.util.Objects.equals(existing.orgUnitNumber(), record.orgUnitNumber())) {
      validateFirstScaleRegion(record, errors);
      validateMergedApplicationSpeciesEndUse(record, request, errors);
    }
    return errors;
  }

  private List<String> validateOwnerApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record,
      ApplicationSummaryUpdateRequest request) {
    List<String> errors = validateScopedApplicationFixedFields(record);
    if (!errors.isEmpty()) {
      return errors;
    }
    validateOwnerFields(record, errors);
    if (request.applicantTypeCode() != null) {
      validateApplicantType(record.applicantTypeCode(), errors);
      if (APPLICANT_TYPE_AGENT.equals(record.applicantTypeCode())
          && !APPLICANT_TYPE_AGENT.equalsIgnoreCase(existing.applicantTypeCode())) {
        errors.add("Changing the applicant type to Agent requires owner and agent details.");
      }
    }
    if (errors.isEmpty()) {
      validateApplicationClientLocation(
          "owner", record.ownerClientNumber(), record.ownerClientLocationCode(), errors);
      if (request.applicantTypeCode() != null
          && !repository.isApplicantTypeCodeValidRequired(record.applicantTypeCode())) {
        errors.add("Application applicant type code does not exist.");
      }
    }
    return errors;
  }

  private List<String> validateAgentApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record) {
    List<String> errors = validateScopedApplicationFixedFields(record);
    if (!errors.isEmpty()) {
      return errors;
    }
    if (!APPLICANT_TYPE_AGENT.equalsIgnoreCase(trimToNull(record.applicantTypeCode()))) {
      errors.add("Application agent details can only be changed for an agent applicant.");
      return errors;
    }
    validateAgentFields(record, errors);
    if (errors.isEmpty()) {
      validateApplicationClientLocation(
          "agent", record.agentClientNumber(), record.agentClientLocationCode(), errors);
    }
    return errors;
  }

  private List<String> validateOwnerAgentApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record) {
    List<String> errors = validateScopedApplicationFixedFields(record);
    if (!errors.isEmpty()) {
      return errors;
    }
    if (!APPLICANT_TYPE_AGENT.equalsIgnoreCase(trimToNull(record.applicantTypeCode()))) {
      errors.add("Combined owner and agent details can only be saved for an agent applicant.");
      return errors;
    }
    validateOwnerFields(record, errors);
    validateApplicantType(record.applicantTypeCode(), errors);
    validateAgentFields(record, errors);
    if (errors.isEmpty()) {
      validateApplicationClientLocation(
          "owner", record.ownerClientNumber(), record.ownerClientLocationCode(), errors);
      if (!repository.isApplicantTypeCodeValidRequired(record.applicantTypeCode())) {
        errors.add("Application applicant type code does not exist.");
      }
      validateApplicationClientLocation(
          "agent", record.agentClientNumber(), record.agentClientLocationCode(), errors);
    }
    return errors;
  }

  private List<String> validateItemsApplicationUpdate(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record,
      ApplicationSummaryUpdateRequest request) {
    List<String> errors = validateScopedApplicationFixedFields(record);
    if (!errors.isEmpty()) {
      return errors;
    }
    validateItemFields(record, errors);
    if (errors.isEmpty()) {
      validateItemReferences(record, errors);
      validateProductTypeTransition(existing, record, errors);
      validateStoredPackageVolume(record, errors);
      validateFirstScaleRegion(record, errors);
      validateMergedApplicationSpeciesEndUse(record, request, errors);
    }
    return errors;
  }

  private List<String> validateScopedApplicationFixedFields(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record) {
    List<String> errors = new ArrayList<>();
    if (!isEditableApplicationDetailStatus(record.applicationStatusCode())) {
      errors.add(APPLICATION_DETAILS_LOCKED_MESSAGE);
    }
    if (!JURISDICTION_PROVINCIAL.equalsIgnoreCase(trimToNull(record.jurisdictionCode()))) {
      errors.add("Application jurisdiction cannot be changed and must remain P.");
    }
    return errors;
  }

  private void validateSummaryFields(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (record.applicationDate() == null) {
      errors.add(required("application date"));
    }
    if (record.termDays() == null || record.termDays() <= 0) {
      errors.add("The application term days must be greater than 0.");
    } else if (record.termDays() > MAX_APPLICATION_TERM_DAYS) {
      errors.add("The application term days must be no more than 99999.");
    }
    if (record.receivedDate() == null) {
      errors.add(required("application received date"));
    }
    String exemptionReasonCode = trimToNull(record.exemptionReasonCode());
    if (exemptionReasonCode == null) {
      errors.add(required("application exemption reason code"));
    } else if (exemptionReasonCode.length() > 1) {
      errors.add(maxLength("application exemption reason code", 1));
    }
    if (record.orgUnitNumber() == null || record.orgUnitNumber() <= 0) {
      errors.add(required("application region"));
    }
  }

  private void validateSummaryReferences(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (!repository.isExemptionReasonCodeValidRequired(record.exemptionReasonCode())) {
      errors.add("Application exemption reason code does not exist.");
    }
    if (!repository.isOrgUnitValidRequired(record.orgUnitNumber())) {
      errors.add("Application region does not exist.");
    }
  }

  private void validateOwnerFields(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (trimToNull(record.ownerClientNumber()) == null) {
      errors.add(required("application owner number"));
    }
    String ownerClientLocationCode = trimToNull(record.ownerClientLocationCode());
    if (ownerClientLocationCode == null) {
      errors.add(required("application owner location"));
    } else if (ownerClientLocationCode.length() > 2) {
      errors.add(maxLength("application owner location code", 2));
    }
    if (trimToNull(record.ownerContactName()) == null) {
      errors.add(required("application owner name"));
    }
    validateOracleText(record.ownerContactName(), "Owner contact name", CONTACT_NAME_MAX_BYTES, errors);
  }

  private void validateAgentFields(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (trimToNull(record.agentClientNumber()) == null) {
      errors.add(required("application agent number"));
    }
    String agentClientLocationCode = trimToNull(record.agentClientLocationCode());
    if (agentClientLocationCode == null) {
      errors.add(required("application agent location"));
    } else if (agentClientLocationCode.length() > 2) {
      errors.add(maxLength("application agent location code", 2));
    }
    if (trimToNull(record.agentContactName()) == null) {
      errors.add(required("application agent name"));
    }
    validateOracleText(record.agentContactName(), "Agent contact name", CONTACT_NAME_MAX_BYTES, errors);
  }

  private void validateApplicantType(String applicantTypeCode, List<String> errors) {
    String applicantType = trimToNull(applicantTypeCode);
    if (applicantType == null) {
      errors.add(required("applicant type code"));
    } else if (!APPLICANT_TYPE_OWNER.equals(applicantType)
        && !APPLICANT_TYPE_MINISTERIAL.equals(applicantType)
        && !APPLICANT_TYPE_AGENT.equals(applicantType)) {
      errors.add("The applicant type code must be O, M, or A.");
    }
  }

  private void validateItemFields(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (record.applicationVolume() == null || record.applicationVolume() <= 0.0d) {
      errors.add("The application volume must be greater than 0.");
    } else {
      validateApplicationVolumeRange(record.applicationVolume(), errors);
    }
    if (trimToNull(record.productTypeCode()) == null) {
      errors.add(required("product type code"));
    }
    if (isHarvestedProductType(record.productTypeCode())) {
      validateOptionalVolumeRange(
          record.averageLogVolume(), "average log volume", MAX_AVERAGE_LOG_VOLUME, errors);
      if (trimToNull(record.productLocation()) == null) {
        errors.add(required("location of logs"));
      }
      validateOracleText(record.productLocation(), "Location of logs", PRODUCT_LOCATION_MAX_BYTES, errors);
    }
    if (requiresGrowthType(record.productTypeCode())
        && trimToNull(record.growthTypeCode()) == null) {
      errors.add(required("growth type code"));
    }
  }

  private void validateItemReferences(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (!repository.isProductTypeCodeValidRequired(record.productTypeCode())) {
      errors.add("Application product type code does not exist.");
    }
    if (requiresGrowthType(record.productTypeCode())
        && !repository.isGrowthTypeCodeValidRequired(record.growthTypeCode())) {
      errors.add("Application growth type code does not exist.");
    }
  }

  private void validateProductTypeTransition(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord updated,
      List<String> errors) {
    String existingProductType = trimToNull(existing.productTypeCode());
    String updatedProductType = trimToNull(updated.productTypeCode());
    if (existingProductType == null
        || updatedProductType == null
        || existingProductType.equalsIgnoreCase(updatedProductType)) {
      return;
    }

    if (EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equalsIgnoreCase(updatedProductType)
        && !repository
            .findScaleMutationsByApplicationNumber(updated.applicationNumber())
            .isEmpty()) {
      errors.add(PRODUCT_TYPE_CHANGE_WITH_SCALES_MESSAGE);
    }
    if (EXPORT_PRODUCT_TYPE_STANDING.equalsIgnoreCase(updatedProductType)
        && !repository
            .findPackageMutationsByApplicationNumber(updated.applicationNumber())
            .isEmpty()) {
      errors.add(PRODUCT_TYPE_CHANGE_WITH_PACKAGES_MESSAGE);
    }
  }

  private void validateApplicationReferences(
      CreateApplicationRequest request, List<String> errors) {
    validateApplicationReferences(
        request.productTypeCode(),
        request.growthTypeCode(),
        request.exemptionReasonCode(),
        firstNonBlank(request.applicationStatusCode(), APPLICATION_STATUS_NEW),
        request.applicantTypeCode(),
        request.jurisdictionCode(),
        request.orgUnitNumber(),
        request.ownerClientNumber(),
        request.ownerClientLocationCode(),
        request.agentClientNumber(),
        request.agentClientLocationCode(),
        errors);
  }

  private void validateApplicationReferences(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    validateApplicationReferences(
        record.productTypeCode(),
        record.growthTypeCode(),
        record.exemptionReasonCode(),
        record.applicationStatusCode(),
        record.applicantTypeCode(),
        record.jurisdictionCode(),
        record.orgUnitNumber(),
        record.ownerClientNumber(),
        record.ownerClientLocationCode(),
        record.agentClientNumber(),
        record.agentClientLocationCode(),
        errors);
  }

  private void validateApplicationReferences(
      String productTypeCode,
      String growthTypeCode,
      String exemptionReasonCode,
      String applicationStatusCode,
      String applicantTypeCode,
      String jurisdictionCode,
      Long orgUnitNumber,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      List<String> errors) {
    String productType = trimToNull(productTypeCode);
    if (productType != null && !repository.isProductTypeCodeValidRequired(productType)) {
      errors.add("Application product type code does not exist.");
    }
    String growthType = trimToNull(growthTypeCode);
    if (requiresGrowthType(productType)
        && growthType != null
        && !repository.isGrowthTypeCodeValidRequired(growthType)) {
      errors.add("Application growth type code does not exist.");
    }
    String exemptionReason = trimToNull(exemptionReasonCode);
    if (exemptionReason != null
        && !repository.isExemptionReasonCodeValidRequired(exemptionReason)) {
      errors.add("Application exemption reason code does not exist.");
    }
    String applicationStatus = trimToNull(applicationStatusCode);
    if (applicationStatus != null
        && !repository.isApplicationStatusCodeValidRequired(applicationStatus)) {
      errors.add("Application status code does not exist.");
    }
    String applicantType = trimToNull(applicantTypeCode);
    if (applicantType != null
        && !repository.isApplicantTypeCodeValidRequired(applicantType)) {
      errors.add("Application applicant type code does not exist.");
    }
    String jurisdiction = trimToNull(jurisdictionCode);
    if (jurisdiction != null
        && !repository.isJurisdictionCodeValidRequired(jurisdiction)) {
      errors.add("Application jurisdiction code does not exist.");
    }
    if (orgUnitNumber != null
        && orgUnitNumber > 0
        && !repository.isOrgUnitValidRequired(orgUnitNumber)) {
      errors.add("Application region does not exist.");
    }

    validateApplicationClientLocation(
        "owner", ownerClientNumber, ownerClientLocationCode, errors);
    if (APPLICANT_TYPE_AGENT.equals(applicantType)) {
      validateApplicationClientLocation(
          "agent", agentClientNumber, agentClientLocationCode, errors);
    }
  }

  private void validateApplicationClientLocation(
      String label, String clientNumber, String locationCode, List<String> errors) {
    String normalizedClientNumber = trimToNull(clientNumber);
    String normalizedLocationCode = trimToNull(locationCode);
    if (normalizedClientNumber == null || normalizedLocationCode == null) {
      return;
    }
    if (clientRepository
        .findLocationByClientNumberCodeRequired(
            normalizedClientNumber, normalizedLocationCode)
        .isEmpty()) {
      errors.add("Application " + label + " location does not exist.");
    }
  }

  private void validateStoredPackageVolume(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (record.applicationVolume() == null) {
      return;
    }
    BigDecimal packageTotal = BigDecimal.ZERO;
    for (ApplicationDetailsRpcRepository.PackageMutationRow packageRow :
        repository.findPackageMutationsByApplicationNumber(record.applicationNumber())) {
      if (packageRow.packageVolume() != null) {
        packageTotal = packageTotal.add(BigDecimal.valueOf(packageRow.packageVolume()));
      }
    }
    if (packageTotal
            .setScale(1, RoundingMode.HALF_UP)
            .compareTo(BigDecimal.valueOf(record.applicationVolume()))
        > 0) {
      errors.add("Application volume cannot be less than the total package volume.");
    }
  }

  private void validateFirstScaleRegion(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    List<ApplicationDetailsRpcRepository.ScaleMutationRow> scales =
        repository.findScaleMutationsByApplicationNumber(record.applicationNumber());
    if (scales.isEmpty()) {
      return;
    }
    String timberMark = trimToNull(scales.get(0).timberMark());
    if (timberMark == null
        || repository
            .findTimberMarkByOrgUnitRequired(timberMark, record.orgUnitNumber())
            .isEmpty()) {
      errors.add("The first scale timber mark is not valid for the application region.");
    }
  }

  private void validateMergedApplicationSpeciesEndUse(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record,
      ApplicationSummaryUpdateRequest request,
      List<String> errors) {
    List<String> speciesCodes;
    String endUseCode;
    if (request.speciesCodes() != null) {
      speciesCodes = request.speciesCodes();
      endUseCode = request.endUseCode();
    } else {
      List<ApplicationDetailsRpcRepository.EndUseRow> persistedEndUses =
          repository.findEndUsesByApplicationNumberRequired(record.applicationNumber());
      speciesCodes =
          persistedEndUses.stream()
              .map(ApplicationDetailsRpcRepository.EndUseRow::speciesCode)
              .filter(value -> trimToNull(value) != null)
              .collect(
                  java.util.stream.Collectors.collectingAndThen(
                      java.util.stream.Collectors.toCollection(LinkedHashSet::new),
                      List::copyOf));
      endUseCode =
          persistedEndUses.isEmpty() ? null : persistedEndUses.get(0).endUseCode();
    }
    validateApplicationSpeciesEndUse(
        record.orgUnitNumber(),
        record.productTypeCode(),
        endUseCode,
        speciesCodes,
        true,
        errors);
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
    List<ApplicationDetailsRpcRepository.ExcolValidationRow> candidateRows = new ArrayList<>();
    boolean unmanufacturedTimber =
        EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equals(normalizedProductTypeCode);
    if (unmanufacturedTimber) {
      // Unmanufactured timber has no editable end use. Validate its selected species against every
      // exact regional combination rather than the hidden OT sentinel or a stale submitted value.
      Set<String> candidateEndUseCodes = new LinkedHashSet<>();
      for (ApplicationDetailsRpcRepository.ExcolValidationRow row :
          repository.findCandidateEndUseCodesRequired(
              normalizedSpeciesCodes.size(), normalizedSpeciesCodes.get(0), orgUnitNumber)) {
        String candidateEndUseCode = trimToNull(row.excolCode());
        if (candidateEndUseCode != null) {
          candidateEndUseCodes.add(candidateEndUseCode);
        }
      }
      for (String candidateEndUseCode : candidateEndUseCodes) {
        candidateRows.addAll(
            repository.findCandidateExcolCodesRequired(
                normalizedSpeciesCodes.size(),
                normalizedSpeciesCodes.get(0),
                candidateEndUseCode,
                orgUnitNumber));
      }
    } else {
      candidateRows =
          repository.findCandidateExcolCodesRequired(
              normalizedSpeciesCodes.size(),
              normalizedSpeciesCodes.get(0),
              normalizedEndUseCode,
              orgUnitNumber);
    }

    boolean matchesCandidate = false;
    for (ApplicationDetailsRpcRepository.ExcolValidationRow row : candidateRows) {
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
        averageLogVolumeForStorage(request.productTypeCode(), request.averageLogVolume()),
        productLocationForStorage(request.productTypeCode(), request.productLocation()),
        entryUserId,
        request.exportScheduleId(),
        request.agentClientNumber(),
        request.agentClientLocationCode(),
        request.ownerClientNumber(),
        request.ownerClientLocationCode(),
        request.exemptionNumber(),
        request.exemptionReasonCode(),
        firstNonBlank(request.applicationStatusCode(), APPLICATION_STATUS_NEW),
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
    ApplicationSummarySaveSource saveSource = request.saveSource();
    boolean updatesSummaryFields = saveSource.updatesSummaryFields();
    boolean updatesOwnerFields = saveSource.updatesOwnerFields();
    boolean updatesAgentFields = saveSource.updatesAgentFields();
    boolean updatesApplicantType = saveSource.updatesApplicantType();
    boolean updatesItemFields = saveSource.updatesItemFields();
    String applicantTypeCode =
        !updatesApplicantType || request.applicantTypeCode() == null
            ? existing.applicantTypeCode()
            : request.applicantTypeCode();
    boolean agentApplicant =
        APPLICANT_TYPE_AGENT.equalsIgnoreCase(trimToNull(applicantTypeCode));
    boolean clearAgentFields =
        saveSource == ApplicationSummarySaveSource.FULL
            ? !agentApplicant
            : updatesApplicantType
                && request.applicantTypeCode() != null
                && !agentApplicant
                && (existing.applicantTypeCode() == null
                    || !applicantTypeCode.equalsIgnoreCase(existing.applicantTypeCode()));
    String productTypeCode =
        !updatesItemFields || request.productTypeCode() == null
            ? existing.productTypeCode()
            : request.productTypeCode();
    Double averageLogVolume =
        !updatesItemFields || request.averageLogVolume() == null
            ? existing.averageLogVolume()
            : request.averageLogVolume();
    String productLocation =
        !updatesItemFields || request.productLocation() == null
            ? existing.productLocation()
            : request.productLocation();
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        existing.applicationNumber(),
        existing.federalApplicationNumber(),
        !updatesSummaryFields || request.applicationDate() == null
            ? existing.applicationDate()
            : request.applicationDate(),
        !updatesSummaryFields || request.termDays() == null ? existing.termDays() : request.termDays(),
        !updatesSummaryFields || request.receivedDate() == null
            ? existing.receivedDate()
            : request.receivedDate(),
        !updatesItemFields || request.applicationVolume() == null
            ? existing.applicationVolume()
            : request.applicationVolume(),
        updatesItemFields
            ? averageLogVolumeForStorage(productTypeCode, averageLogVolume)
            : existing.averageLogVolume(),
        updatesItemFields
            ? productLocationForStorage(productTypeCode, productLocation)
            : existing.productLocation(),
        existing.entryUserId(),
        existing.entryTimestamp(),
        updateUserId,
        Instant.now(),
        saveSource == ApplicationSummarySaveSource.SUMMARY
            ? request.exportScheduleId()
            : !updatesSummaryFields || request.exportScheduleId() == null
                ? existing.exportScheduleId()
                : request.exportScheduleId(),
        clearAgentFields
            ? null
            : updatesAgentFields && request.agentClientNumber() != null
                ? request.agentClientNumber()
                : existing.agentClientNumber(),
        clearAgentFields
            ? null
            : updatesAgentFields && request.agentClientLocationCode() != null
                ? request.agentClientLocationCode()
                : existing.agentClientLocationCode(),
        !updatesOwnerFields || request.ownerClientNumber() == null
            ? existing.ownerClientNumber()
            : request.ownerClientNumber(),
        !updatesOwnerFields || request.ownerClientLocationCode() == null
            ? existing.ownerClientLocationCode()
            : request.ownerClientLocationCode(),
        existing.exemptionNumber(),
        !updatesSummaryFields || request.exemptionReasonCode() == null
            ? existing.exemptionReasonCode()
            : request.exemptionReasonCode(),
        existing.applicationStatusCode(),
        applicantTypeCode,
        !updatesSummaryFields || request.orgUnitNumber() == null
            ? existing.orgUnitNumber()
            : request.orgUnitNumber(),
        productTypeCode,
        existing.jurisdictionCode(),
        !updatesItemFields || request.growthTypeCode() == null
            ? existing.growthTypeCode()
            : request.growthTypeCode(),
        clearAgentFields
            ? null
            : updatesAgentFields && request.agentContactName() != null
                ? request.agentContactName()
                : existing.agentContactName(),
        !updatesOwnerFields || request.ownerContactName() == null
            ? existing.ownerContactName()
            : request.ownerContactName(),
        !updatesSummaryFields || request.oicIndicator() == null
            ? existing.oicIndicator()
            : request.oicIndicator());
  }

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord copyApplicationWithOwner(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String updateUserId) {
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        existing.applicationNumber(),
        existing.federalApplicationNumber(),
        existing.applicationDate(),
        existing.termDays(),
        existing.receivedDate(),
        existing.applicationVolume(),
        existing.averageLogVolume(),
        existing.productLocation(),
        existing.entryUserId(),
        existing.entryTimestamp(),
        updateUserId,
        Instant.now(),
        existing.exportScheduleId(),
        existing.agentClientNumber(),
        existing.agentClientLocationCode(),
        ownerClientNumber,
        ownerClientLocationCode,
        existing.exemptionNumber(),
        existing.exemptionReasonCode(),
        existing.applicationStatusCode(),
        existing.applicantTypeCode(),
        existing.orgUnitNumber(),
        existing.productTypeCode(),
        existing.jurisdictionCode(),
        existing.growthTypeCode(),
        existing.agentContactName(),
        existing.ownerContactName(),
        existing.oicIndicator());
  }

  private String required(String fieldName) {
    return "A valid " + fieldName + " is required.";
  }

  private String maxLength(String fieldName, int maxLength) {
    String unit = maxLength == 1 ? "character" : "characters";
    return "The " + fieldName + " must be " + maxLength + " " + unit + " or fewer.";
  }

  private void validateApplicationStorageText(
      CreateApplicationRequest request, List<String> errors) {
    if (isHarvestedProductType(request.productTypeCode())) {
      validateOracleText(
          request.productLocation(), "Location of logs", PRODUCT_LOCATION_MAX_BYTES, errors);
    }
    validateOracleText(
        request.ownerContactName(), "Owner contact name", CONTACT_NAME_MAX_BYTES, errors);
    validateOracleText(
        request.agentContactName(), "Agent contact name", CONTACT_NAME_MAX_BYTES, errors);
    validateOracleText(request.remarkBody(), "Application remark", REMARK_MAX_BYTES, errors);
  }

  private void validateApplicationStorageText(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record, List<String> errors) {
    if (isHarvestedProductType(record.productTypeCode())) {
      validateOracleText(
          record.productLocation(), "Location of logs", PRODUCT_LOCATION_MAX_BYTES, errors);
    }
    validateOracleText(
        record.ownerContactName(), "Owner contact name", CONTACT_NAME_MAX_BYTES, errors);
    validateOracleText(
        record.agentContactName(), "Agent contact name", CONTACT_NAME_MAX_BYTES, errors);
  }

  private void validateOracleText(
      String value, String description, int maxBytes, List<String> errors) {
    if (value == null || value.isEmpty()) {
      return;
    }
    if (!isUsAscii(value)) {
      errors.add(
          description + " contains characters the current LEXIS database cannot store.");
    } else if (value.length() > maxBytes) {
      errors.add(description + " must not exceed " + maxBytes + " bytes.");
    }
  }

  private boolean isStorableOracleText(String value, int maxBytes) {
    return value != null && isUsAscii(value) && value.length() <= maxBytes;
  }

  private boolean isUsAscii(String value) {
    return value.chars().allMatch(character -> character <= 0x7f);
  }

  private boolean requiresGrowthType(String productTypeCode) {
    String normalized = trimToNull(productTypeCode);
    return EXPORT_PRODUCT_TYPE_HARVESTED.equals(normalized)
        || EXPORT_PRODUCT_TYPE_STANDING.equals(normalized);
  }

  private boolean isHarvestedProductType(String productTypeCode) {
    return EXPORT_PRODUCT_TYPE_HARVESTED.equalsIgnoreCase(trimToNull(productTypeCode));
  }

  private Double averageLogVolumeForStorage(String productTypeCode, Double value) {
    return isHarvestedProductType(productTypeCode) ? value : 0.0d;
  }

  private String productLocationForStorage(String productTypeCode, String value) {
    return isHarvestedProductType(productTypeCode) ? value : ORACLE_IGNORED_PRODUCT_LOCATION;
  }

  private String defaultMutationUser(String userId) {
    return defaultSystemUser(userId);
  }
}

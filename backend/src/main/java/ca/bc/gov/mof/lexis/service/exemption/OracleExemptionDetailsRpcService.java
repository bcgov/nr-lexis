package ca.bc.gov.mof.lexis.service.exemption;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static ca.bc.gov.mof.lexis.util.TextUtils.defaultSystemUser;
import static ca.bc.gov.mof.lexis.util.TextUtils.normalizeClientNumber;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.client.AuthoritativeClientEmailResolver;
import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.function.Predicate;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
@Profile("oracle")
public class OracleExemptionDetailsRpcService implements ExemptionDetailsRpcService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleExemptionDetailsRpcService.class);

  private static final String JURISDICTION_FEDERAL = "F";
  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String JURISDICTION_RESERVE = "I";
  private static final String EXEMPTION_TYPE_OIC = "O";
  private static final String EXEMPTION_TYPE_BOIC = "B";
  private static final String EXEMPTION_STATUS_ACTIVE = "ACT";
  private static final String EXEMPTION_STATUS_CANCELLED = "CAN";
  private static final String EXEMPTION_STATUS_EXPIRED = "EXP";
  private static final String EXEMPTION_STATUS_NEW = "NEW";
  private static final String EXEMPTION_TYPE_MINISTERIAL = "M";
  private static final String APPLICATION_STATUS_APPROVED = "APP";
  private static final String APPLICATION_STATUS_EXEMPTED = "EXE";
  private static final String EXPORT_PERMIT_STATUS_COMPLETE = "COM";
  private static final String EXPORT_PRODUCT_TYPE_UNMANUFACTURED = "T";
  private static final String EXEMPTION_NUMBER_ASSIGNED_MESSAGE =
      "* - this exemption number has already been assigned";
  private static final String SAVE_SUCCESS_MESSAGE = "The exemption was saved successfully.";
  private static final double MAX_APPROVED_VOLUME = 9_999_999.9d;
  private static final double MAX_FEE_RATE = 999.99d;
  private static final int MAX_EXEMPTION_NUMBER_BYTES = 8;
  private static final int MAX_OTHER_CONDITIONS_BYTES = 254;
  private static final long MAX_APPLICATION_TERM_DAYS = 99_999L;
  private static final long LEGACY_DEFAULT_EXEMPTION_TERM_DAYS = 30L;
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER = DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ExemptionDetailsRpcRepository repository;
  private final AuthoritativeClientEmailResolver clientEmailResolver;
  private final EmailNotificationService notificationService;
  private final ExemptionActivationEligibilityValidator activationEligibilityValidator;

  public OracleExemptionDetailsRpcService(
      ExemptionDetailsRpcRepository repository,
      AuthoritativeClientEmailResolver clientEmailResolver,
      EmailNotificationService notificationService,
      ExemptionActivationEligibilityValidator activationEligibilityValidator) {
    this.repository = repository;
    this.clientEmailResolver = clientEmailResolver;
    this.notificationService = notificationService;
    this.activationEligibilityValidator = activationEligibilityValidator;
  }

  @Override
  public ExemptionApplicationsResponse getApplications(
      String exemptionNumber,
      boolean canViewFederalApplications,
      Predicate<Long> applicationAccess) {
    List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> rows =
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber);

    List<ApplicationItem> applications = new ArrayList<>();
    String previousOwnerClientNumber = null;
    boolean blanketOic = false;
    boolean containsUnmanu = false;

    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow row : rows) {
      if (JURISDICTION_FEDERAL.equalsIgnoreCase(row.jurisdictionCode())
          && !canViewFederalApplications) {
        continue;
      }
      if (JURISDICTION_RESERVE.equalsIgnoreCase(row.jurisdictionCode())) {
        continue;
      }
      if (!applicationAccess.test(row.applicationNumber())) {
        continue;
      }

      if (blanketOic
          || (previousOwnerClientNumber != null
              && !previousOwnerClientNumber.equals(row.ownerClientNumber()))) {
        blanketOic = true;
      } else {
        previousOwnerClientNumber = trimToNull(row.ownerClientNumber());
      }

      if (EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equalsIgnoreCase(row.productTypeCode())) {
        containsUnmanu = true;
      }

      applications.add(
          new ApplicationItem(
              row.applicationNumber(),
              formatVolume(row.requestedVolume()),
              formatVolume(row.scaleVolume()),
              false,
              row.jurisdictionCode()));
    }

    String ownerNumber = blanketOic ? "Blanket OIC" : Optional.ofNullable(previousOwnerClientNumber).orElse("");
    return new ExemptionApplicationsResponse(List.copyOf(applications), containsUnmanu, ownerNumber);
  }

  @Override
  public List<Long> getApplicationNumbersForMutation(String exemptionNumber) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      throw new IllegalArgumentException("Exemption number is required.");
    }
    SortedSet<Long> applicationNumbers = new TreeSet<>();
    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow row :
        repository.findApplicationSummariesByExemptionNumber(
            normalizedExemptionNumber)) {
      Long applicationNumber = row == null ? null : row.applicationNumber();
      if (applicationNumber == null || applicationNumber < 1) {
        throw new DataRetrievalFailureException(
            "An exemption application relationship returned an invalid application number.");
      }
      applicationNumbers.add(applicationNumber);
    }
    return List.copyOf(applicationNumbers);
  }

  @Override
  public List<Long> getPermitNumbersForMutation(String exemptionNumber) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      throw new IllegalArgumentException("Exemption number is required.");
    }
    SortedSet<Long> permitNumbers = new TreeSet<>();
    for (ExemptionDetailsRpcRepository.PermitSummaryRow row :
        repository.findPermitsByExemptionNumber(normalizedExemptionNumber)) {
      Long permitNumber = row == null ? null : row.permitNumber();
      if (permitNumber == null || permitNumber < 1) {
        throw new DataRetrievalFailureException(
            "An exemption permit relationship returned an invalid permit number.");
      }
      permitNumbers.add(permitNumber);
    }
    return List.copyOf(permitNumbers);
  }

  @Override
  public List<PermitItem> getPermits(
      String exemptionNumber, Predicate<Long> permitAccess) {
    String exemptionTypeCode =
        repository.findExemptionTypeCodeByExemptionNumber(exemptionNumber).orElse("");
    boolean oicLike =
        EXEMPTION_TYPE_OIC.equalsIgnoreCase(exemptionTypeCode)
            || EXEMPTION_TYPE_BOIC.equalsIgnoreCase(exemptionTypeCode);

    return repository.findPermitsByExemptionNumber(exemptionNumber).stream()
        .map(
            row -> {
              boolean canViewPermit = permitAccess.test(row.permitNumber());
              double displayedVolume = oicLike ? row.oicRequestVolume() : row.permitVolume();
              return new PermitItem(
                  row.permitNumber(),
                  formatVolume(displayedVolume),
                  row.statusDescription(),
                  formatLegacyDate(row.issueDate()),
                  canViewPermit);
            })
        .toList();
  }

  @Override
  public BlanketOicTotalsResponse getBlanketOicTotals(String exemptionNumber) {
    double requestedVolume = 0.0d;
    double completedVolume = 0.0d;

    for (ExemptionDetailsRpcRepository.PermitSummaryRow row :
        repository.findPermitsByExemptionNumber(exemptionNumber)) {
      requestedVolume += row.permitVolume();
      if (EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(row.statusCode())) {
        completedVolume += row.permitVolume();
      }
    }

    return new BlanketOicTotalsResponse(
        formatVolume(requestedVolume), formatVolume(completedVolume));
  }

  @Override
  public ExemptionEditContext getEditContext(String exemptionNumber) {
    Optional<ExemptionDetailsRpcRepository.ExemptionRateRecord> rate =
        repository.findExemptionRate(exemptionNumber);
    return new ExemptionEditContext(
        rate.isPresent(),
        rate.map(ExemptionDetailsRpcRepository.ExemptionRateRecord::fixedExemptionRate).orElse(null),
        repository.findExemptionOrgUnitNumbers(exemptionNumber));
  }

  @Override
  public List<DocumentItem> getDocumentDetails(String exemptionNumber) {
    Map<String, String> attachmentTypeByCode = new LinkedHashMap<>();
    List<DocumentItem> documents = new ArrayList<>();
    repository.findExemptionDocumentDetailsByExemptionNumber(exemptionNumber).stream()
        .map(
            row ->
                toDocumentItem(
                    row,
                    "exemption",
                    exemptionNumber,
                    null,
                    true,
                    attachmentTypeByCode))
        .forEach(documents::add);

    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow application :
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber)) {
      repository
          .findApplicationDocumentDetailsByApplicationNumber(application.applicationNumber())
          .stream()
          .map(
              row ->
                  toDocumentItem(
                      row,
                      "application",
                      null,
                      application.applicationNumber(),
                      false,
                      attachmentTypeByCode))
          .forEach(documents::add);
    }

    return List.copyOf(documents);
  }

  private DocumentItem toDocumentItem(
      ExemptionDetailsRpcRepository.DocumentRow row,
      String source,
      String sourceExemptionNumber,
      Long sourceApplicationNumber,
      boolean deletable,
      Map<String, String> attachmentTypeByCode) {
    return new DocumentItem(
        row.id(),
        row.fileName(),
        normalizeDescription(row.description()),
        resolveAttachmentTypeDescription(row.attachmentTypeCode(), attachmentTypeByCode),
        source,
        sourceExemptionNumber,
        sourceApplicationNumber,
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
            throw new java.io.FileNotFoundException("Exemption attachment was not found.");
          }
        });
  }

  @Override
  public boolean removeDocument(Long documentId) {
    return repository.deleteExemptionFile(documentId);
  }

  @Override
  public CreateExemptionPreview previewCreateExemption(
      List<Long> applicationNumbers, boolean canViewFederalApplications) {
    List<String> invalidApplicationNumberErrors =
        validateRawApplicationNumbers(applicationNumbers);
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      invalidApplicationNumberErrors =
          new ArrayList<>(invalidApplicationNumberErrors);
      invalidApplicationNumberErrors.add(required("application number"));
    }
    if (!invalidApplicationNumberErrors.isEmpty()) {
      return new CreateExemptionPreview(
          false,
          EXEMPTION_TYPE_MINISTERIAL,
          EXEMPTION_STATUS_NEW,
          null,
          null,
          List.of(),
          List.copyOf(invalidApplicationNumberErrors));
    }
    CreateApplicationDerivation derivation =
        deriveCreateApplications(
            applicationNumbers,
            canViewFederalApplications,
            EXEMPTION_TYPE_MINISTERIAL);
    return new CreateExemptionPreview(
        derivation.errors().isEmpty(),
        EXEMPTION_TYPE_MINISTERIAL,
        EXEMPTION_STATUS_NEW,
        derivation.approvedVolume() == null
            ? null
            : derivation.approvedVolume().toPlainString(),
        derivation.expiryDate(),
        derivation.applicationNumbers(),
        derivation.errors());
  }

  @Override
  @Transactional
  public CreateExemptionResult addExemption(
      CreateExemptionRequest request, String userId, boolean canApproveExemption) {
    List<String> invalidApplicationNumberErrors =
        validateRawApplicationNumbers(request == null ? null : request.applicationNumbers());
    CreateExemptionRequest normalized = normalizeCreateExemptionRequest(request);
    List<String> errors = validateCreateExemption(normalized);
    errors.addAll(invalidApplicationNumberErrors);
    List<String> warnings = List.of();

    if (trimToNull(normalized.exemptionNumber()) != null
        && repository.existsByExemptionNumber(normalized.exemptionNumber())) {
      errors.add(EXEMPTION_NUMBER_ASSIGNED_MESSAGE);
    }

    CreateApplicationDerivation initialDerivation =
        deriveCreateApplications(
            normalized.applicationNumbers(),
            normalized.canViewFederalApplications(),
            normalized.exemptionTypeCode());
    errors.addAll(initialDerivation.errors());
    if (EXEMPTION_STATUS_ACTIVE.equalsIgnoreCase(normalized.exemptionStatusCode())) {
      for (String activationError :
          activationEligibilityValidator.validate(
              activationCandidate(normalized, canApproveExemption))) {
        if (!errors.contains(activationError)) {
          errors.add(activationError);
        }
      }
    } else if (errors.isEmpty()) {
      errors.addAll(
          activationEligibilityValidator.validatePersistenceReferences(
              persistenceReferenceCandidate(normalized)));
    }

    if (!errors.isEmpty()) {
      return new CreateExemptionResult(false, null, null, false, errors, warnings);
    }

    // Legacy inserted an empty parent first and silently skipped ineligible applications. Keep
    // creation all-or-nothing: every selected authoritative row is valid before the first write.
    String entryUserId = defaultSystemUser(userId);
    Optional<ExemptionDetailsRpcRepository.ExemptionInsertRow> inserted =
        repository.insertExemption(toInsertRecord(normalized, entryUserId));
    String exemptionNumber =
        inserted.map(ExemptionDetailsRpcRepository.ExemptionInsertRow::exemptionNumber).orElse(null);
    String requestedExemptionNumber = trimToNull(normalized.exemptionNumber());

    if (trimToNull(exemptionNumber) == null
        || (requestedExemptionNumber != null
            && !requestedExemptionNumber.equals(trimToNull(exemptionNumber)))) {
      markRollbackOnly();
      return new CreateExemptionResult(
          false,
          null,
          null,
          false,
          List.of("Unable to save exemption."),
          warnings);
    }

    if (!processFeeRates(
        exemptionNumber,
        normalized.enableRateOverride(),
        normalized.feeRate(),
        entryUserId)) {
      markRollbackOnly();
      return persistenceFailure(exemptionNumber, true);
    }

    CreateApplicationDerivation finalDerivation =
        deriveCreateApplications(
            normalized.applicationNumbers(),
            normalized.canViewFederalApplications(),
            normalized.exemptionTypeCode());
    if (!finalDerivation.errors().isEmpty()) {
      markRollbackOnly();
      return new CreateExemptionResult(
          false, null, exemptionNumber, true, finalDerivation.errors(), warnings);
    }

    List<String> linkErrors =
        linkCreateExemptionApplications(
            finalDerivation.applications(), exemptionNumber, entryUserId);
    if (!linkErrors.isEmpty()) {
      markRollbackOnly();
      return new CreateExemptionResult(false, null, exemptionNumber, true, linkErrors, warnings);
    }

    return new CreateExemptionResult(
        true, SAVE_SUCCESS_MESSAGE, exemptionNumber, true, List.of(), warnings);
  }

  @Override
  @Transactional
  public CreateExemptionResult updateExemption(
      UpdateExemptionRequest request, String userId, boolean canApproveExemption) {
    UpdateExemptionRequest normalized = normalizeUpdateExemptionRequest(request);
    String lookupNumber =
        trimToNull(normalized.previousExemptionNumber()) == null
            ? normalized.exemptionNumber()
            : normalized.previousExemptionNumber();
    Optional<ExemptionDetailsRpcRepository.ExemptionRecord> existing =
        repository.findExemptionRecord(lookupNumber);
    if (existing.isEmpty()) {
      return new CreateExemptionResult(
          false, null, null, false, List.of(required("existing exemption")), List.of());
    }

    ExemptionDetailsRpcRepository.ExemptionRecord current = existing.get();
    if (EXEMPTION_STATUS_EXPIRED.equalsIgnoreCase(current.exemptionStatusCode())) {
      return new CreateExemptionResult(
          false,
          null,
          current.exemptionNumber(),
          false,
          List.of("Expired exemptions are read-only."),
          List.of());
    }

    String currentStatus = normalizeCode(current.exemptionStatusCode());
    String requestedStatus = normalizeCode(normalized.exemptionStatusCode());
    if (EXEMPTION_STATUS_CANCELLED.equalsIgnoreCase(current.exemptionStatusCode())) {
      if (!EXEMPTION_STATUS_NEW.equalsIgnoreCase(requestedStatus)) {
        return new CreateExemptionResult(
            false,
            null,
            current.exemptionNumber(),
            false,
            List.of("Cancelled exemptions can only be reopened with a status of NEW."),
            List.of());
      }
    }
    String targetStatus = requestedStatus == null ? currentStatus : requestedStatus;
    if (EXEMPTION_STATUS_EXPIRED.equals(targetStatus)) {
      return new CreateExemptionResult(
          false,
          null,
          current.exemptionNumber(),
          false,
          List.of("Exemption expiry is managed by the expiry process."),
          List.of());
    }
    if (!isAllowedExemptionStatusTransition(currentStatus, targetStatus)) {
      return new CreateExemptionResult(
          false,
          null,
          current.exemptionNumber(),
          false,
          List.of(
              "Exemption status cannot change from "
                  + displayStatus(currentStatus)
                  + " to "
                  + displayStatus(targetStatus)
                  + "."),
          List.of());
    }

    ExemptionDetailsRpcRepository.ExemptionUpdateRecord updateRecord =
        toUpdateRecord(normalized, current, defaultUpdateUser(userId, current.entryUserId()));

    boolean reopeningCancelled =
        EXEMPTION_STATUS_CANCELLED.equalsIgnoreCase(current.exemptionStatusCode());
    List<String> errors = new ArrayList<>();
    validateExemptionStorage(
        updateRecord.exemptionNumber(), updateRecord.otherConditions(), errors);
    if (!reopeningCancelled) {
      errors.addAll(validateUpdateExemption(updateRecord, current));
    }
    boolean activationTransition =
        statusChangedTo(
            current.exemptionStatusCode(),
            updateRecord.exemptionStatusCode(),
            EXEMPTION_STATUS_ACTIVE);
    if (EXEMPTION_STATUS_ACTIVE.equalsIgnoreCase(updateRecord.exemptionStatusCode())) {
      errors.addAll(
          activationEligibilityValidator.validate(
              activationCandidate(
                  updateRecord, canApproveExemption, activationTransition)));
    } else if (errors.isEmpty()) {
      errors.addAll(
          activationEligibilityValidator.validatePersistenceReferences(
              persistenceReferenceCandidate(updateRecord)));
    }
    if (!errors.isEmpty()) {
      return new CreateExemptionResult(false, null, updateRecord.exemptionNumber(), false, errors, List.of());
    }

    boolean updated = repository.updateExemption(updateRecord);
    if (!updated) {
      return new CreateExemptionResult(
          false,
          "We were unable to save this exemption. Please note the time this error occurred and report to someone.",
          updateRecord.exemptionNumber(),
          false,
          List.of(),
          List.of());
    }

    if (statusChangedTo(current.exemptionStatusCode(), updateRecord.exemptionStatusCode(), EXEMPTION_STATUS_CANCELLED)) {
      if (!revertApplicationsToApproved(
          updateRecord.exemptionNumber(), updateRecord.updateUserId())) {
        markRollbackOnly();
        return persistenceFailure(updateRecord.exemptionNumber(), false);
      }
    }
    if (!reopeningCancelled
        && !processFeeRates(
            updateRecord.exemptionNumber(),
            normalized.enableRateOverride(),
            normalized.feeRate(),
            updateRecord.updateUserId())) {
      markRollbackOnly();
      return persistenceFailure(updateRecord.exemptionNumber(), false);
    }

    return new CreateExemptionResult(
        true, "The exemption was updated successfully.", updateRecord.exemptionNumber(), false, List.of(), List.of());
  }

  @Override
  public ExemptionNumberValidationResult checkExemptionNumber(String exemptionNumber) {
    String normalized = trimToNull(exemptionNumber);
    boolean valid = normalized == null || !repository.existsByExemptionNumber(normalized);
    return new ExemptionNumberValidationResult(
        valid, valid ? null : EXEMPTION_NUMBER_ASSIGNED_MESSAGE);
  }

  @Override
  @Transactional
  public ApplicationExemptionLinkResult addApplicationToExemption(
      Long applicationNumber,
      String exemptionNumber,
      String userId,
      boolean canViewFederalApplications) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    List<String> errors = new ArrayList<>();

    Optional<ExemptionDetailsRpcRepository.ExemptionRecord> targetExemption =
        repository.findExemptionRecord(normalizedExemptionNumber);
    if (targetExemption.isEmpty()) {
      return new ApplicationExemptionLinkResult(
          false, List.of(required("exemption number")));
    }
    if (EXEMPTION_STATUS_EXPIRED.equalsIgnoreCase(
        targetExemption.get().exemptionStatusCode())) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Expired exemptions are read-only."));
    }
    if (EXEMPTION_STATUS_CANCELLED.equalsIgnoreCase(
        targetExemption.get().exemptionStatusCode())) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Cancelled exemptions are read-only."));
    }

    Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> candidate =
        repository.findApplicationLinkRecord(applicationNumber);
    if (candidate.isEmpty()) {
      errors.add("Application " + displayApplicationNumber(applicationNumber) + " does not exist");
      return new ApplicationExemptionLinkResult(false, errors);
    }

    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = candidate.get();
    List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> assignedApplications =
        repository.findApplicationSummariesByExemptionNumber(normalizedExemptionNumber);
    String exemptionTypeCode = targetExemption.get().exemptionTypeCode();
    boolean oicExemption = EXEMPTION_TYPE_OIC.equalsIgnoreCase(exemptionTypeCode);

    if (!APPLICATION_STATUS_APPROVED.equalsIgnoreCase(application.applicationStatusCode())) {
      errors.add("Applications must have a status of approved.");
    } else if (trimToNull(application.exemptionNumber()) != null) {
      errors.add("This application is already assigned to an exemption.");
    } else if (repository.hasActiveValidOffers(application.applicationNumber())) {
      errors.add("Application has valid offers and cannot be added to an exemption.");
    } else if (!oicExemption && appNotPastListingDate(application)) {
      errors.add("Application listing date has not passed.");
    } else if (!oicExemption
        && applicantIdentityMismatch(
            loadAssignedApplications(assignedApplications), application)) {
      errors.add(
          "Application cannot be added to this exemption because its owner or agent client details do not match the other applications.");
    } else if (!canViewFederalApplications && JURISDICTION_FEDERAL.equalsIgnoreCase(application.exportJurisdictionCode())) {
      errors.add("Insufficient privileges to add this application.");
    } else if (JURISDICTION_RESERVE.equalsIgnoreCase(application.exportJurisdictionCode())) {
      errors.add("Insufficient privileges to add this application.");
    }

    if (!errors.isEmpty()) {
      return new ApplicationExemptionLinkResult(false, errors);
    }

    boolean updated =
        repository.updateApplicationExemption(
            new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
                application,
                normalizedExemptionNumber,
                APPLICATION_STATUS_EXEMPTED,
                defaultUpdateUser(userId, application.entryUserId())));
    return new ApplicationExemptionLinkResult(updated, updated ? List.of() : List.of("Unable to add application to exemption."));
  }

  @Override
  @Transactional
  public ApplicationExemptionLinkResult removeApplicationFromExemption(
      Long applicationNumber, String exemptionNumber, String userId) {
    String expectedExemptionNumber = trimToNull(exemptionNumber);
    Optional<ExemptionDetailsRpcRepository.ExemptionRecord> targetExemption =
        repository.findExemptionRecord(expectedExemptionNumber);
    if (targetExemption.isEmpty()) {
      return new ApplicationExemptionLinkResult(
          false, List.of(required("exemption number")));
    }
    if (EXEMPTION_STATUS_EXPIRED.equalsIgnoreCase(
        targetExemption.get().exemptionStatusCode())) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Expired exemptions are read-only."));
    }
    if (EXEMPTION_STATUS_CANCELLED.equalsIgnoreCase(
        targetExemption.get().exemptionStatusCode())) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Cancelled exemptions are read-only."));
    }

    Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> existing =
        repository.findApplicationLinkRecord(applicationNumber);
    if (existing.isEmpty()) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Application " + displayApplicationNumber(applicationNumber) + " does not exist"));
    }

    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = existing.get();
    if (expectedExemptionNumber == null
        || !expectedExemptionNumber.equals(trimToNull(application.exemptionNumber()))) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Application does not belong to the supplied exemption."));
    }
    if (!isAllowedRemovalSourceStatus(
        targetExemption.get().exemptionStatusCode(), application.applicationStatusCode())) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Application status does not allow removal from this exemption."));
    }

    List<ExemptionDetailsRpcRepository.ApplicationPermitRow> permitLinks =
        repository.findPermitsByApplicationNumberRequired(applicationNumber);
    if (permitLinks == null
        || permitLinks.stream()
            .anyMatch(row -> row == null || row.permitNumber() == null || row.permitNumber() < 1)) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Application permit relationships could not be verified."));
    }
    if (!permitLinks.isEmpty()) {
      return new ApplicationExemptionLinkResult(
          false,
          List.of(
              "Application cannot be removed from the exemption while it is linked to a permit."));
    }

    Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> refreshed =
        repository.findApplicationLinkRecord(applicationNumber);
    if (refreshed.isEmpty()
        || !expectedExemptionNumber.equals(trimToNull(refreshed.get().exemptionNumber()))
        || !isAllowedRemovalSourceStatus(
            targetExemption.get().exemptionStatusCode(),
            refreshed.get().applicationStatusCode())) {
      return new ApplicationExemptionLinkResult(
          false,
          List.of("Application changed while it was being removed from the exemption."));
    }

    ExemptionDetailsRpcRepository.ApplicationLinkRecord authoritativeApplication =
        refreshed.get();
    boolean updated =
        repository.updateApplicationExemption(
            new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
                authoritativeApplication,
                null,
                APPLICATION_STATUS_APPROVED,
                defaultUpdateUser(userId, authoritativeApplication.entryUserId())));
    return new ApplicationExemptionLinkResult(
        updated, updated ? List.of() : List.of("Unable to remove application from exemption."));
  }

  @Override
  @Transactional
  public ExemptionApprovalResult approveExemptions(
      String exemptionNumbers, String userId, boolean canApproveExemption) {
    List<String> numbers = parseCsv(exemptionNumbers);
    if (numbers.isEmpty()) {
      return new ExemptionApprovalResult(
          true, false, List.of(), "", "No exemptions were specified.", List.of(), List.of());
    }

    Map<String, String> sendGrid = new LinkedHashMap<>();
    StringBuilder errorMessage = new StringBuilder();
    for (String exemptionNumber : numbers) {
      approveSingleExemption(exemptionNumber, userId, canApproveExemption, sendGrid, errorMessage);
    }

    boolean valid = !sendGrid.isEmpty();
    return new ExemptionApprovalResult(
        true,
        valid,
        toSendGridPairs(sendGrid),
        "",
        errorMessage.toString(),
        valid ? List.of() : null,
        List.of());
  }

  @Override
  public ExemptionApprovalEmailResult sendExemptionApprovalEmail(
      String exemptionNumber, String toEmailAddress) {
    boolean sent = sendApprovalEmail(exemptionNumber, toEmailAddress);
    return new ExemptionApprovalEmailResult(
        sent, sent ? "Email queued successfully." : "There was a problem queuing the e-mail.");
  }

  @Override
  public ExemptionApprovalEmailResult sendExemptionApprovalEmails(String sendGrid) {
    Map<String, String> emailByExemption = parseSendGrid(sendGrid);
    if (emailByExemption.isEmpty()) {
      return new ExemptionApprovalEmailResult(false, "There was a problem queuing the e-mail(s).");
    }

    List<String> successes = new ArrayList<>();
    List<String> failures = new ArrayList<>();
    emailByExemption.forEach(
        (exemptionNumber, email) -> {
          if (sendApprovalEmail(exemptionNumber, email)) {
            successes.add(exemptionNumber);
          } else {
            failures.add(exemptionNumber);
          }
        });

    if (failures.isEmpty()) {
      return new ExemptionApprovalEmailResult(true, "Email(s) queued successfully.");
    }
    if (!successes.isEmpty()) {
      return new ExemptionApprovalEmailResult(
          false,
          "Email could not be queued for exemption(s): "
              + String.join(", ", failures)
              + ".");
    }
    return new ExemptionApprovalEmailResult(false, "There was a problem queuing the e-mail(s).");
  }

  private boolean sendApprovalEmail(String exemptionNumber, String toEmailAddress) {
    String normalizedNumber = trimToNull(exemptionNumber);
    boolean active =
        normalizedNumber != null
            && repository
                .findExemptionRecord(normalizedNumber)
                .map(ExemptionDetailsRpcRepository.ExemptionRecord::exemptionStatusCode)
                .map(EXEMPTION_STATUS_ACTIVE::equalsIgnoreCase)
                .orElse(false);
    if (!active) {
      return false;
    }
    // Retain the legacy request parameter for wire compatibility, but never trust it as a recipient.
    String recipient =
        normalizedNumber == null ? null : resolveClientEmail(normalizedNumber).orElse(null);
    if (!stageExemptionApprovalEmail(normalizedNumber, recipient)) {
      return false;
    }
    String applicationNumbers =
        repository.findApplicationSummariesByExemptionNumber(normalizedNumber).stream()
            .map(row -> Long.toString(row.applicationNumber()))
            .reduce((left, right) -> left + "\n" + right)
            .orElse("");
    notificationService.publish(
        new WorkflowEmailEvent.ExemptionApproval(
            normalizedNumber,
            applicationNumbers,
            recipient));
    return true;
  }

  private String resolveAttachmentTypeDescription(
      String attachmentTypeCode, Map<String, String> attachmentTypeByCode) {
    String normalizedCode = trimToNull(attachmentTypeCode);
    if (normalizedCode == null) {
      return "";
    }
    String cached = attachmentTypeByCode.get(normalizedCode);
    if (cached != null) {
      return cached;
    }
    String resolved =
        repository.findAttachmentTypeDescription(normalizedCode).orElse(normalizedCode);
    attachmentTypeByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private String normalizeDescription(String description) {
    String normalized = trimToNull(description);
    return normalized == null ? "Not on file" : normalized;
  }

  private String formatLegacyDate(LocalDate date) {
    if (date == null) {
      return "";
    }
    return date.format(LEGACY_DATE_FORMATTER);
  }

  private String formatVolume(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private boolean hasAtMostOneDecimal(Double value) {
    if (value == null) {
      return true;
    }
    return BigDecimal.valueOf(value).stripTrailingZeros().scale() <= 1;
  }

  private boolean appNotPastListingDate(ExemptionDetailsRpcRepository.ApplicationLinkRecord application) {
    if (application.exportScheduleId() == null || application.listingDate() == null) {
      return false;
    }
    LocalDate today = LexisBusinessTime.today();
    return !application.listingDate().isBefore(today);
  }

  private boolean applicantIdentityMismatch(
      List<ExemptionDetailsRpcRepository.ApplicationLinkRecord> assignedApplications,
      ExemptionDetailsRpcRepository.ApplicationLinkRecord candidate) {
    if (assignedApplications == null || assignedApplications.isEmpty() || candidate == null) {
      return false;
    }

    ApplicantIdentity expected = applicantIdentity(assignedApplications.get(0));
    return assignedApplications.stream()
            .map(this::applicantIdentity)
            .anyMatch(identity -> !expected.equals(identity))
        || !expected.equals(applicantIdentity(candidate));
  }

  private List<ExemptionDetailsRpcRepository.ApplicationLinkRecord> loadAssignedApplications(
      List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> assignedApplications) {
    if (assignedApplications == null || assignedApplications.isEmpty()) {
      return List.of();
    }

    List<ExemptionDetailsRpcRepository.ApplicationLinkRecord> applications = new ArrayList<>();
    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow summary : assignedApplications) {
      if (summary == null || summary.applicationNumber() < 1) {
        throw new DataRetrievalFailureException(
            "Exemption contains an invalid application reference.");
      }
      applications.add(
          repository
              .findApplicationLinkRecord(summary.applicationNumber())
              .orElseThrow(
                  () ->
                      new DataRetrievalFailureException(
                          "Exemption application identity could not be verified.")));
    }
    return List.copyOf(applications);
  }

  private ApplicantIdentity applicantIdentity(
      ExemptionDetailsRpcRepository.ApplicationLinkRecord application) {
    return new ApplicantIdentity(
        normalizeClientNumber(application.ownerClientNumber()),
        trimToNull(application.ownerClientLocationCode()),
        normalizeClientNumber(application.agentClientNumber()));
  }

  private CreateApplicationDerivation deriveCreateApplications(
      List<Long> requestedApplicationNumbers,
      boolean canViewFederalApplications,
      String exemptionTypeCode) {
    List<Long> applicationNumbers =
        requestedApplicationNumbers == null
            ? List.of()
            : requestedApplicationNumbers.stream()
                .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
                .distinct()
                .toList();
    if (applicationNumbers.isEmpty()) {
      return new CreateApplicationDerivation(
          List.of(), List.of(), null, null, List.of());
    }

    List<String> errors = new ArrayList<>();
    List<ExemptionDetailsRpcRepository.ApplicationLinkRecord> assignedApplications =
        new ArrayList<>();
    boolean oicExemption = EXEMPTION_TYPE_OIC.equalsIgnoreCase(exemptionTypeCode);
    BigDecimal requestedVolume = BigDecimal.ZERO;
    // Legacy guaranteed a 30-day default, even when every selected application requested less.
    long longestTermDays = LEGACY_DEFAULT_EXEMPTION_TERM_DAYS;

    for (Long applicationNumber : applicationNumbers) {
      Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> candidate =
          repository.findApplicationLinkRecord(applicationNumber);
      if (candidate.isEmpty()) {
        errors.add("Application " + displayApplicationNumber(applicationNumber) + " does not exist");
        continue;
      }

      ExemptionDetailsRpcRepository.ApplicationLinkRecord application = candidate.get();
      boolean eligible = true;
      if (!applicationNumber.equals(application.applicationNumber())) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " returned an invalid application identity.");
        eligible = false;
      } else if (!APPLICATION_STATUS_APPROVED.equalsIgnoreCase(application.applicationStatusCode())) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " must have a status of approved.");
        eligible = false;
      } else if (trimToNull(application.exemptionNumber()) != null) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " is already assigned to exemption "
                + application.exemptionNumber()
                + ".");
        eligible = false;
      } else if (repository.hasActiveValidOffers(application.applicationNumber())) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " has valid offers and cannot be added to an exemption.");
        eligible = false;
      } else if (!oicExemption && appNotPastListingDate(application)) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " listing date has not passed.");
        eligible = false;
      } else if (!oicExemption
          && applicantIdentityMismatch(assignedApplications, application)) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " cannot be added to this exemption because its owner or agent client details do not match the other applications.");
        eligible = false;
      } else if (!canViewFederalApplications
          && JURISDICTION_FEDERAL.equalsIgnoreCase(application.exportJurisdictionCode())) {
        errors.add(
            "Insufficient privileges to add application "
                + displayApplicationNumber(applicationNumber)
                + ".");
        eligible = false;
      } else if (JURISDICTION_RESERVE.equalsIgnoreCase(application.exportJurisdictionCode())) {
        errors.add(
            "Insufficient privileges to add application "
                + displayApplicationNumber(applicationNumber)
                + ".");
        eligible = false;
      } else if (!JURISDICTION_FEDERAL.equalsIgnoreCase(application.exportJurisdictionCode())
          && !JURISDICTION_PROVINCIAL.equalsIgnoreCase(application.exportJurisdictionCode())) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " returned an invalid jurisdiction.");
        eligible = false;
      }

      Long termDays = application.termDays();
      if (termDays == null || termDays <= 0 || termDays > MAX_APPLICATION_TERM_DAYS) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " returned an invalid exemption term.");
        eligible = false;
      }
      Double applicationVolume = application.exemptionApplicationVolume();
      if (applicationVolume == null
          || !Double.isFinite(applicationVolume)
          || applicationVolume <= 0.0d) {
        errors.add(
            "Application "
                + displayApplicationNumber(applicationNumber)
                + " returned an invalid requested volume.");
        eligible = false;
      }

      if (eligible) {
        assignedApplications.add(application);
        longestTermDays = Math.max(longestTermDays, termDays);
        requestedVolume = requestedVolume.add(BigDecimal.valueOf(applicationVolume));
      }
    }

    if (!errors.isEmpty()) {
      return new CreateApplicationDerivation(
          applicationNumbers, List.copyOf(assignedApplications), null, null, List.copyOf(errors));
    }

    return new CreateApplicationDerivation(
        applicationNumbers,
        List.copyOf(assignedApplications),
        // Round the complete sum once; legacy's per-row rounding was order-dependent.
        requestedVolume.setScale(1, RoundingMode.HALF_UP),
        LexisBusinessTime.today().plusDays(longestTermDays),
        List.of());
  }

  private List<String> linkCreateExemptionApplications(
      List<ExemptionDetailsRpcRepository.ApplicationLinkRecord> applications,
      String exemptionNumber,
      String userId) {
    if (applications == null || applications.isEmpty()) {
      return List.of();
    }

    List<String> errors = new ArrayList<>();
    for (ExemptionDetailsRpcRepository.ApplicationLinkRecord application : applications) {
      Long applicationNumber = application.applicationNumber();
      boolean updated =
          repository.updateApplicationExemption(
              new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
                  application,
                  exemptionNumber,
                  APPLICATION_STATUS_EXEMPTED,
                  defaultUpdateUser(userId, application.entryUserId())));
      if (!updated) {
        errors.add("Unable to add application " + displayApplicationNumber(applicationNumber) + " to exemption.");
      }
    }
    return errors;
  }

  private record CreateApplicationDerivation(
      List<Long> applicationNumbers,
      List<ExemptionDetailsRpcRepository.ApplicationLinkRecord> applications,
      BigDecimal approvedVolume,
      LocalDate expiryDate,
      List<String> errors) {}

  private record ApplicantIdentity(
      String ownerClientNumber, String ownerClientLocationCode, String agentClientNumber) {}

  private String defaultUpdateUser(String userId, String fallback) {
    String normalized = trimToNull(userId);
    return normalized == null ? trimToNull(fallback) : normalized;
  }

  private String displayApplicationNumber(Long applicationNumber) {
    return applicationNumber == null ? "" : applicationNumber.toString();
  }

  private void approveSingleExemption(
      String exemptionNumber,
      String userId,
      boolean canApproveExemption,
      Map<String, String> sendGrid,
      StringBuilder errorMessage) {
    Optional<ExemptionDetailsRpcRepository.ExemptionRecord> existing =
        repository.findExemptionRecord(exemptionNumber);
    if (existing.isEmpty()) {
      errorMessage.append("Failed to approve invalid exemption ")
          .append(exemptionNumber)
          .append(":</br>*")
          .append(required("existing exemption"))
          .append("</br>");
      return;
    }

    ExemptionDetailsRpcRepository.ExemptionRecord current = existing.get();
    if (!EXEMPTION_STATUS_NEW.equalsIgnoreCase(current.exemptionStatusCode())) {
      String currentStatus =
          Optional.ofNullable(trimToNull(current.exemptionStatusCode())).orElse("unknown");
      errorMessage.append("Failed to approve exemption ")
          .append(exemptionNumber)
          .append(": only NEW exemptions can be approved (current status: ")
          .append(currentStatus)
          .append(").</br>");
      return;
    }

    ExemptionDetailsRpcRepository.ExemptionUpdateRecord updateRecord =
        new ExemptionDetailsRpcRepository.ExemptionUpdateRecord(
            current.exemptionNumber(),
            current.exemptionNumber(),
            current.approvedVolume(),
            LexisBusinessTime.today(),
            current.expiryDate(),
            current.otherConditions(),
            current.exemptionTypeCode(),
            EXEMPTION_STATUS_ACTIVE,
            current.entryUserId(),
            current.entryTimestamp(),
            defaultUpdateUser(userId, current.entryUserId()),
            null);

    List<String> errors =
        activationEligibilityValidator.validate(
            activationCandidate(updateRecord, canApproveExemption, true));
    if (!errors.isEmpty()) {
      errorMessage.append("Failed to approve invalid exemption ")
          .append(exemptionNumber)
          .append(":</br>");
      errors.forEach(error -> errorMessage.append("*").append(error).append("</br>"));
      return;
    }

    if (repository.updateExemption(updateRecord)) {
      sendGrid.put(exemptionNumber, resolveClientEmail(exemptionNumber).orElse(""));
      return;
    }

    errorMessage.append("Failed to approve exemption ").append(exemptionNumber).append("</br>");
  }

  private Optional<String> resolveClientEmail(String exemptionNumber) {
    return repository.findApplicationSummariesByExemptionNumber(exemptionNumber).stream()
        .findFirst()
        .flatMap(row -> repository.findApplicationLinkRecord(row.applicationNumber()))
        .flatMap(this::resolveApplicationClientEmail)
        .map(value -> trimToNull(value));
  }

  private Optional<String> resolveApplicationClientEmail(
      ExemptionDetailsRpcRepository.ApplicationLinkRecord application) {
    if ("A".equalsIgnoreCase(trimToNull(application.exportApplicantTypeCode()))) {
      return clientEmailResolver.resolve(
          application.agentClientNumber(), application.agentClientLocationCode());
    }
    if ("O".equalsIgnoreCase(trimToNull(application.exportApplicantTypeCode()))) {
      return clientEmailResolver.resolve(
          application.ownerClientNumber(), application.ownerClientLocationCode());
    }
    return Optional.empty();
  }

  private boolean stageExemptionApprovalEmail(String exemptionNumber, String toEmailAddress) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return false;
    }
    if (trimToNull(toEmailAddress) == null) {
      return false;
    }
    if (repository.findApplicationSummariesByExemptionNumber(normalizedExemptionNumber).isEmpty()) {
      return false;
    }

    LOGGER.info(
        "event=lexis_exemption_email operation=stage outcome=accepted exemptionRef={}",
        fingerprint(normalizedExemptionNumber));
    return true;
  }

  private List<String> parseCsv(String rawValue) {
    String normalized = trimToNull(rawValue);
    if (normalized == null) {
      return List.of();
    }
    return List.of(normalized.split(",")).stream()
        .map(value -> trimToNull(value))
        .filter(value -> value != null)
        .distinct()
        .toList();
  }

  private Map<String, String> parseSendGrid(String sendGrid) {
    Map<String, String> emailByExemption = new LinkedHashMap<>();
    for (String entry : parseCsv(sendGrid)) {
      String[] pair = entry.split(":", 2);
      if (pair.length == 2 && trimToNull(pair[0]) != null && trimToNull(pair[1]) != null) {
        emailByExemption.put(pair[0].trim(), pair[1].trim());
      }
    }
    return emailByExemption;
  }

  private List<List<String>> toSendGridPairs(Map<String, String> sendGrid) {
    return sendGrid.entrySet().stream()
        .map(entry -> List.of(entry.getKey(), entry.getValue()))
        .toList();
  }

  private CreateExemptionRequest normalizeCreateExemptionRequest(CreateExemptionRequest input) {
    if (input == null) {
      return new CreateExemptionRequest(
          null, null, null, null, null, null, null, null, null, List.of(), false, List.of());
    }
    List<Long> applicationNumbers =
        input.applicationNumbers() == null
            ? List.of()
            : input.applicationNumbers().stream()
                .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
                .distinct()
                .toList();
    List<Long> regions =
        input.regionNumbers() == null
            ? List.of()
            : input.regionNumbers().stream()
                .distinct()
                .toList();
    return new CreateExemptionRequest(
        trimToNull(input.exemptionNumber()),
        input.approvedVolume(),
        input.approvalDate(),
        input.expiryDate(),
        input.otherConditions() == null ? "" : input.otherConditions().trim(),
        trimToNull(input.exemptionTypeCode()),
        trimToNull(input.exemptionStatusCode()),
        input.feeRate(),
        input.enableRateOverride(),
        applicationNumbers,
        input.canViewFederalApplications(),
        regions);
  }

  private List<String> validateRawApplicationNumbers(List<Long> applicationNumbers) {
    if (applicationNumbers == null) {
      return List.of();
    }
    return applicationNumbers.stream().anyMatch(value -> value == null || value < 1)
        ? List.of("Application numbers must be positive whole numbers.")
        : List.of();
  }

  private UpdateExemptionRequest normalizeUpdateExemptionRequest(UpdateExemptionRequest input) {
    if (input == null) {
      return new UpdateExemptionRequest(
          null, null, null, null, null, null, null, null, null, null, null);
    }
    List<Long> regions =
        input.regionNumbers() == null
            ? null
            : input.regionNumbers().stream()
                .distinct()
                .toList();
    return new UpdateExemptionRequest(
        trimToNull(input.exemptionNumber()),
        trimToNull(input.previousExemptionNumber()),
        input.approvedVolume(),
        input.approvalDate(),
        input.expiryDate(),
        input.otherConditions() == null ? "" : input.otherConditions().trim(),
        trimToNull(input.exemptionTypeCode()),
        trimToNull(input.exemptionStatusCode()),
        input.feeRate(),
        input.enableRateOverride(),
        regions);
  }

  private List<String> validateCreateExemption(CreateExemptionRequest request) {
    List<String> errors = new ArrayList<>();
    validateApprovedVolume(request.approvedVolume(), errors);
    String exemptionNumber = trimToNull(request.exemptionNumber());
    validateExemptionStorage(exemptionNumber, request.otherConditions(), errors);
    if (EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(request.exemptionTypeCode())
        && exemptionNumber != null) {
      errors.add("Ministerial exemption numbers must be generated by LEXIS.");
    }
    boolean oicLike =
        EXEMPTION_TYPE_OIC.equalsIgnoreCase(request.exemptionTypeCode())
            || EXEMPTION_TYPE_BOIC.equalsIgnoreCase(request.exemptionTypeCode());
    if (oicLike && exemptionNumber == null) {
      errors.add("A valid exemption number is required for an active OIC exemption.");
    }
    if (trimToNull(request.exemptionTypeCode()) == null) {
      errors.add(required("exemption type code"));
    }
    if (trimToNull(request.exemptionStatusCode()) == null) {
      errors.add(required("exemption status code"));
    } else {
      String expectedStatus = initialExemptionStatus(request.exemptionTypeCode());
      if (expectedStatus != null
          && !expectedStatus.equalsIgnoreCase(request.exemptionStatusCode())) {
        errors.add(
            EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(request.exemptionTypeCode())
                ? "Ministerial exemptions must be created with a status of NEW."
                : "OIC and Blanket OIC exemptions must be created with a status of ACT.");
      }
    }
    if (EXEMPTION_STATUS_ACTIVE.equalsIgnoreCase(request.exemptionStatusCode())
        && request.expiryDate() == null) {
      errors.add(required("expiry date"));
    }
    if (request.approvalDate() != null
        && request.expiryDate() != null
        && request.expiryDate().isBefore(request.approvalDate())) {
      errors.add("The approval date must come before the expiry.");
    }
    if (EXEMPTION_TYPE_BOIC.equalsIgnoreCase(request.exemptionTypeCode())
        && request.regionNumbers().isEmpty()) {
      errors.add(required("region"));
    }
    if (EXEMPTION_TYPE_BOIC.equalsIgnoreCase(request.exemptionTypeCode())
        && !request.applicationNumbers().isEmpty()) {
      errors.add("Blanket OIC exemptions cannot be linked to regular applications.");
    }
    validateCreateFeeOverride(request, errors);
    return errors;
  }

  private void validateCreateFeeOverride(CreateExemptionRequest request, List<String> errors) {
    if (!Boolean.TRUE.equals(request.enableRateOverride())) {
      return;
    }
    if (!EXEMPTION_TYPE_OIC.equalsIgnoreCase(request.exemptionTypeCode())
        && !EXEMPTION_TYPE_BOIC.equalsIgnoreCase(request.exemptionTypeCode())) {
      errors.add("Fee rate override is only available when creating an OIC exemption.");
      return;
    }
    Double feeRate = request.feeRate();
    if (feeRate == null
        || !Double.isFinite(feeRate)
        || feeRate <= 0.0d
        || feeRate > MAX_FEE_RATE
        || BigDecimal.valueOf(feeRate).stripTrailingZeros().scale() > 2) {
      errors.add(
          "The fee rate must be greater than 0, at most 999.99, and have no more than two decimal places.");
    }
  }

  private List<String> validateUpdateExemption(
      ExemptionDetailsRpcRepository.ExemptionUpdateRecord record,
      ExemptionDetailsRpcRepository.ExemptionRecord previous) {
    List<String> errors = validateCommonExemption(
        record.exemptionNumber(),
        record.approvedVolume(),
        record.approvalDate(),
        record.expiryDate(),
        record.exemptionTypeCode(),
        record.exemptionStatusCode(),
        record.regionNumbers());

    if (record.expiryDate() != null
        && previous.expiryDate() != null
        && !record.expiryDate().equals(previous.expiryDate())
        && !canEditExpiryDate(record.exemptionStatusCode(), record.exemptionTypeCode())) {
      errors.add("Insufficient privileges to change the expiry date of this exemption.");
    }
    return errors;
  }

  private List<String> validateCommonExemption(
      String exemptionNumber,
      Double approvedVolume,
      LocalDate approvalDate,
      LocalDate expiryDate,
      String exemptionTypeCode,
      String exemptionStatusCode,
      List<Long> regionNumbers) {
    List<String> errors = new ArrayList<>();
    if (trimToNull(exemptionNumber) == null) {
      errors.add(required("exemption number"));
    }
    validateApprovedVolume(approvedVolume, errors);
    if (trimToNull(exemptionTypeCode) == null) {
      errors.add(required("exemption type code"));
    }
    if (trimToNull(exemptionStatusCode) == null) {
      errors.add(required("exemption status code"));
    }
    if (EXEMPTION_STATUS_ACTIVE.equalsIgnoreCase(exemptionStatusCode) && expiryDate == null) {
      errors.add(required("expiry date"));
    }
    if (approvalDate != null && expiryDate != null && expiryDate.isBefore(approvalDate)) {
      errors.add("The approval date must come before the expiry.");
    }
    if (EXEMPTION_TYPE_BOIC.equalsIgnoreCase(exemptionTypeCode)
        && regionNumbers != null
        && regionNumbers.isEmpty()) {
      errors.add(required("region"));
    }
    return errors;
  }

  private void validateApprovedVolume(Double approvedVolume, List<String> errors) {
    if (approvedVolume == null || !Double.isFinite(approvedVolume) || approvedVolume <= 0.0d) {
      errors.add("The approved volume must be greater than 0");
      return;
    }
    if (approvedVolume > MAX_APPROVED_VOLUME) {
      errors.add(
          "The approved volume must be less than or equal to "
              + formatVolume(MAX_APPROVED_VOLUME)
              + ".");
    }
    if (!hasAtMostOneDecimal(approvedVolume)) {
      errors.add("The approved volume must have no more than one decimal place.");
    }
  }

  private void validateExemptionStorage(
      String exemptionNumber, String otherConditions, List<String> errors) {
    validateOracleText(
        exemptionNumber, "Exemption number", MAX_EXEMPTION_NUMBER_BYTES, errors);
    validateOracleText(
        otherConditions, "Other conditions", MAX_OTHER_CONDITIONS_BYTES, errors);
  }

  private void validateOracleText(
      String value, String description, int maxBytes, List<String> errors) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return;
    }
    if (!isUsAscii(normalized)) {
      errors.add(
          description + " contains characters the current LEXIS database cannot store.");
    } else if (normalized.length() > maxBytes) {
      errors.add(description + " must not exceed " + maxBytes + " bytes.");
    }
  }

  private boolean isUsAscii(String value) {
    return value.chars().allMatch(character -> character <= 0x7f);
  }

  private ExemptionDetailsRpcRepository.ExemptionInsertRecord toInsertRecord(
      CreateExemptionRequest request, String entryUserId) {
    return new ExemptionDetailsRpcRepository.ExemptionInsertRecord(
        request.exemptionNumber(),
        request.approvedVolume(),
        request.approvalDate(),
        request.expiryDate(),
        request.otherConditions(),
        request.exemptionTypeCode(),
        request.exemptionStatusCode(),
        entryUserId,
        request.regionNumbers());
  }

  private ExemptionActivationEligibilityValidator.ActivationCandidate activationCandidate(
      CreateExemptionRequest request, boolean canApproveExemption) {
    return new ExemptionActivationEligibilityValidator.ActivationCandidate(
        request.exemptionNumber(),
        request.approvedVolume(),
        request.approvalDate(),
        request.expiryDate(),
        request.exemptionTypeCode(),
        request.exemptionStatusCode(),
        request.regionNumbers(),
        request.applicationNumbers(),
        true,
        true,
        canApproveExemption);
  }

  private ExemptionActivationEligibilityValidator.ActivationCandidate activationCandidate(
      ExemptionDetailsRpcRepository.ExemptionUpdateRecord record,
      boolean canApproveExemption,
      boolean activationTransition) {
    return new ExemptionActivationEligibilityValidator.ActivationCandidate(
        record.exemptionNumber(),
        record.approvedVolume(),
        record.approvalDate(),
        record.expiryDate(),
        record.exemptionTypeCode(),
        record.exemptionStatusCode(),
        record.regionNumbers(),
        List.of(),
        false,
        activationTransition,
        canApproveExemption);
  }

  private ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate
      persistenceReferenceCandidate(CreateExemptionRequest request) {
    return new ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate(
        request.exemptionNumber(),
        request.exemptionTypeCode(),
        request.exemptionStatusCode(),
        request.regionNumbers());
  }

  private ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate
      persistenceReferenceCandidate(
          ExemptionDetailsRpcRepository.ExemptionUpdateRecord record) {
    return new ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate(
        record.exemptionNumber(),
        record.exemptionTypeCode(),
        record.exemptionStatusCode(),
        record.regionNumbers());
  }

  private ExemptionDetailsRpcRepository.ExemptionUpdateRecord toUpdateRecord(
      UpdateExemptionRequest request,
      ExemptionDetailsRpcRepository.ExemptionRecord previous,
      String updateUserId) {
    boolean previousCancelled = EXEMPTION_STATUS_CANCELLED.equalsIgnoreCase(previous.exemptionStatusCode());
    String exemptionNumber = Optional.ofNullable(trimToNull(request.exemptionNumber())).orElse(previous.exemptionNumber());
    String previousExemptionNumber = previous.exemptionNumber();
    String statusCode = Optional.ofNullable(trimToNull(request.exemptionStatusCode())).orElse(previous.exemptionStatusCode());

    if (previousCancelled) {
      return new ExemptionDetailsRpcRepository.ExemptionUpdateRecord(
          previous.exemptionNumber(),
          previousExemptionNumber,
          previous.approvedVolume(),
          previous.approvalDate(),
          previous.expiryDate(),
          previous.otherConditions(),
          previous.exemptionTypeCode(),
          statusCode,
          previous.entryUserId(),
          previous.entryTimestamp(),
          updateUserId,
          null);
    }

    String typeCode = Optional.ofNullable(trimToNull(request.exemptionTypeCode())).orElse(previous.exemptionTypeCode());
    LocalDate approvalDate =
        request.approvalDate() == null ? previous.approvalDate() : request.approvalDate();
    return new ExemptionDetailsRpcRepository.ExemptionUpdateRecord(
        exemptionNumber,
        previousExemptionNumber,
        request.approvedVolume() == null ? previous.approvedVolume() : request.approvedVolume(),
        approvalDate,
        request.expiryDate() == null ? previous.expiryDate() : request.expiryDate(),
        request.otherConditions() == null ? previous.otherConditions() : request.otherConditions(),
        typeCode,
        statusCode,
        previous.entryUserId(),
        previous.entryTimestamp(),
        updateUserId,
        request.regionNumbers());
  }

  private boolean revertApplicationsToApproved(String exemptionNumber, String updateUserId) {
    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow row :
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber)) {
      Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> existing =
          repository.findApplicationLinkRecord(row.applicationNumber());
      if (existing.isEmpty()) {
        return false;
      }
      if (!APPLICATION_STATUS_EXEMPTED.equalsIgnoreCase(
          existing.get().applicationStatusCode())) {
        continue;
      }
      ExemptionDetailsRpcRepository.ApplicationLinkRecord application = existing.get();
      if (!repository.updateApplicationExemption(
          new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
              application,
              application.exemptionNumber(),
              APPLICATION_STATUS_APPROVED,
              defaultUpdateUser(updateUserId, application.entryUserId())))) {
        return false;
      }
    }
    return true;
  }

  private boolean processFeeRates(
      String exemptionNumber,
      Boolean enableRateOverride,
      Double feeRate,
      String userId) {
    if (enableRateOverride == null) {
      return true;
    }
    Optional<ExemptionDetailsRpcRepository.ExemptionRateRecord> existing =
        repository.findExemptionRate(exemptionNumber);

    if (!enableRateOverride && existing.isPresent()) {
      return repository.deleteExemptionRate(exemptionNumber);
    }
    if (!enableRateOverride || feeRate == null) {
      return true;
    }

    ExemptionDetailsRpcRepository.ExemptionRateMutationRecord record =
        new ExemptionDetailsRpcRepository.ExemptionRateMutationRecord(exemptionNumber, feeRate, userId);
    if (existing.isPresent()) {
      return repository.updateExemptionRate(record);
    }
    return repository
        .insertExemptionRate(record)
        .filter(
            row ->
                java.util.Objects.equals(
                        trimToNull(row.exemptionNumber()),
                        trimToNull(record.exemptionNumber()))
                    && row.fixedExemptionRate() != null
                    && BigDecimal.valueOf(row.fixedExemptionRate())
                            .compareTo(BigDecimal.valueOf(record.fixedExemptionRate()))
                        == 0)
        .isPresent();
  }

  private CreateExemptionResult persistenceFailure(
      String exemptionNumber, boolean refreshPage) {
    return new CreateExemptionResult(
        false,
        "We were unable to save this exemption. Please note the time this error occurred and report to someone.",
        exemptionNumber,
        refreshPage,
        List.of(),
        List.of());
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Direct unit calls do not have a surrounding Spring transaction.
    }
  }

  private boolean statusChangedTo(String previousStatus, String currentStatus, String targetStatus) {
    return !targetStatus.equalsIgnoreCase(trimToNull(previousStatus))
        && targetStatus.equalsIgnoreCase(trimToNull(currentStatus));
  }

  private boolean isAllowedExemptionStatusTransition(
      String currentStatus, String targetStatus) {
    if (currentStatus == null || targetStatus == null) {
      return false;
    }
    if (EXEMPTION_STATUS_NEW.equals(currentStatus)) {
      return EXEMPTION_STATUS_NEW.equals(targetStatus)
          || EXEMPTION_STATUS_ACTIVE.equals(targetStatus)
          || EXEMPTION_STATUS_CANCELLED.equals(targetStatus);
    }
    if (EXEMPTION_STATUS_ACTIVE.equals(currentStatus)) {
      return EXEMPTION_STATUS_ACTIVE.equals(targetStatus)
          || EXEMPTION_STATUS_CANCELLED.equals(targetStatus);
    }
    return EXEMPTION_STATUS_CANCELLED.equals(currentStatus)
        && EXEMPTION_STATUS_NEW.equals(targetStatus);
  }

  private boolean isAllowedRemovalSourceStatus(
      String exemptionStatus, String applicationStatus) {
    String normalizedApplicationStatus = normalizeCode(applicationStatus);
    return APPLICATION_STATUS_EXEMPTED.equals(normalizedApplicationStatus)
        || (EXEMPTION_STATUS_NEW.equals(normalizeCode(exemptionStatus))
            && APPLICATION_STATUS_APPROVED.equals(normalizedApplicationStatus));
  }

  private String initialExemptionStatus(String exemptionTypeCode) {
    String normalizedType = normalizeCode(exemptionTypeCode);
    if (EXEMPTION_TYPE_MINISTERIAL.equals(normalizedType)) {
      return EXEMPTION_STATUS_NEW;
    }
    if (EXEMPTION_TYPE_OIC.equals(normalizedType)
        || EXEMPTION_TYPE_BOIC.equals(normalizedType)) {
      return EXEMPTION_STATUS_ACTIVE;
    }
    return null;
  }

  private String normalizeCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(java.util.Locale.ROOT);
  }

  private String displayStatus(String status) {
    return status == null ? "unknown" : status;
  }

  private boolean canEditExpiryDate(String previousStatusCode, String exemptionTypeCode) {
    if (EXEMPTION_TYPE_BOIC.equalsIgnoreCase(exemptionTypeCode)) {
      return EXEMPTION_STATUS_NEW.equalsIgnoreCase(previousStatusCode)
          || EXEMPTION_STATUS_ACTIVE.equalsIgnoreCase(previousStatusCode);
    }
    return EXEMPTION_STATUS_NEW.equalsIgnoreCase(previousStatusCode);
  }

  private String required(String fieldName) {
    return "A valid " + fieldName + " is required.";
  }
}

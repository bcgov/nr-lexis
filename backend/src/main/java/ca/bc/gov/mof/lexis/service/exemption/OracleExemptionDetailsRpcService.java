package ca.bc.gov.mof.lexis.service.exemption;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleExemptionDetailsRpcService implements ExemptionDetailsRpcService {

  private static final String JURISDICTION_FEDERAL = "F";
  private static final String JURISDICTION_RESERVE = "I";
  private static final String EXEMPTION_TYPE_OIC = "O";
  private static final String EXEMPTION_TYPE_BOIC = "B";
  private static final String EXEMPTION_TYPE_MINISTERIAL = "M";
  private static final String EXEMPTION_STATUS_ACTIVE = "ACT";
  private static final String EXEMPTION_STATUS_CANCELLED = "CAN";
  private static final String EXEMPTION_STATUS_NEW = "NEW";
  private static final String APPLICATION_STATUS_APPROVED = "APP";
  private static final String APPLICATION_STATUS_EXEMPTED = "EXE";
  private static final String EXPORT_PERMIT_STATUS_COMPLETE = "COM";
  private static final String EXPORT_PRODUCT_TYPE_UNMANUFACTURED = "T";
  private static final String EXEMPTION_NUMBER_ASSIGNED_MESSAGE =
      "* - this exemption number has already been assigned";
  private static final String SAVE_SUCCESS_MESSAGE = "The exemption was saved successfully.";
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER = DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ExemptionDetailsRpcRepository repository;

  public OracleExemptionDetailsRpcService(ExemptionDetailsRpcRepository repository) {
    this.repository = repository;
  }

  @Override
  public ExemptionApplicationsResponse getApplications(
      String exemptionNumber, boolean canViewFederalApplications, boolean canViewReserveApplications) {
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
      if (JURISDICTION_RESERVE.equalsIgnoreCase(row.jurisdictionCode())
          && !canViewReserveApplications) {
        continue;
      }

      if (blanketOic
          || (previousOwnerClientNumber != null
              && !previousOwnerClientNumber.equals(row.ownerClientNumber()))) {
        blanketOic = true;
      } else {
        previousOwnerClientNumber = blankToNull(row.ownerClientNumber());
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
  public List<PermitItem> getPermits(
      String exemptionNumber, boolean ministryUser, boolean privilegedUser, String forestClientNumber) {
    String exemptionTypeCode =
        repository.findExemptionTypeCodeByExemptionNumber(exemptionNumber).orElse("");
    boolean oicLike =
        EXEMPTION_TYPE_OIC.equalsIgnoreCase(exemptionTypeCode)
            || EXEMPTION_TYPE_BOIC.equalsIgnoreCase(exemptionTypeCode);

    return repository.findPermitsByExemptionNumber(exemptionNumber).stream()
        .map(
            row -> {
              boolean canViewPermit =
                  resolveCanViewPermit(
                      row, oicLike, ministryUser, privilegedUser, blankToNull(forestClientNumber));
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
  public List<DocumentItem> getDocumentDetails(String exemptionNumber) {
    List<ExemptionDetailsRpcRepository.DocumentRow> allDocuments = new ArrayList<>();
    allDocuments.addAll(repository.findExemptionDocumentDetailsByExemptionNumber(exemptionNumber));

    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow row :
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber)) {
      allDocuments.addAll(
          repository.findApplicationDocumentDetailsByApplicationNumber(row.applicationNumber()));
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
    return repository.deleteExemptionFile(documentId);
  }

  @Override
  public CreateExemptionResult addExemption(CreateExemptionRequest request, String userId) {
    CreateExemptionRequest normalized = normalizeCreateExemptionRequest(request);
    List<String> errors = validateCreateExemption(normalized);
    List<String> warnings = List.of();

    if (!errors.isEmpty()) {
      return new CreateExemptionResult(false, null, null, false, errors, warnings);
    }

    Optional<ExemptionDetailsRpcRepository.ExemptionInsertRow> inserted =
        repository.insertExemption(toInsertRecord(normalized, blankToNull(userId)));
    String exemptionNumber =
        inserted.map(ExemptionDetailsRpcRepository.ExemptionInsertRow::exemptionNumber).orElse(null);

    if (blankToNull(exemptionNumber) == null) {
      return new CreateExemptionResult(
          false,
          "We were unable to save this exemption. Please note the time this error occurred and report to someone.",
          null,
          false,
          List.of(),
          warnings);
    }

    return new CreateExemptionResult(
        true, SAVE_SUCCESS_MESSAGE, exemptionNumber, true, List.of(), warnings);
  }

  @Override
  public CreateExemptionResult updateExemption(
      UpdateExemptionRequest request, String userId, boolean canApproveExemption) {
    UpdateExemptionRequest normalized = normalizeUpdateExemptionRequest(request);
    String lookupNumber =
        blankToNull(normalized.exemptionNumber()) == null
            ? normalized.previousExemptionNumber()
            : normalized.exemptionNumber();
    Optional<ExemptionDetailsRpcRepository.ExemptionRecord> existing =
        repository.findExemptionRecord(lookupNumber);

    if (existing.isEmpty() && blankToNull(normalized.previousExemptionNumber()) != null) {
      existing = repository.findExemptionRecord(normalized.previousExemptionNumber());
    }
    if (existing.isEmpty()) {
      return new CreateExemptionResult(
          false, null, null, false, List.of(required("existing exemption")), List.of());
    }

    ExemptionDetailsRpcRepository.ExemptionRecord current = existing.get();
    ExemptionDetailsRpcRepository.ExemptionUpdateRecord updateRecord =
        toUpdateRecord(normalized, current, blankToNull(userId));

    List<String> errors = validateUpdateExemption(updateRecord, current, canApproveExemption);
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
      revertApplicationsToApproved(updateRecord.exemptionNumber(), updateRecord.updateUserId());
    }

    return new CreateExemptionResult(
        true, "The exemption was updated successfully.", updateRecord.exemptionNumber(), false, List.of(), List.of());
  }

  @Override
  public ExemptionNumberValidationResult checkExemptionNumber(String exemptionNumber) {
    String normalized = blankToNull(exemptionNumber);
    boolean valid = normalized == null || !repository.existsByExemptionNumber(normalized);
    return new ExemptionNumberValidationResult(
        valid, valid ? null : EXEMPTION_NUMBER_ASSIGNED_MESSAGE);
  }

  @Override
  public ApplicationExemptionLinkResult addApplicationToExemption(
      Long applicationNumber,
      String exemptionNumber,
      String userId,
      boolean canViewFederalApplications,
      boolean canViewReserveApplications) {
    String normalizedExemptionNumber = blankToNull(exemptionNumber);
    List<String> errors = new ArrayList<>();

    Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> candidate =
        repository.findApplicationLinkRecord(applicationNumber);
    if (candidate.isEmpty()) {
      errors.add("Application " + displayApplicationNumber(applicationNumber) + " does not exist");
      return new ApplicationExemptionLinkResult(false, errors);
    }

    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = candidate.get();
    Optional<String> exemptionType = repository.findExemptionTypeCodeByExemptionNumber(normalizedExemptionNumber);
    if (exemptionType.isEmpty()) {
      errors.add(required("exemption number"));
      return new ApplicationExemptionLinkResult(false, errors);
    }

    List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> assignedApplications =
        repository.findApplicationSummariesByExemptionNumber(normalizedExemptionNumber);
    String exemptionTypeCode = exemptionType.get();
    boolean oicExemption = EXEMPTION_TYPE_OIC.equalsIgnoreCase(exemptionTypeCode);

    if (!APPLICATION_STATUS_APPROVED.equalsIgnoreCase(application.applicationStatusCode())) {
      errors.add("Applications must have a status of approved.");
    } else if (blankToNull(application.exemptionNumber()) != null) {
      errors.add("This application is already assigned to an exemption.");
    } else if (repository.hasActiveValidOffers(application.applicationNumber())) {
      errors.add("Application has valid offers and cannot be added to an exemption.");
    } else if (!oicExemption && appNotPastListingDate(application)) {
      errors.add("Application listing date has not passed.");
    } else if (!oicExemption && assignedOwnerMismatch(assignedApplications, application.ownerClientNumber())) {
      errors.add("Application cannot be added to this exemption because the client number does not match.");
    } else if (!canViewFederalApplications && JURISDICTION_FEDERAL.equalsIgnoreCase(application.exportJurisdictionCode())) {
      errors.add("Insufficient privileges to add this application.");
    } else if (!canViewReserveApplications && JURISDICTION_RESERVE.equalsIgnoreCase(application.exportJurisdictionCode())) {
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
  public ApplicationExemptionLinkResult removeApplicationFromExemption(Long applicationNumber, String userId) {
    Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> existing =
        repository.findApplicationLinkRecord(applicationNumber);
    if (existing.isEmpty()) {
      return new ApplicationExemptionLinkResult(
          false, List.of("Application " + displayApplicationNumber(applicationNumber) + " does not exist"));
    }

    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = existing.get();
    boolean updated =
        repository.updateApplicationExemption(
            new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
                application,
                null,
                APPLICATION_STATUS_APPROVED,
                defaultUpdateUser(userId, application.entryUserId())));
    return new ApplicationExemptionLinkResult(
        updated, updated ? List.of() : List.of("Unable to remove application from exemption."));
  }

  private boolean resolveCanViewPermit(
      ExemptionDetailsRpcRepository.PermitSummaryRow row,
      boolean oicLike,
      boolean ministryUser,
      boolean privilegedUser,
      String forestClientNumber) {
    if (privilegedUser || ministryUser) {
      return true;
    }
    if (forestClientNumber == null) {
      return false;
    }

    boolean ownerOrAgentMatch =
        forestClientNumber.equals(row.clientNumber()) || forestClientNumber.equals(row.agentNumber());
    if (oicLike) {
      return ownerOrAgentMatch;
    }
    return ownerOrAgentMatch;
  }

  private String resolveAttachmentTypeDescription(
      String attachmentTypeCode, Map<String, String> attachmentTypeByCode) {
    String normalizedCode = blankToNull(attachmentTypeCode);
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
    String normalized = blankToNull(description);
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

  private String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private boolean appNotPastListingDate(ExemptionDetailsRpcRepository.ApplicationLinkRecord application) {
    if (application.exportScheduleId() == null || application.listingDate() == null) {
      return false;
    }
    LocalDate today = LocalDate.now(ZoneId.systemDefault());
    return !application.listingDate().isBefore(today);
  }

  private boolean assignedOwnerMismatch(
      List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> assignedApplications,
      String candidateOwnerClientNumber) {
    String normalizedCandidateOwner = blankToNull(candidateOwnerClientNumber);
    if (assignedApplications == null || assignedApplications.isEmpty() || normalizedCandidateOwner == null) {
      return false;
    }
    return assignedApplications.stream()
        .map(ExemptionDetailsRpcRepository.ApplicationSummaryRow::ownerClientNumber)
        .map(this::blankToNull)
        .filter(owner -> owner != null)
        .findFirst()
        .map(owner -> !owner.equals(normalizedCandidateOwner))
        .orElse(false);
  }

  private String defaultUpdateUser(String userId, String fallback) {
    String normalized = blankToNull(userId);
    return normalized == null ? blankToNull(fallback) : normalized;
  }

  private String displayApplicationNumber(Long applicationNumber) {
    return applicationNumber == null ? "" : applicationNumber.toString();
  }

  private CreateExemptionRequest normalizeCreateExemptionRequest(CreateExemptionRequest input) {
    if (input == null) {
      return new CreateExemptionRequest(null, null, null, null, null, null, null, List.of());
    }
    List<Long> regions =
        input.regionNumbers() == null
            ? List.of()
            : input.regionNumbers().stream()
                .filter(region -> region != null && region > 0)
                .distinct()
                .toList();
    return new CreateExemptionRequest(
        blankToNull(input.exemptionNumber()),
        input.approvedVolume(),
        input.approvalDate(),
        input.expiryDate(),
        input.otherConditions() == null ? "" : input.otherConditions().trim(),
        blankToNull(input.exemptionTypeCode()),
        blankToNull(input.exemptionStatusCode()),
        regions);
  }

  private UpdateExemptionRequest normalizeUpdateExemptionRequest(UpdateExemptionRequest input) {
    if (input == null) {
      return new UpdateExemptionRequest(null, null, null, null, null, null, null, null, List.of());
    }
    List<Long> regions =
        input.regionNumbers() == null
            ? List.of()
            : input.regionNumbers().stream()
                .filter(region -> region != null && region > 0)
                .distinct()
                .toList();
    return new UpdateExemptionRequest(
        blankToNull(input.exemptionNumber()),
        blankToNull(input.previousExemptionNumber()),
        input.approvedVolume(),
        input.approvalDate(),
        input.expiryDate(),
        input.otherConditions() == null ? "" : input.otherConditions().trim(),
        blankToNull(input.exemptionTypeCode()),
        blankToNull(input.exemptionStatusCode()),
        regions);
  }

  private List<String> validateCreateExemption(CreateExemptionRequest request) {
    List<String> errors = new ArrayList<>();
    if (blankToNull(request.exemptionNumber()) == null) {
      errors.add(required("exemption number"));
    }
    if (request.approvedVolume() == null || request.approvedVolume() <= 0.0d) {
      errors.add("The approved volume must be greater than 0");
    }
    if (blankToNull(request.exemptionTypeCode()) == null) {
      errors.add(required("exemption type code"));
    }
    if (blankToNull(request.exemptionStatusCode()) == null) {
      errors.add(required("exemption status code"));
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
    return errors;
  }

  private List<String> validateUpdateExemption(
      ExemptionDetailsRpcRepository.ExemptionUpdateRecord record,
      ExemptionDetailsRpcRepository.ExemptionRecord previous,
      boolean canApproveExemption) {
    List<String> errors = validateCommonExemption(
        record.exemptionNumber(),
        record.approvedVolume(),
        record.approvalDate(),
        record.expiryDate(),
        record.exemptionTypeCode(),
        record.exemptionStatusCode(),
        record.regionNumbers());

    if (statusChangedTo(previous.exemptionStatusCode(), record.exemptionStatusCode(), EXEMPTION_STATUS_ACTIVE)
        && !EXEMPTION_TYPE_OIC.equalsIgnoreCase(record.exemptionTypeCode())
        && !EXEMPTION_TYPE_BOIC.equalsIgnoreCase(record.exemptionTypeCode())
        && !canApproveExemption) {
      errors.add("Insufficient privileges to set this Exemption as Active.");
    }

    if (statusChangedTo(previous.exemptionStatusCode(), record.exemptionStatusCode(), EXEMPTION_STATUS_ACTIVE)
        && EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(record.exemptionTypeCode())) {
      List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> applications =
          repository.findApplicationSummariesByExemptionNumber(record.exemptionNumber());
      if (applications.isEmpty()) {
        errors.add("Active ministerial exemptions require at least one application.");
      }
    }

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
    if (blankToNull(exemptionNumber) == null) {
      errors.add(required("exemption number"));
    }
    if (approvedVolume == null || approvedVolume <= 0.0d) {
      errors.add("The approved volume must be greater than 0");
    }
    if (blankToNull(exemptionTypeCode) == null) {
      errors.add(required("exemption type code"));
    }
    if (blankToNull(exemptionStatusCode) == null) {
      errors.add(required("exemption status code"));
    }
    if (EXEMPTION_STATUS_ACTIVE.equalsIgnoreCase(exemptionStatusCode) && expiryDate == null) {
      errors.add(required("expiry date"));
    }
    if (approvalDate != null && expiryDate != null && expiryDate.isBefore(approvalDate)) {
      errors.add("The approval date must come before the expiry.");
    }
    if (EXEMPTION_TYPE_BOIC.equalsIgnoreCase(exemptionTypeCode)
        && (regionNumbers == null || regionNumbers.isEmpty())) {
      errors.add(required("region"));
    }
    return errors;
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

  private ExemptionDetailsRpcRepository.ExemptionUpdateRecord toUpdateRecord(
      UpdateExemptionRequest request,
      ExemptionDetailsRpcRepository.ExemptionRecord previous,
      String updateUserId) {
    boolean previousCancelled = EXEMPTION_STATUS_CANCELLED.equalsIgnoreCase(previous.exemptionStatusCode());
    String exemptionNumber = Optional.ofNullable(blankToNull(request.exemptionNumber())).orElse(previous.exemptionNumber());
    String previousExemptionNumber =
        Optional.ofNullable(blankToNull(request.previousExemptionNumber())).orElse(previous.exemptionNumber());
    String statusCode = Optional.ofNullable(blankToNull(request.exemptionStatusCode())).orElse(previous.exemptionStatusCode());

    if (previousCancelled) {
      return new ExemptionDetailsRpcRepository.ExemptionUpdateRecord(
          exemptionNumber,
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
          request.regionNumbers());
    }

    String typeCode = Optional.ofNullable(blankToNull(request.exemptionTypeCode())).orElse(previous.exemptionTypeCode());
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

  private void revertApplicationsToApproved(String exemptionNumber, String updateUserId) {
    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow row :
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber)) {
      repository.findApplicationLinkRecord(row.applicationNumber())
          .filter(application -> APPLICATION_STATUS_EXEMPTED.equalsIgnoreCase(application.applicationStatusCode()))
          .ifPresent(application ->
              repository.updateApplicationExemption(
                  new ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord(
                      application,
                      application.exemptionNumber(),
                      APPLICATION_STATUS_APPROVED,
                      defaultUpdateUser(updateUserId, application.entryUserId()))));
    }
  }

  private boolean statusChangedTo(String previousStatus, String currentStatus, String targetStatus) {
    return !targetStatus.equalsIgnoreCase(blankToNull(previousStatus))
        && targetStatus.equalsIgnoreCase(blankToNull(currentStatus));
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

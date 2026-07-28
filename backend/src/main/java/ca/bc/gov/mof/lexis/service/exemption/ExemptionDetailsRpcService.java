package ca.bc.gov.mof.lexis.service.exemption;

import java.io.IOException;
import java.io.OutputStream;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

public interface ExemptionDetailsRpcService {

  ExemptionApplicationsResponse getApplications(
      String exemptionNumber,
      boolean canViewFederalApplications,
      Predicate<Long> applicationAccess);

  /** Loads every application key that must be serialized for an exemption mutation. */
  List<Long> getApplicationNumbersForMutation(String exemptionNumber);

  /** Loads every direct permit key that must be serialized for an exemption mutation. */
  List<Long> getPermitNumbersForMutation(String exemptionNumber);

  List<PermitItem> getPermits(
      String exemptionNumber, Predicate<PermitAccessContext> permitAccess);

  BlanketOicTotalsResponse getBlanketOicTotals(String exemptionNumber);

  ExemptionEditContext getEditContext(String exemptionNumber);

  List<DocumentItem> getDocumentDetails(String exemptionNumber);

  Optional<DocumentStreamer> streamDocument(Long fileId);

  default boolean documentBelongsToExemption(Long documentId, String exemptionNumber) {
    return findDocumentForExemption(documentId, exemptionNumber).isPresent();
  }

  default Optional<DocumentItem> findDocumentForExemption(
      Long documentId, String exemptionNumber) {
    if (documentId == null || documentId < 1 || exemptionNumber == null || exemptionNumber.isBlank()) {
      return Optional.empty();
    }
    List<DocumentItem> matches = getDocumentDetails(exemptionNumber).stream()
        .filter(item -> documentId.equals(item.id()))
        .limit(2)
        .toList();
    return matches.size() == 1 ? Optional.of(matches.getFirst()) : Optional.empty();
  }

  default boolean documentCanBeRemovedFromExemption(
      Long documentId, String exemptionNumber) {
    if (documentId == null || documentId < 1 || exemptionNumber == null || exemptionNumber.isBlank()) {
      return false;
    }
    return findDocumentForExemption(documentId, exemptionNumber)
        .filter(DocumentItem::deletable)
        .filter(item -> "exemption".equals(item.source()))
        .filter(item -> item.sourceExemptionNumber() != null)
        .filter(item -> exemptionNumber.trim().equals(item.sourceExemptionNumber().trim()))
        .filter(item -> item.sourceApplicationNumber() == null)
        .isPresent();
  }

  boolean removeDocument(Long documentId);

  CreateExemptionPreview previewCreateExemption(
      List<Long> applicationNumbers, boolean canViewFederalApplications);

  default CreateExemptionResult addExemption(CreateExemptionRequest request, String userId) {
    return addExemption(request, userId, false);
  }

  CreateExemptionResult addExemption(
      CreateExemptionRequest request, String userId, boolean canApproveExemption);

  CreateExemptionResult updateExemption(UpdateExemptionRequest request, String userId, boolean canApproveExemption);

  ExemptionNumberValidationResult checkExemptionNumber(String exemptionNumber);

  ApplicationExemptionLinkResult addApplicationToExemption(
      Long applicationNumber,
      String exemptionNumber,
      String userId,
      boolean canViewFederalApplications);

  ApplicationExemptionLinkResult removeApplicationFromExemption(
      Long applicationNumber, String exemptionNumber, String userId);

  ExemptionApprovalResult approveExemptions(
      String exemptionNumbers, String userId, boolean canApproveExemption);

  ExemptionApprovalEmailResult sendExemptionApprovalEmail(
      String exemptionNumber, String toEmailAddress);

  ExemptionApprovalEmailResult sendExemptionApprovalEmails(String sendGrid);

  record ExemptionApplicationsResponse(
      List<ApplicationItem> applications, boolean containsUnmanu, String ownerNumber) {}

  record ApplicationItem(
      long applicationNumber,
      String requestedVolume,
      String scaleVolume,
      boolean locked,
      String jurisdiction) {}

  record PermitItem(
      long permitNumber,
      String permitVolume,
      String permitStatus,
      String permitIssueDate,
      boolean canViewPermit) {}

  record PermitAccessContext(
      long permitNumber,
      String applicantClientNumber,
      String ownerClientNumber,
      Long orgUnitNumber,
      boolean oicLike) {}

  record BlanketOicTotalsResponse(String requestedVolume, String completedVolume) {}

  record ExemptionEditContext(
      boolean rateOverrideEnabled, Double fixedFeeRate, List<Long> regionNumbers) {}

  record DocumentItem(
      long id,
      String name,
      String description,
      String type,
      String source,
      String sourceExemptionNumber,
      Long sourceApplicationNumber,
      boolean deletable) {

    public DocumentItem(long id, String name, String description, String type) {
      this(id, name, description, type, "exemption", null, null, true);
    }
  }

  @FunctionalInterface
  interface DocumentStreamer {
    void writeTo(OutputStream outputStream) throws IOException;
  }

  record ExemptionNumberValidationResult(boolean valid, String message) {}

  record CreateExemptionPreview(
      boolean valid,
      String exemptionTypeCode,
      String exemptionStatusCode,
      String approvedVolume,
      LocalDate expiryDate,
      List<Long> applicationNumbers,
      List<String> errors) {}

  record ApplicationExemptionLinkResult(boolean success, List<String> errors) {}

  record ExemptionApprovalResult(
      boolean success,
      boolean valid,
      List<List<String>> sendGrid,
      String clientEmailAddress,
      String errorMessage,
      List<String> warnings,
      List<String> errors) {}

  record ExemptionApprovalEmailResult(boolean success, String message) {}

  record CreateExemptionRequest(
      String exemptionNumber,
      Double approvedVolume,
      LocalDate approvalDate,
      LocalDate expiryDate,
      String otherConditions,
      String exemptionTypeCode,
      String exemptionStatusCode,
      Double feeRate,
      Boolean enableRateOverride,
      List<Long> applicationNumbers,
      boolean canViewFederalApplications,
      List<Long> regionNumbers) {}

  record UpdateExemptionRequest(
      String exemptionNumber,
      String previousExemptionNumber,
      Double approvedVolume,
      LocalDate approvalDate,
      LocalDate expiryDate,
      String otherConditions,
      String exemptionTypeCode,
      String exemptionStatusCode,
      Double feeRate,
      Boolean enableRateOverride,
      List<Long> regionNumbers) {}

  record CreateExemptionResult(
      boolean success,
      String message,
      String exemptionNumber,
      boolean refreshPage,
      List<String> errors,
      List<String> warnings) {}
}

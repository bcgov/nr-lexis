package ca.bc.gov.mof.lexis.service.exemption;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ExemptionDetailsRpcService {

  ExemptionApplicationsResponse getApplications(
      String exemptionNumber, boolean canViewFederalApplications, boolean canViewReserveApplications);

  List<PermitItem> getPermits(
      String exemptionNumber, boolean ministryUser, boolean privilegedUser, String forestClientNumber);

  BlanketOicTotalsResponse getBlanketOicTotals(String exemptionNumber);

  List<DocumentItem> getDocumentDetails(String exemptionNumber);

  Optional<DocumentContent> getDocument(Long fileId);

  boolean removeDocument(Long documentId);

  CreateExemptionResult addExemption(CreateExemptionRequest request, String userId);

  CreateExemptionResult updateExemption(UpdateExemptionRequest request, String userId, boolean canApproveExemption);

  ExemptionNumberValidationResult checkExemptionNumber(String exemptionNumber);

  ApplicationExemptionLinkResult addApplicationToExemption(
      Long applicationNumber,
      String exemptionNumber,
      String userId,
      boolean canViewFederalApplications,
      boolean canViewReserveApplications);

  ApplicationExemptionLinkResult removeApplicationFromExemption(Long applicationNumber, String userId);

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

  record BlanketOicTotalsResponse(String requestedVolume, String completedVolume) {}

  record DocumentItem(long id, String name, String description, String type) {}

  record DocumentContent(byte[] bytes) {}

  record ExemptionNumberValidationResult(boolean valid, String message) {}

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
      boolean canViewReserveApplications,
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

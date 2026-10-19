package ca.bc.gov.mof.lexis.service.permit;

import java.io.IOException;
import java.io.OutputStream;
import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAllScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCoreTabsRpcResponseDto;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;

public interface PermitDetailsRpcService {

  PermitSummaryRpcResponseDto getPermitSummary(
      Long permitNumber,
      String countryCode,
      String applicationDate,
      String packageNumber,
      boolean ministryUser);

  PermitTotalFeesRpcResponseDto getTotalFeesForPermit(
      Long permitNumber,
      String countryCode,
      String applicationDate);

  PermitScaleFeesRpcResponseDto getScaleFeesForPackage(
      String packageNumber,
      Long permitNumber,
      boolean ministryUser);

  PermitAllScaleFeesRpcResponseDto getAllScaleFees(Long permitNumber, boolean ministryUser);

  PermitEditContext getEditContext(Long permitNumber);

  PermitScalesForPackageRpcResponseDto getScalesForPackage(String packageNumber);

  PermitPackageVolumeSumRpcResponseDto getPackageVolumeSum(Long permitNumber, String packageNumber);

  PermitPackageInfoRpcResponseDto getPackageInfo(String packageNumber);

  PermitPackageDetailsRpcResponseDto getPackageDetails(String packageNumber);

  PermitPackageListRpcResponseDto getPackageList(Long permitNumber);

  PermitPackageListRpcResponseDto getOicPackageList(Long permitNumber);

  PermitHasApplicationsRpcResponseDto getPermitHasApplications(Long permitNumber);

  PermitCountryListRpcResponseDto getCountryList();

  PermitApplicationListRpcResponseDto getApplicationList(
      Long permitNumber, Predicate<Long> applicationAccess);

  PermitCoreTabsRpcResponseDto getCoreTabs(
      Long permitNumber,
      boolean blanketOic,
      Predicate<ApplicationAccessContextDto> applicationAccess);

  PermitAvailableApplicationListRpcResponseDto getAvailableApplicationList(
      String exemptionNumber,
      String selectedApplicationsCsv,
      Predicate<Long> applicationAccess);

  PermitApprovedExemptionVolumeRpcResponseDto getApprovedExemptionVolume(String exemptionNumber);

  PermitExemptionVolumeRemainingRpcResponseDto getExemptionVolumeRemaining(String exemptionNumber);

  List<PermitGbmsInvoiceHistoryItemRpcResponseDto> getGbmsInvoiceHistory(
      String receiptNumber, Long permitNumber, boolean readOnlyUser);

  PermitMutationRpcResponseDto createPermitFromExemption(
      String exemptionNumber, String userId);

  PermitMutationRpcResponseDto addPermit(PermitMutationRequestDto request, String userId);

  PermitMutationRpcResponseDto updatePermit(PermitMutationRequestDto request, String userId);

  /**
   * Updates the permit as {@link #updatePermit} does, and also adds an agent to a Blanket OIC
   * permit that has none or removes its saved agent when the request submits a blank agent.
   */
  PermitMutationRpcResponseDto updatePermitWithAgentChange(
      PermitMutationRequestDto request, String userId);

  PermitMutationRpcResponseDto updateShipping(PermitMutationRequestDto request, String userId);

  /** The ministry context must come from authenticated roles, never submitted form fields. */
  PermitMutationRpcResponseDto updateShipping(
      PermitMutationRequestDto request, String userId, boolean ministryUser);

  String getExemptionNumberForPermitMutation(Long permitNumber);

  PermitMutationClientScope getClientScopeForPermitMutation(Long permitNumber);

  List<Long> getApplicationNumbersForPermitMutation(Long permitNumber);

  /** Identifies only the stored internal Blanket OIC child application of the permit. */
  default boolean isHiddenApplicationForPermitMutation(Long permitNumber, Long applicationNumber) {
    return false;
  }

  List<Long> getApplicationNumbersForExemptionMutation(String exemptionNumber);

  Optional<Long> getApplicationNumberForScaleMutation(String scaleDetailId);

  PermitRequestEmailDefaults getRequestPermitEmailDefaults(Long permitNumber);

  PermitEmailResult sendRequestPermitEmail(
      Long permitNumber, String copyToAddress, String userId);

  Optional<String> getApprovalPermitEmailDefault(Long permitNumber);

  PermitEmailResult sendApprovalPermitEmail(Long permitNumber, String clientEmailAddress);

  PermitPersistenceRpcResponseDto updateScaleAttachment(
      String scaleDetailId, Long permitNumber, boolean attachInd, String userId);

  PermitPersistenceRpcResponseDto updateScaleSelection(
      Long permitNumber, List<String> includedScaleIds, List<String> excludedScaleIds, String userId);

  PermitPersistenceRpcResponseDto addApplicationsToPermit(
      Long permitNumber, String selectedApplicationsCsv, String userId);

  PermitPersistenceRpcResponseDto removeApplicationFromPermit(
      Long permitNumber, Long applicationNumber, String userId);

  PermitPersistenceRpcResponseDto addBlanketOicScale(
      Long permitNumber,
      String packageNumber,
      String timberMark,
      String scaleVolume,
      Long scalePieces,
      String speciesCode,
      String gradeCode,
      String userId);

  PermitPersistenceRpcResponseDto deleteBlanketOicScale(
      String scaleDetailId, Long permitNumber, String userId);

  boolean hasFormChanges(PermitMutationRequestDto request);

  List<PermitDocumentItemRpcResponseDto> getDocumentDetails(Long permitNumber);

  Optional<DocumentStreamer> streamDocument(Long fileId);

  default boolean documentBelongsToPermit(Long documentId, Long permitNumber) {
    return findDocumentForPermit(documentId, permitNumber).isPresent();
  }

  default Optional<PermitDocumentItemRpcResponseDto> findDocumentForPermit(
      Long documentId, Long permitNumber) {
    if (documentId == null || documentId < 1 || permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    List<PermitDocumentItemRpcResponseDto> matches = getDocumentDetails(permitNumber).stream()
        .filter(item -> documentId.equals(item.id()))
        .limit(2)
        .toList();
    return matches.size() == 1 ? Optional.of(matches.getFirst()) : Optional.empty();
  }

  default boolean packageBelongsToPermit(String packageNumber, Long permitNumber) {
    if (packageNumber == null
        || packageNumber.isBlank()
        || permitNumber == null
        || permitNumber < 1) {
      return false;
    }
    String normalized = packageNumber.trim();
    PermitPackageListRpcResponseDto packages = getPackageList(permitNumber);
    if (packages != null
        && packages.packageList() != null
        && packages.packageList().stream().anyMatch(normalized::equals)) {
      return true;
    }
    PermitPackageListRpcResponseDto oicPackages = getOicPackageList(permitNumber);
    return oicPackages != null
        && oicPackages.packageList() != null
        && oicPackages.packageList().stream().anyMatch(normalized::equals);
  }

  boolean removePermitDocument(Long documentId);

  Optional<Long> getApplicationNumberForDocumentMutation(
      Long documentId, Long permitNumber);

  boolean removeApplicationDocument(Long documentId);

  boolean removeInvoiceDocument(Long documentId);

  /** Interior permits always show a receipt number, which completion requires. */
  record PermitEditContext(
      boolean overrideEnabled, String overrideFee, String overrideComment, boolean interior) {}

  record PermitMutationClientScope(String ownerClientNumber, String agentClientNumber) {}

  /** The regional office the review request goes to, and the suggested copy recipient. */
  record PermitRequestEmailDefaults(String regionalEmailAddress, String copyToEmailAddress) {}

  @FunctionalInterface
  interface DocumentStreamer {
    void writeTo(OutputStream outputStream) throws IOException;
  }

  record PermitEmailResult(boolean success, String message, String permitRequestDate) {
    public PermitEmailResult(boolean success, String message) {
      this(success, message, null);
    }
  }
}

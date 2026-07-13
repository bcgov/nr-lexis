package ca.bc.gov.mof.lexis.service.permit;

import java.io.IOException;
import java.io.OutputStream;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import java.math.BigDecimal;
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

  PermitEditContext getEditContext(Long permitNumber);

  PermitScalesForPackageRpcResponseDto getScalesForPackage(String packageNumber);

  PermitDataAfterScaleUpdateRpcResponseDto getPermitDataAfterScaleUpdate(Long permitNumber);

  PermitPackageVolumeSumRpcResponseDto getPackageVolumeSum(Long permitNumber, String packageNumber);

  PermitPackageInfoRpcResponseDto getPackageInfo(String packageNumber);

  PermitPackageDetailsRpcResponseDto getPackageDetails(String packageNumber);

  PermitPackageListRpcResponseDto getPackageList(Long permitNumber);

  PermitPackageListRpcResponseDto getOicPackageList(Long permitNumber);

  PermitHasApplicationsRpcResponseDto getPermitHasApplications(Long permitNumber);

  PermitCountryListRpcResponseDto getCountryList();

  PermitNumberAvailabilityRpcResponseDto checkPermitNumber(Long permitNumber);

  PermitApplicationListRpcResponseDto getApplicationList(
      Long permitNumber, Predicate<Long> applicationAccess);

  PermitAvailableApplicationListRpcResponseDto getAvailableApplicationList(
      String exemptionNumber,
      String selectedApplicationsCsv,
      Predicate<Long> applicationAccess);

  PermitAvailablePackageListRpcResponseDto getAvailablePackageList(
      String exemptionNumber,
      String selectedPackagesCsv,
      Predicate<Long> applicationAccess);

  PermitApprovedExemptionVolumeRpcResponseDto getApprovedExemptionVolume(String exemptionNumber);

  PermitExemptionVolumeRemainingRpcResponseDto getExemptionVolumeRemaining(String exemptionNumber);

  List<PermitGbmsInvoiceHistoryItemRpcResponseDto> getGbmsInvoiceHistory(
      String receiptNumber, Long permitNumber, boolean readOnlyUser);

  PermitPersistenceRpcResponseDto addInvoice(
      Long permitNumber,
      String salesInvoiceNumber,
      BigDecimal invoiceExportValue,
      BigDecimal invoiceConversionRate,
      BigDecimal invoiceFeeInLieu,
      String userId);

  PermitMutationRpcResponseDto createPermitFromExemption(
      String exemptionNumber, String userId);

  PermitMutationRpcResponseDto addPermit(PermitMutationRequestDto request, String userId);

  PermitMutationRpcResponseDto updatePermit(PermitMutationRequestDto request, String userId);

  PermitMutationRpcResponseDto updateShipping(PermitMutationRequestDto request, String userId);

  String getExemptionNumberForPermitMutation(Long permitNumber);

  List<Long> getApplicationNumbersForPermitMutation(Long permitNumber);

  List<Long> getApplicationNumbersForExemptionMutation(String exemptionNumber);

  Optional<Long> getApplicationNumberForScaleMutation(String scaleDetailId);

  PermitEmailResult sendRequestPermitEmail(
      Long permitNumber, String copyToAddress, String userId);

  PermitEmailResult sendApprovalPermitEmail(Long permitNumber, String clientEmailAddress);

  PermitPersistenceRpcResponseDto updateScaleAttachment(
      String scaleDetailId, Long permitNumber, boolean attachInd, String userId);

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

  PermitInvoiceListRpcResponseDto getInvoicesForPermit(Long permitNumber);

  PermitInvoiceDetailsRpcResponseDto getInvoiceDetails(Long permitNumber, String salesInvoiceNumber);

  PermitConversionRateRpcResponseDto getConversionRate();

  List<PermitFileTypeRpcResponseDto> getFileTypes();

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

  record PermitEditContext(boolean overrideEnabled, String overrideFee, String overrideComment) {}

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

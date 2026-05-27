package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import java.util.List;
import java.util.Optional;

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

  PermitDataAfterScaleUpdateRpcResponseDto getPermitDataAfterScaleUpdate(Long permitNumber);

  PermitPackageVolumeSumRpcResponseDto getPackageVolumeSum(Long permitNumber, String packageNumber);

  PermitPackageInfoRpcResponseDto getPackageInfo(String packageNumber);

  PermitPackageDetailsRpcResponseDto getPackageDetails(String packageNumber);

  PermitPackageListRpcResponseDto getPackageList(Long permitNumber);

  PermitHasApplicationsRpcResponseDto getPermitHasApplications(Long permitNumber);

  PermitCountryListRpcResponseDto getCountryList();

  PermitNumberAvailabilityRpcResponseDto checkPermitNumber(Long permitNumber);

  PermitApplicationListRpcResponseDto getApplicationList(Long permitNumber);

  PermitAvailableApplicationListRpcResponseDto getAvailableApplicationList(
      String exemptionNumber, String selectedApplicationsCsv);

  PermitAvailablePackageListRpcResponseDto getAvailablePackageList(
      String exemptionNumber, String selectedPackagesCsv);

  PermitInvoiceListRpcResponseDto getInvoicesForPermit(Long permitNumber);

  PermitInvoiceDetailsRpcResponseDto getInvoiceDetails(Long permitNumber, String salesInvoiceNumber);

  PermitConversionRateRpcResponseDto getConversionRate();

  List<PermitFileTypeRpcResponseDto> getFileTypes();

  List<PermitDocumentItemRpcResponseDto> getDocumentDetails(Long permitNumber);

  Optional<DocumentContent> getDocument(Long fileId);

  boolean removePermitDocument(Long documentId);

  boolean removeApplicationDocument(Long documentId);

  boolean removeInvoiceDocument(Long documentId);

  record DocumentContent(byte[] bytes) {}
}

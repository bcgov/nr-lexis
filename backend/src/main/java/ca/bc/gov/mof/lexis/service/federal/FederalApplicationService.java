package ca.bc.gov.mof.lexis.service.federal;

import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationRemarkDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface FederalApplicationService {

  FederalApplicationSearchOptionsDto searchOptions();

  FederalApplicationSearchResponseDto search(FederalApplicationSearchCriteria criteria);

  default FederalApplicationSearchResponseDto search(
      FederalApplicationSearchCriteria criteria, Integer knownTotal) {
    return search(criteria);
  }

  int count(FederalApplicationSearchCriteria criteria);

  Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber);

  Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(Long applicationNumber);

  Optional<List<FederalApplicationRemarkDto>> findRemarksByApplicationNumber(
      Long applicationNumber);

  boolean verifyApplicationClients(List<Long> applicationNumbers);

  FederalMutationResult addPermit(
      Long applicationNumber, FederalPermitMutationRequest request, String userId);

  FederalMutationResult updatePermit(
      Long applicationNumber, FederalPermitMutationRequest request, String userId);

  FederalMutationResult updateStatus(
      Long applicationNumber, FederalStatusMutationRequest request, String userId);

  FederalRemarkMutationResult addRemark(
      Long applicationNumber, FederalRemarkMutationRequest request, String userId);

  FederalRemarkMutationResult updateRemark(
      Long applicationNumber,
      Long remarkId,
      FederalRemarkMutationRequest request,
      String userId);

  record FederalPermitMutationRequest(
      Long permitNumber,
      LocalDate permitIssueDate,
      String destinationCountry,
      String transportType,
      String transportName,
      LocalDate shippingDate,
      String portOfExport,
      String otherPortOfExport) {}

  record FederalStatusMutationRequest(String statusCode, String remark) {}

  record FederalRemarkMutationRequest(String remark) {}

  record FederalRemarkMutationResult(
      boolean success,
      String message,
      FederalApplicationRemarkDto remark,
      List<String> errors) {}

  record FederalMutationResult(
      boolean success,
      String message,
      FederalApplicationPermitDto permit,
      List<String> errors) {}
}

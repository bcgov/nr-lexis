package ca.bc.gov.mof.lexis.service.reserve;

import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import java.util.Optional;

public interface IndianReservePermitService {

  IndianReservePermitSearchOptionsDto searchOptions();

  IndianReservePermitSearchResponseDto search(IndianReservePermitSearchCriteria criteria);

  int count(IndianReservePermitSearchCriteria criteria);

  Optional<IndianReservePermitDetailDto> findByPermitNumber(String permitNumber);

  PermitMutationRpcResponseDto addPermit(CreatePermitRequest request, String userId);

  record CreatePermitRequest(
      String permitNumber,
      String packageNumber,
      String clientNumber,
      String applicationDate,
      String permitIssueDate,
      String estimatedShippingDate,
      String destinationCountry,
      String transportTypeCode,
      String transportName,
      String portOfExport,
      String remarks) {}
}

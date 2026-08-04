package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import java.util.List;
import java.util.Optional;

public interface PermitService {

  PermitSearchOptionsDto searchOptions();

  PermitSearchResponseDto search(PermitSearchCriteria criteria);

  default PermitSearchResponseDto search(PermitSearchCriteria criteria, Integer knownTotal) {
    return search(criteria);
  }

  int count(PermitSearchCriteria criteria);

  Optional<PermitDetailDto> findByPermitNumber(Long permitNumber);

  Optional<PermitAccessDto> findAccessByPermitNumber(Long permitNumber);

  boolean hasLinkedProvincialApplicationForClient(Long permitNumber, String clientNumber);

  List<Long> findLinkedApplicationNumbers(Long permitNumber);
}

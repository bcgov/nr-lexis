package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import java.util.Optional;

public interface PermitService {

  PermitSearchOptionsDto searchOptions();

  PermitSearchResponseDto search(PermitSearchCriteria criteria);

  int count(PermitSearchCriteria criteria);

  Optional<PermitDetailDto> findByPermitNumber(Long permitNumber);
}

package ca.bc.gov.mof.lexis.service.reserve;

import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import java.util.Optional;

public interface IndianReservePermitService {

  IndianReservePermitSearchOptionsDto searchOptions();

  IndianReservePermitSearchResponseDto search(IndianReservePermitSearchCriteria criteria);

  Optional<IndianReservePermitDetailDto> findByPermitNumber(String permitNumber);
}

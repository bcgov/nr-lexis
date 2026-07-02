package ca.bc.gov.mof.lexis.service.exemption;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import java.util.Optional;

public interface ExemptionService {

  ExemptionSearchOptionsDto searchOptions();

  ExemptionSearchResponseDto search(ExemptionSearchCriteria criteria);

  default ExemptionSearchResponseDto search(ExemptionSearchCriteria criteria, Integer knownTotal) {
    return search(criteria);
  }

  int count(ExemptionSearchCriteria criteria);

  Optional<ExemptionDetailDto> findByExemptionNumber(String exemptionNumber);
}

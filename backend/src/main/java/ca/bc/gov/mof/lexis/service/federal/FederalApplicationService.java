package ca.bc.gov.mof.lexis.service.federal;

import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import java.util.List;
import java.util.Optional;

public interface FederalApplicationService {

  FederalApplicationSearchOptionsDto searchOptions();

  FederalApplicationSearchResponseDto search(FederalApplicationSearchCriteria criteria);

  int count(FederalApplicationSearchCriteria criteria);

  Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber);

  Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(Long applicationNumber);

  boolean verifyApplicationClients(List<Long> applicationNumbers);
}

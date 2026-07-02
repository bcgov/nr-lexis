package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import java.util.List;
import java.util.Optional;

public interface LexisApplicationService {

  LexisApplicationSearchOptionsDto searchOptions();

  LexisApplicationSearchResponseDto search(LexisApplicationSearchCriteria criteria);

  default LexisApplicationSearchResponseDto search(
      LexisApplicationSearchCriteria criteria, Integer knownTotal) {
    return search(criteria);
  }

  int count(LexisApplicationSearchCriteria criteria);

  Optional<LexisApplicationDetailDto> findByApplicationNumber(long applicationNumber);

  Optional<LexisPackageLookupDto> findPackageByPackageNumber(String packageNumber);

  boolean verifyApplicationClients(List<Long> applicationNumbers);

  boolean hasValidOffer(List<Long> applicationNumbers);
}

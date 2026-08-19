package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSummaryEnrichmentDto;
import java.util.List;
import java.util.Map;
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

  default Map<Long, LexisApplicationSummaryEnrichmentDto>
      findSummaryEnrichmentByApplicationNumbers(List<Long> applicationNumbers) {
    return Map.of();
  }

  Optional<ApplicationAccessContextDto> findAccessByApplicationNumber(long applicationNumber);

  Optional<LexisPackageLookupDto> findPackageByPackageNumber(String packageNumber);

  boolean verifyApplicationClients(List<Long> applicationNumbers);

  boolean hasValidOffer(List<Long> applicationNumbers);
}

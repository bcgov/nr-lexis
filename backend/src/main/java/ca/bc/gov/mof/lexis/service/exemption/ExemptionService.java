package ca.bc.gov.mof.lexis.service.exemption;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSummaryLookupDto;
import java.util.Map;
import java.util.Optional;
import java.util.List;

public interface ExemptionService {

  ExemptionSearchOptionsDto searchOptions();

  ExemptionSearchResponseDto search(ExemptionSearchCriteria criteria);

  default ExemptionSearchResponseDto search(ExemptionSearchCriteria criteria, Integer knownTotal) {
    return search(criteria);
  }

  int count(ExemptionSearchCriteria criteria);

  Map<String, ExemptionSummaryLookupDto> findSummaryLookups(
      List<String> exemptionNumbers);

  Optional<ExemptionDetailDto> findByExemptionNumber(String exemptionNumber);

  Optional<ExemptionAccessDto> findAccessByExemptionNumber(String exemptionNumber);

  boolean hasLinkedProvincialApplicationForClient(
      String exemptionNumber, String clientNumber);

  default List<Long> findOrgUnitNumbers(String exemptionNumber) {
    return List.of();
  }
}

package ca.bc.gov.mof.lexis.repository.exemption;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ExemptionRepository {

  public List<CodeNameDto> loadExemptionTypeOptions() {
    // TODO: Port legacy code-list retrieval used by ExemptionSearchAction session helpers.
    return List.of();
  }

  public List<CodeNameDto> loadExemptionStatusOptions() {
    // TODO: Port legacy exemption status code retrieval.
    return List.of();
  }

  public List<CodeNameDto> loadRegionOptions() {
    // TODO: Port legacy region lookup used by LEXIS search forms.
    return List.of();
  }

  public List<ExemptionSearchResultDto> search(ExemptionSearchCriteria criteria) {
    // TODO: Port legacy ExemptionSearchAction + Search object behavior to Oracle/JDBC.
    return List.of();
  }

  public Optional<ExemptionDetailDto> findByExemptionNumber(String exemptionNumber) {
    // TODO: Port legacy ExemptionDetailsAction view/load behavior to Oracle/JDBC.
    return Optional.empty();
  }
}

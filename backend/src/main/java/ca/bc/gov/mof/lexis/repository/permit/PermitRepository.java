package ca.bc.gov.mof.lexis.repository.permit;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PermitRepository {

  public List<CodeNameDto> loadPermitStatusOptions() {
    // TODO: Port permit status code lookup used by ProvincialPermitSearchAction session helpers.
    return List.of();
  }

  public List<CodeNameDto> loadRegionOptions() {
    // TODO: Port search-region lookup used by ProvincialPermitSearchAction.
    return List.of();
  }

  public List<PermitSearchResultDto> search(PermitSearchCriteria criteria) {
    // TODO: Port legacy ProvincialPermitSearchAction + OracleProvincialPermitDetailDAO search behavior.
    return List.of();
  }

  public Optional<PermitDetailDto> findByPermitNumber(Long permitNumber) {
    // TODO: Port legacy ProvincialPermitDetailsAction + OracleProvincialPermitDetailDAO detail behavior.
    return Optional.empty();
  }
}

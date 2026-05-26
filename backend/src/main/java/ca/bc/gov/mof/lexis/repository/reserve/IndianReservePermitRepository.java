package ca.bc.gov.mof.lexis.repository.reserve;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class IndianReservePermitRepository {

  public List<CodeNameDto> loadApplicationStatusOptions() {
    // TODO: Port Indian Reserve application status lookup used by legacy search view setup.
    return List.of();
  }

  public List<CodeNameDto> loadExemptionTypeOptions() {
    // TODO: Port Indian Reserve exemption-type lookup used by legacy search view setup.
    return List.of();
  }

  public List<IndianReservePermitSearchResultDto> search(IndianReservePermitSearchCriteria criteria) {
    // TODO: Port IndianReserve PermitSearchAction + legacy Search object behavior to Oracle/JDBC.
    return List.of();
  }

  public Optional<IndianReservePermitDetailDto> findByPermitNumber(String permitNumber) {
    // TODO: Port IndianReserve PermitDetailsAction view/load behavior to Oracle/JDBC.
    return Optional.empty();
  }
}

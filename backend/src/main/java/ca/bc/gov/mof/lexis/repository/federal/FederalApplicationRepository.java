package ca.bc.gov.mof.lexis.repository.federal;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class FederalApplicationRepository {

  public List<CodeNameDto> loadApplicationStatusOptions() {
    // TODO: Port federal application status code lookup from Federal ApplicationSearchAction setup.
    return List.of();
  }

  public List<CodeNameDto> loadFederalExemptionTypeOptions() {
    // TODO: Port federal exemption-type lookup from LexisSessionUtils federal search setup.
    return List.of();
  }

  public List<FederalApplicationSearchResultDto> search(FederalApplicationSearchCriteria criteria) {
    // TODO: Port Federal ApplicationSearchAction + legacy Search object behavior to Oracle/JDBC.
    return List.of();
  }

  public Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    // TODO: Port Federal ApplicationDetailsAction view/load behavior to Oracle/JDBC.
    return Optional.empty();
  }

  public Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(Long applicationNumber) {
    // TODO: Port Federal ApplicationDetailsAction permit lookup behavior to Oracle/JDBC.
    return Optional.empty();
  }

  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    // TODO: Port Federal ApplicationSearchAction verifyApplicationClients behavior.
    return false;
  }
}

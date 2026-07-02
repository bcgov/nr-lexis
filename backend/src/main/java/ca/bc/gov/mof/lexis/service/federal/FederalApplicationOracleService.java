package ca.bc.gov.mof.lexis.service.federal;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class FederalApplicationOracleService implements FederalApplicationService {

  private final FederalApplicationRepository repository;

  public FederalApplicationOracleService(FederalApplicationRepository repository) {
    this.repository = repository;
  }

  @Override
  public FederalApplicationSearchOptionsDto searchOptions() {
    return new FederalApplicationSearchOptionsDto(
        safeList(repository.loadApplicationStatusOptions()),
        safeList(repository.loadFederalExemptionTypeOptions()));
  }

  @Override
  public FederalApplicationSearchResponseDto search(FederalApplicationSearchCriteria criteria) {
    return search(criteria, null);
  }

  @Override
  public FederalApplicationSearchResponseDto search(
      FederalApplicationSearchCriteria criteria, Integer knownTotal) {
    FederalApplicationSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<FederalApplicationSearchResultDto> searchPage =
        knownTotal == null ? repository.search(normalized) : repository.search(normalized, knownTotal);
    List<FederalApplicationSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.getContent());

    return new FederalApplicationSearchResponseDto(
        results,
        searchPage == null ? 0 : (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(FederalApplicationSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findByApplicationNumber(applicationNumber);
  }

  @Override
  public Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findPermitByApplicationNumber(applicationNumber);
  }

  @Override
  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    List<Long> validNumbers = positiveDistinctLongs(applicationNumbers);
    if (validNumbers.isEmpty()) {
      return false;
    }
    return repository.verifyApplicationClients(validNumbers);
  }

  private FederalApplicationSearchCriteria normalizeCriteria(FederalApplicationSearchCriteria input) {
    if (input == null) {
      return new FederalApplicationSearchCriteria(
          null, null, null, null, null, null, null, null, null, null, 0, 25);
    }

    return new FederalApplicationSearchCriteria(
        trimToNull(input.federalApplicationNumber()),
        trimToNull(input.packageNumber()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.applicationStatus()),
        input.receivedFromDate(),
        input.receivedToDate(),
        input.listingFromDate(),
        input.listingToDate(),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.agentClientNumber()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

}

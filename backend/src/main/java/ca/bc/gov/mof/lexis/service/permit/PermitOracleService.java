package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import org.springframework.data.domain.Page;
import ca.bc.gov.mof.lexis.repository.permit.PermitRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class PermitOracleService implements PermitService {

  private final PermitRepository repository;

  public PermitOracleService(PermitRepository repository) {
    this.repository = repository;
  }

  @Override
  public PermitSearchOptionsDto searchOptions() {
    return new PermitSearchOptionsDto(
        safeList(repository.loadPermitStatusOptions()),
        safeList(repository.loadRegionOptions()));
  }

  @Override
  public PermitSearchResponseDto search(PermitSearchCriteria criteria) {
    return search(criteria, null);
  }

  @Override
  public PermitSearchResponseDto search(PermitSearchCriteria criteria, Integer knownTotal) {
    PermitSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<PermitSearchResultDto> searchPage =
        knownTotal == null ? repository.search(normalized) : repository.search(normalized, knownTotal);
    List<PermitSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.getContent());

    return new PermitSearchResponseDto(
        results,
        searchPage == null ? 0 : (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(PermitSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<PermitDetailDto> findByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    return repository.findByPermitNumber(permitNumber);
  }

  private PermitSearchCriteria normalizeCriteria(PermitSearchCriteria input) {
    if (input == null) {
      return new PermitSearchCriteria(
          null, null, null, null, null, null, null, null, null, false, List.of(), null, 0, 25);
    }

    return new PermitSearchCriteria(
        trimToNull(input.applicationNumber()),
        trimToNull(input.packageNumber()),
        trimToNull(input.permitNumber()),
        input.issuedFromDate(),
        input.issuedToDate(),
        trimToNull(input.permitStatus()),
        trimToNull(input.invoiceNumber()),
        trimToNull(input.applicantClientNumber()),
        trimToNull(input.ownerClientNumber()),
        input.requireScalePermit(),
        normalizeRegions(input.regionNumbers()),
        trimToNull(input.sortField()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

  private List<Long> normalizeRegions(List<Long> rawRegions) {
    if (rawRegions == null) {
      return List.of();
    }
    return rawRegions.stream().filter(region -> region != null && region > 0).distinct().toList();
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static <T> List<T> safeList(List<T> input) {
    return input == null ? List.of() : input;
  }
}

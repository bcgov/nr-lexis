package ca.bc.gov.mof.lexis.service.reserve;

import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class IndianReservePermitOracleService implements IndianReservePermitService {

  private final IndianReservePermitRepository repository;

  public IndianReservePermitOracleService(IndianReservePermitRepository repository) {
    this.repository = repository;
  }

  @Override
  public IndianReservePermitSearchOptionsDto searchOptions() {
    return new IndianReservePermitSearchOptionsDto(
        safeList(repository.loadApplicationStatusOptions()),
        safeList(repository.loadExemptionTypeOptions()));
  }

  @Override
  public IndianReservePermitSearchResponseDto search(IndianReservePermitSearchCriteria criteria) {
    IndianReservePermitSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    List<IndianReservePermitSearchResultDto> results = safeList(repository.search(normalized));
    int fromIndex = Math.min(page * size, results.size());
    int toIndex = Math.min(fromIndex + size, results.size());

    return new IndianReservePermitSearchResponseDto(
        results.subList(fromIndex, toIndex),
        results.size(),
        page,
        size);
  }

  @Override
  public Optional<IndianReservePermitDetailDto> findByPermitNumber(String permitNumber) {
    String normalizedPermit = trimToNull(permitNumber);
    if (normalizedPermit == null) {
      return Optional.empty();
    }
    return repository.findByPermitNumber(normalizedPermit);
  }

  private IndianReservePermitSearchCriteria normalizeCriteria(IndianReservePermitSearchCriteria input) {
    if (input == null) {
      return new IndianReservePermitSearchCriteria(null, null, null, null, null, null, 0, 25);
    }

    return new IndianReservePermitSearchCriteria(
        trimToNull(input.permitNumber()),
        trimToNull(input.packageNumber()),
        input.issuedFromDate(),
        input.issuedToDate(),
        input.shippingFromDate(),
        input.shippingToDate(),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
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

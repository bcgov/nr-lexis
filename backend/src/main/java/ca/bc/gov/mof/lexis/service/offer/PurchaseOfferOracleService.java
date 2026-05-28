package ca.bc.gov.mof.lexis.service.offer;

import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.repository.offer.PurchaseOfferRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class PurchaseOfferOracleService implements PurchaseOfferService {

  private final PurchaseOfferRepository repository;

  public PurchaseOfferOracleService(PurchaseOfferRepository repository) {
    this.repository = repository;
  }

  @Override
  public PurchaseOfferSearchOptionsDto searchOptions() {
    return new PurchaseOfferSearchOptionsDto(safeList(repository.loadRegionOptions()));
  }

  @Override
  public PurchaseOfferSearchResponseDto search(PurchaseOfferSearchCriteria criteria) {
    PurchaseOfferSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    if (normalized.regionNumbers().isEmpty()) {
      return new PurchaseOfferSearchResponseDto(List.of(), 0, page, size);
    }

    List<PurchaseOfferSearchResultDto> results = safeList(repository.search(normalized));
    int fromIndex = Math.min(page * size, results.size());
    int toIndex = Math.min(fromIndex + size, results.size());

    return new PurchaseOfferSearchResponseDto(
        results.subList(fromIndex, toIndex),
        results.size(),
        page,
        size);
  }

  @Override
  public Optional<PurchaseOfferDetailDto> findByOfferNumber(Long offerNumber) {
    if (offerNumber == null || offerNumber < 1) {
      return Optional.empty();
    }
    return repository.findByOfferNumber(offerNumber);
  }

  private PurchaseOfferSearchCriteria normalizeCriteria(PurchaseOfferSearchCriteria input) {
    if (input == null) {
      return new PurchaseOfferSearchCriteria(
          null, null, null, null, null, null, null, null, false, List.of(), null, 0, 25);
    }

    return new PurchaseOfferSearchCriteria(
        trimToNull(input.applicationNumber()),
        trimToNull(input.packageNumber()),
        input.listingFromDate(),
        input.listingToDate(),
        input.withdrawalFromDate(),
        input.withdrawalToDate(),
        trimToNull(input.clientNumber()),
        trimToNull(input.offeringClientNumber()),
        input.excludeWithdrawn(),
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

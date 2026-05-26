package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.application.LexisApplicationRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLexisApplicationService implements LexisApplicationService {

  private final LexisApplicationRepository repository;

  public OracleLexisApplicationService(LexisApplicationRepository repository) {
    this.repository = repository;
  }

  @Override
  public LexisApplicationSearchOptionsDto searchOptions() {
    return new LexisApplicationSearchOptionsDto(
        safeList(repository.loadExemptionTypeOptions()),
        safeList(repository.loadApplicationStatusOptions()),
        safeList(repository.loadProductTypeOptions()),
        safeList(repository.loadRegionOptions()));
  }

  @Override
  public LexisApplicationSearchResponseDto search(LexisApplicationSearchCriteria criteria) {
    LexisApplicationSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    if (normalized.regionNumbers().isEmpty()) {
      return new LexisApplicationSearchResponseDto(List.of(), 0, page, size);
    }

    List<LexisApplicationSearchResultDto> results = safeList(repository.search(normalized));
    int fromIndex = Math.min(page * size, results.size());
    int toIndex = Math.min(fromIndex + size, results.size());

    return new LexisApplicationSearchResponseDto(
        results.subList(fromIndex, toIndex),
        results.size(),
        page,
        size);
  }

  @Override
  public Optional<LexisApplicationDetailDto> findByApplicationNumber(long applicationNumber) {
    if (applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findByApplicationNumber(applicationNumber);
  }

  @Override
  public Optional<LexisPackageLookupDto> findPackageByPackageNumber(String packageNumber) {
    String normalized = trimToNull(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }
    return repository.findPackageByPackageNumber(normalized);
  }

  @Override
  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    List<Long> normalized = normalizeApplicationNumbers(applicationNumbers);
    if (normalized.isEmpty()) {
      return false;
    }
    return repository.verifyApplicationClients(normalized);
  }

  @Override
  public boolean hasValidOffer(List<Long> applicationNumbers) {
    List<Long> normalized = normalizeApplicationNumbers(applicationNumbers);
    if (normalized.isEmpty()) {
      return false;
    }
    return repository.hasValidOffer(normalized);
  }

  private LexisApplicationSearchCriteria normalizeCriteria(LexisApplicationSearchCriteria input) {
    if (input == null) {
      return new LexisApplicationSearchCriteria(
          null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 25);
    }

    return new LexisApplicationSearchCriteria(
        trimToNull(input.applicationNumber()),
        trimToNull(input.packageNumber()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.exemptionType()),
        trimToNull(input.applicationStatus()),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.agentClientNumber()),
        trimToNull(input.productTypeCode()),
        input.receivedFromDate(),
        input.receivedToDate(),
        input.listingFromDate(),
        input.listingToDate(),
        normalizeRegions(input.regionNumbers()),
        trimToNull(input.sortField()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

  private List<Long> normalizeApplicationNumbers(List<Long> input) {
    if (input == null) {
      return List.of();
    }
    return input.stream().filter(number -> number != null && number > 0).distinct().toList();
  }

  private List<Long> normalizeRegions(List<Long> input) {
    if (input == null) {
      return List.of();
    }
    return input.stream().filter(number -> number != null && number > 0).distinct().toList();
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

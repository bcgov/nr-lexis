package ca.bc.gov.mof.lexis.service.exemption;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionRepository;
import ca.bc.gov.mof.lexis.repository.oracle.SearchPage;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class ExemptionOracleService implements ExemptionService {

  private static final String EXEMPTION_TYPE_MINISTERIAL = "M";

  private final ExemptionRepository repository;

  public ExemptionOracleService(ExemptionRepository repository) {
    this.repository = repository;
  }

  @Override
  public ExemptionSearchOptionsDto searchOptions() {
    return new ExemptionSearchOptionsDto(
        safeList(repository.loadExemptionTypeOptions()),
        safeList(repository.loadExemptionStatusOptions()),
        safeList(repository.loadRegionOptions()));
  }

  @Override
  public ExemptionSearchResponseDto search(ExemptionSearchCriteria criteria) {
    ExemptionSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    SearchPage<ExemptionSearchResultDto> searchPage = repository.search(normalized);
    List<ExemptionSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.content());

    return new ExemptionSearchResponseDto(
        results,
        searchPage == null ? 0 : searchPage.totalElements(),
        page,
        size);
  }

  @Override
  public int count(ExemptionSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<ExemptionDetailDto> findByExemptionNumber(String exemptionNumber) {
    return repository.findByExemptionNumber(exemptionNumber);
  }

  private ExemptionSearchCriteria normalizeCriteria(ExemptionSearchCriteria input) {
    if (input == null) {
      return new ExemptionSearchCriteria(
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          List.of(),
          0,
          25);
    }

    String applicationNumber = trimToNull(input.applicationNumber());
    String packageNumber = trimToNull(input.packageNumber());
    String exemptionNumber = trimToNull(input.exemptionNumber());
    String exemptionType = trimToNull(input.exemptionType());
    String exemptionStatus = trimToNull(input.exemptionStatus());
    String applicantClientNumber = trimToNull(input.applicantClientNumber());
    String ownerClientNumber = trimToNull(input.ownerClientNumber());
    List<Long> regionNumbers = normalizeRegions(input.regionNumbers());
    int page = Math.max(0, input.page());
    int size = Math.max(1, input.size());

    // Legacy parity: searching by applicant/owner implies ministerial exemptions.
    if (exemptionType == null && (applicantClientNumber != null || ownerClientNumber != null)) {
      exemptionType = EXEMPTION_TYPE_MINISTERIAL;
    }

    return new ExemptionSearchCriteria(
        applicationNumber,
        packageNumber,
        exemptionNumber,
        exemptionType,
        exemptionStatus,
        applicantClientNumber,
        ownerClientNumber,
        input.approvalFromDate(),
        input.approvalToDate(),
        input.listingFromDate(),
        input.listingToDate(),
        regionNumbers,
        page,
        size);
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

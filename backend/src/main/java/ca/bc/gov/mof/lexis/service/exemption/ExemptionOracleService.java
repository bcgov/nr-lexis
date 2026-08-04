package ca.bc.gov.mof.lexis.service.exemption;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
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
    return search(criteria, null);
  }

  @Override
  public ExemptionSearchResponseDto search(ExemptionSearchCriteria criteria, Integer knownTotal) {
    ExemptionSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<ExemptionSearchResultDto> searchPage =
        knownTotal == null ? repository.search(normalized) : repository.search(normalized, knownTotal);
    List<ExemptionSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.getContent());

    return new ExemptionSearchResponseDto(
        results,
        searchPage == null ? 0 : (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(ExemptionSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<ExemptionDetailDto> findByExemptionNumber(String exemptionNumber) {
    return repository
        .findByExemptionNumber(exemptionNumber)
        .map(this::resolveExemptionTypeDescription);
  }

  @Override
  public Optional<ExemptionAccessDto> findAccessByExemptionNumber(
      String exemptionNumber) {
    return repository.findAccessByExemptionNumber(exemptionNumber);
  }

  @Override
  public boolean hasLinkedProvincialApplicationForClient(
      String exemptionNumber, String clientNumber) {
    return repository.hasLinkedProvincialApplicationForClient(
        exemptionNumber, clientNumber);
  }

  @Override
  public List<Long> findOrgUnitNumbers(String exemptionNumber) {
    return repository.findOrgUnitNumbers(exemptionNumber);
  }

  private ExemptionDetailDto resolveExemptionTypeDescription(ExemptionDetailDto detail) {
    if (trimToNull(detail.exemptionTypeDescription()) != null) {
      return detail;
    }

    // The legacy FIND_EXEMPTION_BY_NUMBER cursor returns the type code without its description.
    String typeCode = trimToNull(detail.exemptionTypeCode());
    if (typeCode == null) {
      return detail;
    }

    String typeDescription =
        safeList(repository.loadExemptionTypeOptions()).stream()
            .filter(option -> typeCode.equalsIgnoreCase(trimToNull(option.code())))
            .map(option -> trimToNull(option.name()))
            .filter(name -> name != null)
            .findFirst()
            .orElse(null);
    if (typeDescription == null) {
      return detail;
    }

    return new ExemptionDetailDto(
        detail.exemptionNumber(),
        detail.exemptionTypeCode(),
        typeDescription,
        detail.exemptionStatusCode(),
        detail.exemptionStatusDescription(),
        detail.ownerClientNumber(),
        detail.agentClientNumber(),
        detail.applicationNumber(),
        detail.applicationStatus(),
        detail.approvalDate(),
        detail.expiryDate(),
        detail.approvedVolume(),
        detail.usedVolume(),
        detail.remainingVolume(),
        detail.otherConditions(),
        detail.blanketOic(),
        detail.permitNumbers(),
        detail.remarks(),
        detail.author());
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
          false,
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
    List<Long> regionNumbers = positiveDistinctLongs(input.regionNumbers());
    int page = Math.max(0, input.page());
    int size = Math.max(1, input.size());

    // Legacy parity: searching by applicant/owner implies ministerial exemptions.
    if (exemptionType == null
        && !input.includeBlanketOic()
        && (applicantClientNumber != null || ownerClientNumber != null)) {
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
        input.includeBlanketOic(),
        input.excludeBlanketOic(),
        trimToNull(input.sortField()),
        page,
        size);
  }

}

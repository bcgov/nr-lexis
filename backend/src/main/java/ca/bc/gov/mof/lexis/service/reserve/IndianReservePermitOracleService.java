package ca.bc.gov.mof.lexis.service.reserve;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.parsePositiveLong;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository.ReservePermitInsertRecord;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository.ReservePermitInsertRow;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
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

    Page<IndianReservePermitSearchResultDto> searchPage = repository.search(normalized);
    List<IndianReservePermitSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.getContent());

    return new IndianReservePermitSearchResponseDto(
        results,
        searchPage == null ? 0 : (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(IndianReservePermitSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<IndianReservePermitDetailDto> findByPermitNumber(String permitNumber) {
    String normalizedPermit = trimToNull(permitNumber);
    if (normalizedPermit == null) {
      return Optional.empty();
    }
    return repository.findByPermitNumber(normalizedPermit);
  }

  @Override
  public PermitMutationRpcResponseDto addPermit(CreatePermitRequest request, String userId) {
    String normalizedUserId = trimToNull(userId);
    List<String> errors = new ArrayList<>();

    if (normalizedUserId == null) {
      errors.add("A valid user identifier is required.");
    }
    if (request == null) {
      errors.add("A valid reserve permit request is required.");
      return failure(errors, null);
    }

    Long submittedPermitNumber = parsePositiveLong(request.permitNumber());
    if (submittedPermitNumber == null) {
      errors.add("A valid permit number is required.");
    }
    if (trimToNull(request.packageNumber()) == null) {
      errors.add("A valid package number is required.");
    }

    String clientNumber = trimToNull(request.clientNumber());
    if (clientNumber == null) {
      errors.add("A valid client number is required.");
    }
    String clientLocation = trimToNull(request.clientLocation());
    if (clientLocation == null) {
      errors.add("A valid client location is required.");
    }

    LocalDate applicationDate = parseDate(request.applicationDate());
    LocalDate issueDate = parseDate(request.permitIssueDate());
    LocalDate shippingDate = parseDate(request.estimatedShippingDate());
    Long regionNumber = parsePositiveLong(request.region());
    if (applicationDate == null) {
      errors.add("A valid application date is required.");
    }
    if (issueDate == null) {
      errors.add("A valid permit issue date is required.");
    }
    if (shippingDate == null) {
      errors.add("A valid estimated shipping date is required.");
    }
    if (regionNumber == null) {
      errors.add("A valid region is required.");
    }
    if (trimToNull(request.transportName()) == null) {
      errors.add("A valid transport name is required.");
    }
    if (!errors.isEmpty()) {
      return failure(errors, submittedPermitNumber);
    }

    ReservePermitInsertRecord insertRow =
        new ReservePermitInsertRecord(
            submittedPermitNumber.toString(),
            issueDate,
            shippingDate,
            trimToNull(request.otherPortOfExport()),
            trimToNull(request.transportName()),
            trimToNull(request.transportTypeCode()),
            trimToNull(request.destinationCountry()),
            trimToNull(request.portOfExport()),
            applicationDate,
            regionNumber,
            clientLocation,
            clientNumber);

    Optional<ReservePermitInsertRow> inserted =
        repository.insertReservePermit(insertRow, normalizedUserId);
    Long insertedPermitNumber =
        inserted.map(ReservePermitInsertRow::permitNumber)
            .map(value -> parsePositiveLong(value))
            .orElse(null);
    if (insertedPermitNumber == null) {
      return failure(List.of("Unable to save indigenous reserve permit."), submittedPermitNumber);
    }

    return new PermitMutationRpcResponseDto(
        true,
        "The indigenous reserve permit was saved successfully.",
        List.of(),
        List.of(),
        insertedPermitNumber,
        null,
        null,
        false,
        false,
        null);
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

  private LocalDate parseDate(String value) {
    return parseIsoOrLegacyDate(value);
  }

  private PermitMutationRpcResponseDto failure(List<String> errors, Long permitNumber) {
    return new PermitMutationRpcResponseDto(
        false, "", errors, List.of(), permitNumber, null, null, null, null, null);
  }

}

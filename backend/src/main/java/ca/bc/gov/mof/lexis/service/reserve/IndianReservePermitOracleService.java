package ca.bc.gov.mof.lexis.service.reserve;

import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.oracle.DynamicSearchPage;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class IndianReservePermitOracleService implements IndianReservePermitService {

  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");
  private static final String EXPORT_PERMIT_STATUS_ACTIVE = "ACT";
  private static final String EXPORT_SCALE_METHOD_WEIGHT = "W";

  private final IndianReservePermitRepository repository;
  private final PermitRpcRepository permitRpcRepository;

  public IndianReservePermitOracleService(
      IndianReservePermitRepository repository, PermitRpcRepository permitRpcRepository) {
    this.repository = repository;
    this.permitRpcRepository = permitRpcRepository;
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

    DynamicSearchPage<IndianReservePermitSearchResultDto> searchPage = repository.search(normalized);
    List<IndianReservePermitSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.results());

    return new IndianReservePermitSearchResponseDto(
        results,
        searchPage == null ? 0 : searchPage.total(),
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

    LocalDate applicationDate = parseDate(request.applicationDate());
    LocalDate issueDate = parseDate(request.permitIssueDate());
    LocalDate shippingDate = parseDate(request.estimatedShippingDate());
    if (applicationDate == null) {
      errors.add("A valid application date is required.");
    }
    if (issueDate == null) {
      errors.add("A valid permit issue date is required.");
    }
    if (shippingDate == null) {
      errors.add("A valid estimated shipping date is required.");
    }
    if (!errors.isEmpty()) {
      return failure(errors, submittedPermitNumber);
    }

    PermitMutationRow insertRow =
        new PermitMutationRow(
            null,
            null,
            trimToNull(request.transportName()),
            shippingDate,
            null,
            applicationDate,
            applicationDate,
            issueDate,
            null,
            null,
            0.0d,
            0L,
            0L,
            null,
            trimToNull(request.remarks()),
            normalizedUserId,
            null,
            trimToNull(request.transportTypeCode()),
            EXPORT_SCALE_METHOD_WEIGHT,
            clientNumber,
            null,
            clientNumber,
            null,
            null,
            null,
            trimToNull(request.portOfExport()),
            EXPORT_PERMIT_STATUS_ACTIVE,
            null,
            trimToNull(request.destinationCountry()),
            null,
            null,
            null,
            null,
            null,
            null);

    Optional<PermitMutationRow> inserted =
        permitRpcRepository.insertPermitDetail(insertRow, normalizedUserId);
    if (inserted.isEmpty() || inserted.get().permitNumber() == null) {
      return failure(List.of("Unable to save indigenous reserve permit."), submittedPermitNumber);
    }

    PermitMutationRow permit = inserted.get();
    return new PermitMutationRpcResponseDto(
        true,
        "The indigenous reserve permit was saved successfully.",
        List.of(),
        List.of(),
        permit.permitNumber(),
        permit.permitStatusCode(),
        permit.receiptNumber(),
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

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private Long parsePositiveLong(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private LocalDate parseDate(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }

    try {
      return LocalDate.parse(normalized);
    } catch (DateTimeParseException ignored) {
      // Fallback for legacy date format.
    }

    try {
      return LocalDate.parse(normalized, LEGACY_DATE_FORMATTER);
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  private PermitMutationRpcResponseDto failure(List<String> errors, Long permitNumber) {
    return new PermitMutationRpcResponseDto(
        false, "", errors, List.of(), permitNumber, null, null, null, null, null);
  }

  private static <T> List<T> safeList(List<T> input) {
    return input == null ? List.of() : input;
  }
}

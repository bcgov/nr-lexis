package ca.bc.gov.mof.lexis.service.offer;

import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.repository.offer.PurchaseOfferRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class PurchaseOfferOracleService implements PurchaseOfferService {

  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String FAIR_OFFER_DEFAULT = "N";
  private static final String VALID_OFFER_DEFAULT = "Y";
  private static final String APPROVAL_DEFAULT = "N";
  private static final String MANUFACTURING_FACILITY_DEFAULT = " ";
  private static final String SAVE_SUCCESS_MESSAGE = "The purchase offer was saved successfully.";

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

  @Override
  public CreateOfferResult addOffer(CreateOfferRequest request, String userId) {
    CreateOfferRequest normalized = normalizeCreateOfferRequest(request);
    List<String> errors = validateCreateOffer(normalized);
    List<String> warnings = List.of();

    if (!errors.isEmpty()) {
      return new CreateOfferResult(
          false, null, normalized.applicationNumber(), null, false, null, true, false, errors, warnings);
    }

    Optional<PurchaseOfferRepository.PurchaseOfferInsertRow> inserted =
        repository.insertOffer(toInsertRecord(normalized, trimToNull(userId)));
    Long offerNumber =
        inserted.map(PurchaseOfferRepository.PurchaseOfferInsertRow::exportPurchaseOfferNumber).orElse(null);

    if (offerNumber == null || offerNumber < 1) {
      return new CreateOfferResult(
          false,
          "We were unable to save this purchase offer. Please note the time this error occurred and report to someone.",
          normalized.applicationNumber(),
          null,
          false,
          null,
          true,
          false,
          List.of(),
          warnings);
    }

    return new CreateOfferResult(
        true,
        SAVE_SUCCESS_MESSAGE,
        normalized.applicationNumber(),
        offerNumber,
        false,
        null,
        true,
        false,
        List.of(),
        warnings);
  }

  private PurchaseOfferSearchCriteria normalizeCriteria(PurchaseOfferSearchCriteria input) {
    if (input == null) {
      return new PurchaseOfferSearchCriteria(
          null, null, null, null, null, null, null, null, false, false, List.of(), null, 0, 25);
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
        input.restrictToProvincialOrNullJurisdiction(),
        normalizeRegions(input.regionNumbers()),
        trimToNull(input.sortField()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

  private CreateOfferRequest normalizeCreateOfferRequest(CreateOfferRequest input) {
    if (input == null) {
      return new CreateOfferRequest(
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          FAIR_OFFER_DEFAULT,
          VALID_OFFER_DEFAULT,
          null,
          APPROVAL_DEFAULT,
          null,
          JURISDICTION_PROVINCIAL,
          MANUFACTURING_FACILITY_DEFAULT,
          null,
          null,
          null,
          null);
    }

    return new CreateOfferRequest(
        input.applicationNumber(),
        input.exportPurchaseOfferNumber(),
        normalizePackageNumber(input.packageNumber()),
        trimToNull(input.companyName()),
        trimToNull(input.contactName()),
        input.purchaseOfferAmount(),
        input.purchaseOfferDate(),
        input.offerWithdrawalDate(),
        input.teacReviewDate(),
        firstNonBlank(input.fairOfferIndicator(), FAIR_OFFER_DEFAULT),
        firstNonBlank(input.validOfferIndicator(), VALID_OFFER_DEFAULT),
        trimToNull(input.offerRemark()),
        firstNonBlank(input.approvalIndicator(), APPROVAL_DEFAULT),
        trimToNull(input.withdrawReason()),
        firstNonBlank(input.exportJurisdictionCode(), JURISDICTION_PROVINCIAL),
        firstNonBlank(input.manufacturingFacilityInfo(), MANUFACTURING_FACILITY_DEFAULT),
        trimToNull(input.offeringClientNumber()),
        trimToNull(input.pickupLocation()),
        trimToNull(input.offerCondition()),
        truncateOfferVolume(input.offerVolume()));
  }

  private List<String> validateCreateOffer(CreateOfferRequest request) {
    List<String> errors = new ArrayList<>();
    if (request.applicationNumber() == null || request.applicationNumber() <= 0) {
      errors.add(required("application number"));
    }
    if (trimToNull(request.companyName()) == null) {
      errors.add(required("company name"));
    }
    if (trimToNull(request.contactName()) == null) {
      errors.add(required("contact name"));
    }
    if (request.purchaseOfferAmount() == null || request.purchaseOfferAmount() <= 0.0d) {
      errors.add("The purchase offer amount must be greater than 0");
    }
    if (request.purchaseOfferDate() == null) {
      errors.add(required("purchase offer date"));
    }
    if (trimToNull(request.pickupLocation()) == null) {
      errors.add(required("pickup location"));
    }
    if (request.offerWithdrawalDate() != null && trimToNull(request.withdrawReason()) == null) {
      errors.add(required("withdraw reason"));
    }
    if (trimToNull(request.fairOfferIndicator()) == null) {
      errors.add(required("fair offer indicator"));
    }
    return errors;
  }

  private PurchaseOfferRepository.PurchaseOfferInsertRecord toInsertRecord(
      CreateOfferRequest request, String entryUserId) {
    return new PurchaseOfferRepository.PurchaseOfferInsertRecord(
        request.packageNumber(),
        request.companyName(),
        request.contactName(),
        request.purchaseOfferAmount(),
        request.purchaseOfferDate(),
        request.offerWithdrawalDate(),
        request.teacReviewDate(),
        request.fairOfferIndicator(),
        request.validOfferIndicator(),
        request.offerRemark(),
        request.approvalIndicator(),
        request.withdrawReason(),
        request.exportJurisdictionCode(),
        request.manufacturingFacilityInfo(),
        entryUserId,
        null,
        request.offeringClientNumber(),
        request.pickupLocation(),
        request.offerCondition(),
        request.applicationNumber(),
        request.offerVolume());
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

  private String normalizePackageNumber(String value) {
    String normalized = trimToNull(value);
    return "No Packages".equalsIgnoreCase(normalized) ? null : normalized;
  }

  private String firstNonBlank(String value, String fallback) {
    String normalized = trimToNull(value);
    return normalized == null ? fallback : normalized;
  }

  private Double truncateOfferVolume(Double value) {
    if (value == null) {
      return null;
    }
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.DOWN).doubleValue();
  }

  private String required(String fieldName) {
    return "A valid " + fieldName + " is required.";
  }

  private static <T> List<T> safeList(List<T> input) {
    return input == null ? List.of() : input;
  }
}

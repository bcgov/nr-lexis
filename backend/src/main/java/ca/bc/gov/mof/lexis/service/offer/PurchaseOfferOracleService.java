package ca.bc.gov.mof.lexis.service.offer;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.TextUtils.defaultSystemUser;
import static ca.bc.gov.mof.lexis.util.TextUtils.firstNonBlank;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;

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
import org.springframework.data.domain.Page;
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
  private static final String UPDATE_SUCCESS_MESSAGE = "The purchase offer was updated successfully.";

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

    Page<PurchaseOfferSearchResultDto> searchPage = repository.search(normalized);
    List<PurchaseOfferSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.getContent());

    return new PurchaseOfferSearchResponseDto(
        results,
        searchPage == null ? 0 : (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(PurchaseOfferSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
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
    if (errors.isEmpty()) {
      errors.addAll(validateCreateOfferReferences(normalized));
    }
    List<String> warnings = List.of();

    if (!errors.isEmpty()) {
      return new CreateOfferResult(
          false, null, normalized.applicationNumber(), null, false, null, true, false, errors, warnings);
    }

    Optional<PurchaseOfferRepository.PurchaseOfferInsertRow> inserted =
        repository.insertOffer(toInsertRecord(normalized, defaultMutationUser(userId)));
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

  @Override
  public CreateOfferResult updateOffer(CreateOfferRequest request, String userId) {
    Long offerNumber = request == null ? null : request.exportPurchaseOfferNumber();
    if (offerNumber == null || offerNumber < 1) {
      return new CreateOfferResult(
          false,
          null,
          request == null ? null : request.applicationNumber(),
          null,
          false,
          null,
          false,
          true,
          List.of(required("purchase offer number")),
          List.of());
    }

    Optional<PurchaseOfferRepository.PurchaseOfferUpdateSourceRow> existing =
        repository.findUpdateSourceByOfferNumber(offerNumber);
    if (existing.isEmpty()) {
      return new CreateOfferResult(
          false,
          null,
          request.applicationNumber(),
          offerNumber,
          false,
          null,
          false,
          true,
          List.of("Purchase offer " + offerNumber + " does not exist"),
          List.of());
    }

    PurchaseOfferRepository.PurchaseOfferUpdateSourceRow current = existing.get();
    CreateOfferRequest merged = mergeUpdateRequest(request, current);
    List<String> errors = validateCreateOffer(merged);
    List<String> warnings = List.of();

    if (!errors.isEmpty()) {
      return new CreateOfferResult(
          false,
          null,
          merged.applicationNumber(),
          offerNumber,
          false,
          null,
          false,
          true,
          errors,
          warnings);
    }

    boolean updated =
        repository.updateOffer(toUpdateRecord(merged, current, defaultMutationUser(userId)));
    if (!updated) {
      return new CreateOfferResult(
          false,
          "We were unable to update this purchase offer. Please note the time this error occurred and report to someone.",
          merged.applicationNumber(),
          offerNumber,
          false,
          null,
          false,
          true,
          List.of(),
          warnings);
    }

    return new CreateOfferResult(
        true,
        UPDATE_SUCCESS_MESSAGE,
        merged.applicationNumber(),
        offerNumber,
        false,
        null,
        hasMaterialUpdate(current, merged),
        true,
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
        positiveDistinctLongs(input.regionNumbers()),
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

  private List<String> validateCreateOfferReferences(CreateOfferRequest request) {
    List<String> errors = new ArrayList<>();
    Long applicationNumber = request.applicationNumber();
    if (applicationNumber != null && !repository.applicationExists(applicationNumber)) {
      errors.add("Application " + applicationNumber + " does not exist.");
    }

    String packageNumber = trimToNull(request.packageNumber());
    if (packageNumber != null) {
      Optional<Long> packageApplicationNumber = repository.findPackageApplicationNumber(packageNumber);
      if (packageApplicationNumber.isEmpty()) {
        errors.add("Package " + packageNumber + " does not exist.");
      } else if (applicationNumber != null && !packageApplicationNumber.get().equals(applicationNumber)) {
        errors.add("Package " + packageNumber + " does not belong to application " + applicationNumber + ".");
      }
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

  private PurchaseOfferRepository.PurchaseOfferUpdateRecord toUpdateRecord(
      CreateOfferRequest request,
      PurchaseOfferRepository.PurchaseOfferUpdateSourceRow current,
      String updateUserId) {
    return new PurchaseOfferRepository.PurchaseOfferUpdateRecord(
        request.exportPurchaseOfferNumber(),
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
        request.pickupLocation(),
        request.offerCondition(),
        current.entryUserId(),
        current.entryTimestamp(),
        updateUserId,
        request.offerVolume());
  }

  private CreateOfferRequest mergeUpdateRequest(
      CreateOfferRequest input, PurchaseOfferRepository.PurchaseOfferUpdateSourceRow current) {
    CreateOfferRequest normalized = normalizeUpdateInput(input);
    return new CreateOfferRequest(
        firstNonNull(normalized.applicationNumber(), current.applicationNumber()),
        current.exportPurchaseOfferNumber(),
        firstNonNull(normalized.packageNumber(), current.packageNumber()),
        firstNonNull(normalized.companyName(), current.companyName()),
        firstNonNull(normalized.contactName(), current.contactName()),
        firstNonNull(normalized.purchaseOfferAmount(), current.purchaseOfferAmount()),
        firstNonNull(normalized.purchaseOfferDate(), current.purchaseOfferDate()),
        firstNonNull(normalized.offerWithdrawalDate(), current.offerWithdrawalDate()),
        firstNonNull(normalized.teacReviewDate(), current.teacReviewDate()),
        firstNonBlank(normalized.fairOfferIndicator(), current.fairOfferIndicator()),
        firstNonBlank(normalized.validOfferIndicator(), current.validOfferIndicator()),
        firstNonNull(normalized.offerRemark(), current.offerRemark()),
        firstNonBlank(normalized.approvalIndicator(), current.approvalIndicator()),
        firstNonNull(normalized.withdrawReason(), current.withdrawReason()),
        firstNonBlank(normalized.exportJurisdictionCode(), current.exportJurisdictionCode()),
        firstNonBlank(
            normalized.manufacturingFacilityInfo(),
            firstNonBlank(current.manufacturingFacilityInfo(), MANUFACTURING_FACILITY_DEFAULT)),
        normalized.offeringClientNumber(),
        firstNonNull(normalized.pickupLocation(), current.pickupLocation()),
        firstNonNull(normalized.offerCondition(), current.offerCondition()),
        firstNonNull(normalized.offerVolume(), current.offerVolume()));
  }

  private CreateOfferRequest normalizeUpdateInput(CreateOfferRequest input) {
    if (input == null) {
      return new CreateOfferRequest(
          null, null, null, null, null, null, null, null, null, null, null, null, null,
          null, null, null, null, null, null, null);
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
        trimToNull(input.fairOfferIndicator()),
        trimToNull(input.validOfferIndicator()),
        trimToNull(input.offerRemark()),
        trimToNull(input.approvalIndicator()),
        trimToNull(input.withdrawReason()),
        trimToNull(input.exportJurisdictionCode()),
        trimToNull(input.manufacturingFacilityInfo()),
        trimToNull(input.offeringClientNumber()),
        trimToNull(input.pickupLocation()),
        trimToNull(input.offerCondition()),
        truncateOfferVolume(input.offerVolume()));
  }

  private boolean hasMaterialUpdate(
      PurchaseOfferRepository.PurchaseOfferUpdateSourceRow current, CreateOfferRequest updated) {
    return !equalsNullable(current.packageNumber(), updated.packageNumber())
        || !equalsNullable(current.companyName(), updated.companyName())
        || !equalsNullable(current.contactName(), updated.contactName())
        || !equalsNullable(current.purchaseOfferAmount(), updated.purchaseOfferAmount())
        || !equalsNullable(current.purchaseOfferDate(), updated.purchaseOfferDate())
        || !equalsNullable(current.offerWithdrawalDate(), updated.offerWithdrawalDate())
        || !equalsNullable(current.teacReviewDate(), updated.teacReviewDate())
        || !equalsNullable(current.offerRemark(), updated.offerRemark())
        || !equalsNullable(current.withdrawReason(), updated.withdrawReason())
        || !equalsNullable(current.pickupLocation(), updated.pickupLocation())
        || !equalsNullable(current.offerCondition(), updated.offerCondition())
        || !equalsNullable(current.offerVolume(), updated.offerVolume());
  }

  private String normalizePackageNumber(String value) {
    String normalized = trimToNull(value);
    return "No Packages".equalsIgnoreCase(normalized) ? null : normalized;
  }

  private String defaultMutationUser(String userId) {
    return defaultSystemUser(userId);
  }

  private boolean equalsNullable(Object left, Object right) {
    return java.util.Objects.equals(left, right);
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

}

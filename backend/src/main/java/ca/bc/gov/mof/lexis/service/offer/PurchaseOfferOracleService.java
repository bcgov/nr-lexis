package ca.bc.gov.mof.lexis.service.offer;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
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
import ca.bc.gov.mof.lexis.service.application.ApplicationNotificationRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class PurchaseOfferOracleService implements PurchaseOfferService {

  private static final Logger LOGGER = LoggerFactory.getLogger(PurchaseOfferOracleService.class);

  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String FAIR_OFFER_DEFAULT = "N";
  private static final String VALID_OFFER_DEFAULT = "Y";
  private static final String APPROVAL_DEFAULT = "N";
  private static final String MANUFACTURING_FACILITY_DEFAULT = " ";
  private static final String SAVE_SUCCESS_MESSAGE = "The purchase offer was saved successfully.";
  private static final String UPDATE_SUCCESS_MESSAGE = "The purchase offer was updated successfully.";
  private static final int COMPANY_NAME_MAX_BYTES = 52;
  private static final int CONTACT_NAME_MAX_BYTES = 120;
  private static final int OFFER_REMARK_MAX_BYTES = 254;
  private static final int WITHDRAW_REASON_MAX_BYTES = 254;
  private static final int MANUFACTURING_FACILITY_MAX_BYTES = 500;
  private static final int PICKUP_LOCATION_MAX_BYTES = 250;
  private static final int OFFER_CONDITION_MAX_BYTES = 254;
  private static final double PURCHASE_OFFER_AMOUNT_MAX = 99_999.99d;
  private static final double OFFER_VOLUME_MAX = 9_999_999.99d;

  private final PurchaseOfferRepository repository;
  private final ApplicationNotificationRecipientResolver notificationRecipientResolver;
  private final EmailNotificationService notificationService;
  private final RegionalMailRecipientResolver regionalRecipientResolver;
  private final Clock clock;

  @Autowired
  public PurchaseOfferOracleService(
      PurchaseOfferRepository repository,
      ApplicationNotificationRecipientResolver notificationRecipientResolver,
      EmailNotificationService notificationService,
      RegionalMailRecipientResolver regionalRecipientResolver) {
    this(
        repository,
        notificationRecipientResolver,
        notificationService,
        regionalRecipientResolver,
        LexisBusinessTime.systemClock());
  }

  PurchaseOfferOracleService(
      PurchaseOfferRepository repository,
      ApplicationNotificationRecipientResolver notificationRecipientResolver,
      EmailNotificationService notificationService,
      RegionalMailRecipientResolver regionalRecipientResolver,
      Clock clock) {
    this.repository = repository;
    this.notificationRecipientResolver = notificationRecipientResolver;
    this.notificationService = notificationService;
    this.regionalRecipientResolver = regionalRecipientResolver;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  @Override
  public PurchaseOfferSearchOptionsDto searchOptions() {
    return new PurchaseOfferSearchOptionsDto(safeList(repository.loadRegionOptions()));
  }

  @Override
  public PurchaseOfferSearchResponseDto search(PurchaseOfferSearchCriteria criteria) {
    return search(criteria, null);
  }

  @Override
  public PurchaseOfferSearchResponseDto search(
      PurchaseOfferSearchCriteria criteria, Integer knownTotal) {
    PurchaseOfferSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<PurchaseOfferSearchResultDto> searchPage =
        knownTotal == null ? repository.search(normalized) : repository.search(normalized, knownTotal);
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
  @Transactional
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
      markRollbackOnly();
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

    EmailResult email = sendOfferEmail(normalized.applicationNumber(), offerNumber, OfferEmailType.NEW);
    return new CreateOfferResult(
        true,
        SAVE_SUCCESS_MESSAGE,
        normalized.applicationNumber(),
        offerNumber,
        email.hasRecipient(),
        email.recipient(),
        email.required(),
        false,
        List.of(),
        withEmailWarning(warnings, email));
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Direct unit calls do not have a surrounding Spring transaction.
    }
  }

  @Override
  @Transactional
  public CreateOfferResult updateOffer(CreateOfferRequest request, String userId) {
    return updateOfferInternal(request, userId, true);
  }

  @Override
  @Transactional
  public CreateOfferResult updateOfferSnapshot(UpdateOfferRequest request, String userId) {
    return updateOfferInternal(toCreateOfferRequest(request), userId, false);
  }

  private CreateOfferResult updateOfferInternal(
      CreateOfferRequest request, String userId, boolean mergeMissingValues) {
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
    CreateOfferRequest normalizedInput = normalizeUpdateInput(request);
    CreateOfferRequest updated =
        mergeMissingValues
            ? mergeUpdateRequest(normalizedInput, current)
            : snapshotUpdateRequest(normalizedInput, current);
    List<String> errors = validateUpdateIdentity(normalizedInput, current);
    errors.addAll(validateCreateOffer(updated));
    errors.addAll(
        validateChangedReceivedDate(updated.purchaseOfferDate(), current.purchaseOfferDate()));
    if (errors.isEmpty()) {
      errors.addAll(validateCreateOfferReferences(updated));
    }
    List<String> warnings = List.of();

    if (!errors.isEmpty()) {
      return new CreateOfferResult(
          false,
          null,
          updated.applicationNumber(),
          offerNumber,
          false,
          null,
          false,
          true,
          errors,
          warnings);
    }

    boolean persisted =
        repository.updateOffer(toUpdateRecord(updated, current, defaultMutationUser(userId)));
    if (!persisted) {
      return new CreateOfferResult(
          false,
          "We were unable to update this purchase offer. Please note the time this error occurred and report to someone.",
          updated.applicationNumber(),
          offerNumber,
          false,
          null,
          false,
          true,
          List.of(),
          warnings);
    }

    boolean withdrawn = current.offerWithdrawalDate() == null && updated.offerWithdrawalDate() != null;
    boolean materialUpdate = hasLegacyNotificationUpdate(current, updated);
    EmailResult email =
        materialUpdate
            ? sendOfferEmail(
                updated.applicationNumber(),
                offerNumber,
                withdrawn ? OfferEmailType.WITHDRAWN : OfferEmailType.UPDATED)
            : EmailResult.notRequired();
    return new CreateOfferResult(
        true,
        UPDATE_SUCCESS_MESSAGE,
        updated.applicationNumber(),
        offerNumber,
        email.hasRecipient(),
        email.recipient(),
        email.required(),
        true,
        List.of(),
        withEmailWarning(warnings, email));
  }

  private List<String> withEmailWarning(List<String> warnings, EmailResult email) {
    if (email.warning() == null) {
      return warnings;
    }
    List<String> combined = new ArrayList<>(warnings);
    combined.add(email.warning());
    return List.copyOf(combined);
  }

  private EmailResult sendOfferEmail(
      Long applicationNumber, Long offerNumber, OfferEmailType type) {
    try {
      PurchaseOfferRepository.ApplicationRecipientRow context =
          repository.findApplicationRecipient(applicationNumber).orElse(null);
      String recipient =
          resolveApplicationRecipient(applicationNumber, context).orElse(null);
      if (recipient == null) {
        return new EmailResult(
            true, false, null, "Offer saved, but no client email address was found.");
      }
      List<String> regionalRecipients =
          safeList(regionalRecipientResolver.resolve(context.orgUnitNumber()));
      notificationService.publish(
          new WorkflowEmailEvent.PurchaseOffer(
              applicationNumber,
              offerNumber,
              switch (type) {
                case NEW -> WorkflowEmailEvent.OfferAction.NEW;
                case UPDATED -> WorkflowEmailEvent.OfferAction.UPDATED;
                case WITHDRAWN -> WorkflowEmailEvent.OfferAction.WITHDRAWN;
              },
              recipient,
              regionalRecipients));
      String warning =
          regionalRecipients.isEmpty()
              ? "Offer saved and applicant email queued, but no ministry regional recipient was configured."
              : null;
      return new EmailResult(true, true, recipient, warning);
    } catch (RuntimeException ex) {
      LOGGER.warn(
          "event=lexis_offer_email operation=prepare outcome=not_queued offerRef={} failureType={}",
          fingerprint(offerNumber == null ? null : offerNumber.toString()),
          exceptionType(ex));
      return new EmailResult(
          true, false, null, "Offer saved, but notification recipients could not be resolved.");
    }
  }

  private Optional<String> resolveApplicationRecipient(
      Long applicationNumber, PurchaseOfferRepository.ApplicationRecipientRow row) {
    if (row == null) {
      return Optional.empty();
    }
    return notificationRecipientResolver.resolve(
        applicationNumber,
        row.applicantTypeCode(),
        row.ownerClientNumber(),
        row.ownerClientLocationCode(),
        row.agentClientNumber(),
        row.agentClientLocationCode());
  }

  private enum OfferEmailType {
    NEW,
    UPDATED,
    WITHDRAWN
  }

  private record EmailResult(
      boolean required, boolean hasRecipient, String recipient, String warning) {
    private static EmailResult notRequired() {
      return new EmailResult(false, false, null, null);
    }
  }

  private PurchaseOfferSearchCriteria normalizeCriteria(PurchaseOfferSearchCriteria input) {
    if (input == null) {
      return new PurchaseOfferSearchCriteria(
          null, null, null, null, null, null, null, null, null, false, false, List.of(), null, 0, 25);
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
        trimToNull(input.accessClientNumber()),
        input.excludeWithdrawn(),
        input.restrictToProvincialOrNullJurisdiction(),
        positiveDistinctLongs(input.regionNumbers()),
        trimToNull(input.sortField()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

  private CreateOfferRequest normalizeCreateOfferRequest(CreateOfferRequest input) {
    LocalDate receivedDate = LocalDate.now(clock);
    if (input == null) {
      return new CreateOfferRequest(
          null,
          null,
          null,
          null,
          null,
          null,
          receivedDate,
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
        receivedDate,
        null,
        input.teacReviewDate(),
        firstNonBlank(input.fairOfferIndicator(), FAIR_OFFER_DEFAULT),
        firstNonBlank(input.validOfferIndicator(), VALID_OFFER_DEFAULT),
        trimToNull(input.offerRemark()),
        firstNonBlank(input.approvalIndicator(), APPROVAL_DEFAULT),
        null,
        JURISDICTION_PROVINCIAL,
        firstNonBlank(input.manufacturingFacilityInfo(), MANUFACTURING_FACILITY_DEFAULT),
        trimToNull(input.offeringClientNumber()),
        trimToNull(input.pickupLocation()),
        trimToNull(input.offerCondition()),
        input.offerVolume());
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
    if (request.purchaseOfferAmount() == null) {
      errors.add("The purchase offer amount must be greater than 0");
    } else if (!Double.isFinite(request.purchaseOfferAmount())) {
      errors.add("The purchase offer amount must be a finite number");
    } else if (request.purchaseOfferAmount() <= 0.0d) {
      errors.add("The purchase offer amount must be greater than 0");
    } else {
      validateStorageNumber(
          errors,
          request.purchaseOfferAmount(),
          PURCHASE_OFFER_AMOUNT_MAX,
          "Purchase offer amount");
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
    validateStorageNumber(errors, request.offerVolume(), OFFER_VOLUME_MAX, "Offer volume");
    validateStorageText(errors, request.companyName(), COMPANY_NAME_MAX_BYTES, "Company name");
    validateStorageText(errors, request.contactName(), CONTACT_NAME_MAX_BYTES, "Contact name");
    validateStorageText(errors, request.offerRemark(), OFFER_REMARK_MAX_BYTES, "Offer remarks");
    validateStorageText(
        errors, request.withdrawReason(), WITHDRAW_REASON_MAX_BYTES, "Withdraw reason");
    validateStorageText(
        errors,
        request.manufacturingFacilityInfo(),
        MANUFACTURING_FACILITY_MAX_BYTES,
        "Manufacturing facility information");
    validateStorageText(
        errors, request.pickupLocation(), PICKUP_LOCATION_MAX_BYTES, "Pickup location");
    validateStorageText(
        errors, request.offerCondition(), OFFER_CONDITION_MAX_BYTES, "Offer conditions");
    return errors;
  }

  private void validateStorageNumber(
      List<String> errors, Double value, double maximum, String fieldName) {
    if (value == null) {
      return;
    }
    if (!Double.isFinite(value)) {
      errors.add(fieldName + " must be a finite number");
      return;
    }
    if (value <= 0.0d) {
      errors.add(fieldName + " must be greater than 0");
      return;
    }
    if (value > maximum) {
      errors.add(fieldName + " must be " + BigDecimal.valueOf(maximum).toPlainString() + " or less");
    }
    if (BigDecimal.valueOf(value).stripTrailingZeros().scale() > 2) {
      errors.add(fieldName + " must have no more than 2 decimal places");
    }
  }

  private void validateStorageText(
      List<String> errors, String value, int maximumBytes, String fieldName) {
    if (value == null) {
      return;
    }
    if (value.length() > maximumBytes) {
      errors.add(fieldName + " must be " + maximumBytes + " ASCII characters or fewer");
    }
    if (!value.chars().allMatch(character -> character <= 0x7f)) {
      errors.add(fieldName + " must contain ASCII characters only");
    }
  }

  private List<String> validateCreateOfferReferences(CreateOfferRequest request) {
    List<String> errors = new ArrayList<>();
    Long applicationNumber = request.applicationNumber();
    Optional<PurchaseOfferRepository.ApplicationReferenceRow> application =
        applicationNumber == null
            ? Optional.empty()
            : repository.findApplicationReference(applicationNumber);
    if (applicationNumber != null
        && (application.isEmpty()
            || !applicationNumber.equals(application.get().applicationNumber()))) {
      errors.add("Application " + applicationNumber + " does not exist.");
    } else if (application.isPresent()
        && !isProvincialApplicationJurisdiction(application.get().jurisdictionCode())) {
      errors.add(
          "Application "
              + applicationNumber
              + " does not have a valid jurisdiction to accept offers.");
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

  private List<String> validateUpdateIdentity(
      CreateOfferRequest input,
      PurchaseOfferRepository.PurchaseOfferUpdateSourceRow current) {
    List<String> errors = new ArrayList<>();
    if (input.applicationNumber() != null
        && !input.applicationNumber().equals(current.applicationNumber())) {
      errors.add("A purchase offer cannot be moved to a different application.");
    }
    if (trimToNull(current.packageNumber()) == null && input.packageNumber() != null) {
      errors.add("A package cannot be added to an offer that was created without one.");
    }
    if (input.exportJurisdictionCode() != null
        && !JURISDICTION_PROVINCIAL.equalsIgnoreCase(input.exportJurisdictionCode())) {
      errors.add("A purchase offer cannot be moved to a different jurisdiction.");
    }
    if (!isProvincialOfferJurisdiction(current.exportJurisdictionCode())) {
      errors.add("The purchase offer does not have a valid provincial jurisdiction.");
    }
    return errors;
  }

  private List<String> validateChangedReceivedDate(
      LocalDate receivedDate, LocalDate previousReceivedDate) {
    if (receivedDate == null || receivedDate.equals(previousReceivedDate)) {
      return List.of();
    }

    LocalDate today = LocalDate.now(clock);
    if (receivedDate.isAfter(today)) {
      return List.of("Offer Received Date can't be in the future.");
    }
    if (receivedDate.isBefore(today.minusDays(7))) {
      return List.of("Offer Received Date can't be before 7 days from now.");
    }
    return List.of();
  }

  private boolean isProvincialApplicationJurisdiction(String jurisdictionCode) {
    return JURISDICTION_PROVINCIAL.equalsIgnoreCase(trimToNull(jurisdictionCode));
  }

  private boolean isProvincialOfferJurisdiction(String jurisdictionCode) {
    String normalized = trimToNull(jurisdictionCode);
    return normalized == null || JURISDICTION_PROVINCIAL.equalsIgnoreCase(normalized);
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
    return new CreateOfferRequest(
        current.applicationNumber(),
        current.exportPurchaseOfferNumber(),
        firstNonNull(input.packageNumber(), current.packageNumber()),
        firstNonNull(input.companyName(), current.companyName()),
        firstNonNull(input.contactName(), current.contactName()),
        firstNonNull(input.purchaseOfferAmount(), current.purchaseOfferAmount()),
        firstNonNull(input.purchaseOfferDate(), current.purchaseOfferDate()),
        firstNonNull(input.offerWithdrawalDate(), current.offerWithdrawalDate()),
        firstNonNull(input.teacReviewDate(), current.teacReviewDate()),
        firstNonBlank(input.fairOfferIndicator(), current.fairOfferIndicator()),
        firstNonBlank(input.validOfferIndicator(), current.validOfferIndicator()),
        firstNonNull(input.offerRemark(), current.offerRemark()),
        firstNonBlank(input.approvalIndicator(), current.approvalIndicator()),
        firstNonNull(input.withdrawReason(), current.withdrawReason()),
        current.exportJurisdictionCode(),
        firstNonBlank(
            input.manufacturingFacilityInfo(),
            firstNonBlank(current.manufacturingFacilityInfo(), MANUFACTURING_FACILITY_DEFAULT)),
        input.offeringClientNumber(),
        firstNonNull(input.pickupLocation(), current.pickupLocation()),
        firstNonNull(input.offerCondition(), current.offerCondition()),
        firstNonNull(input.offerVolume(), current.offerVolume()));
  }

  private CreateOfferRequest snapshotUpdateRequest(
      CreateOfferRequest input, PurchaseOfferRepository.PurchaseOfferUpdateSourceRow current) {
    return new CreateOfferRequest(
        current.applicationNumber(),
        current.exportPurchaseOfferNumber(),
        input.packageNumber(),
        input.companyName(),
        input.contactName(),
        input.purchaseOfferAmount(),
        input.purchaseOfferDate(),
        input.offerWithdrawalDate(),
        input.teacReviewDate(),
        input.fairOfferIndicator(),
        input.validOfferIndicator(),
        input.offerRemark(),
        input.approvalIndicator(),
        input.withdrawReason(),
        current.exportJurisdictionCode(),
        firstNonBlank(current.manufacturingFacilityInfo(), MANUFACTURING_FACILITY_DEFAULT),
        input.offeringClientNumber(),
        input.pickupLocation(),
        input.offerCondition(),
        input.offerVolume());
  }

  private CreateOfferRequest toCreateOfferRequest(UpdateOfferRequest input) {
    if (input == null) {
      return null;
    }
    return new CreateOfferRequest(
        input.applicationNumber(),
        input.exportPurchaseOfferNumber(),
        input.packageNumber(),
        input.companyName(),
        input.contactName(),
        input.purchaseOfferAmount(),
        input.purchaseOfferDate(),
        input.offerWithdrawalDate(),
        input.teacReviewDate(),
        input.fairOfferIndicator(),
        input.validOfferIndicator(),
        input.offerRemark(),
        input.approvalIndicator(),
        input.withdrawReason(),
        input.exportJurisdictionCode(),
        input.manufacturingFacilityInfo(),
        input.offeringClientNumber(),
        input.pickupLocation(),
        input.offerCondition(),
        input.offerVolume());
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
        input.offerVolume());
  }

  private boolean hasLegacyNotificationUpdate(
      PurchaseOfferRepository.PurchaseOfferUpdateSourceRow current, CreateOfferRequest updated) {
    return legacyNumberChanged(current.purchaseOfferAmount(), updated.purchaseOfferAmount())
        || !equalsNullable(current.purchaseOfferDate(), updated.purchaseOfferDate())
        || !equalsNullable(current.offerWithdrawalDate(), updated.offerWithdrawalDate())
        || legacyTextChanged(current.withdrawReason(), updated.withdrawReason())
        || legacyTextChanged(current.pickupLocation(), updated.pickupLocation())
        || legacyTextChanged(current.offerCondition(), updated.offerCondition())
        || legacyNumberChanged(current.offerVolume(), updated.offerVolume());
  }

  private boolean legacyNumberChanged(Double current, Double updated) {
    if (current == null || updated == null) {
      return current != updated;
    }
    return current.doubleValue() != updated.doubleValue();
  }

  private boolean legacyTextChanged(String current, String updated) {
    boolean currentBlank = current == null || current.isEmpty();
    boolean updatedBlank = updated == null || updated.isEmpty();
    if (currentBlank || updatedBlank) {
      return currentBlank != updatedBlank;
    }
    return !current.equalsIgnoreCase(updated);
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

  private String required(String fieldName) {
    return "A valid " + fieldName + " is required.";
  }

}

package ca.bc.gov.mof.lexis.service.federal;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationClientContextDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationRemarkDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.review.ApplicationApprovalEligibilityService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class FederalApplicationOracleService implements FederalApplicationService {

  private static final int REMARK_MAX_LENGTH = 254;
  private static final List<String> APPROVAL_SOURCE_STATUSES = List.of("NEW", "PND");
  private static final List<String> POST_APPROVAL_TARGET_STATUSES = List.of("REJ", "WDN");

  private final FederalApplicationRepository repository;
  private final ApplicationDetailsRpcRepository applicationDetailsRepository;
  private final ApplicationDetailsRpcService applicationDetailsService;
  private final ApplicationReviewRepository applicationReviewRepository;
  private final ApplicationApprovalEligibilityService approvalEligibilityService;
  private final ClientLookupService clientLookupService;
  private final Clock clock;

  @Autowired
  public FederalApplicationOracleService(
      FederalApplicationRepository repository,
      ApplicationDetailsRpcRepository applicationDetailsRepository,
      ApplicationDetailsRpcService applicationDetailsService,
      ApplicationReviewRepository applicationReviewRepository,
      ApplicationApprovalEligibilityService approvalEligibilityService,
      ClientLookupService clientLookupService) {
    this(
        repository,
        applicationDetailsRepository,
        applicationDetailsService,
        applicationReviewRepository,
        approvalEligibilityService,
        clientLookupService,
        LexisBusinessTime.systemClock());
  }

  FederalApplicationOracleService(
      FederalApplicationRepository repository,
      ApplicationDetailsRpcRepository applicationDetailsRepository,
      ApplicationDetailsRpcService applicationDetailsService,
      ApplicationReviewRepository applicationReviewRepository,
      ApplicationApprovalEligibilityService approvalEligibilityService,
      ClientLookupService clientLookupService,
      Clock clock) {
    this.repository = repository;
    this.applicationDetailsRepository = applicationDetailsRepository;
    this.applicationDetailsService = applicationDetailsService;
    this.applicationReviewRepository = applicationReviewRepository;
    this.approvalEligibilityService = approvalEligibilityService;
    this.clientLookupService = clientLookupService;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  @Override
  public FederalApplicationSearchOptionsDto searchOptions() {
    return new FederalApplicationSearchOptionsDto(
        safeList(repository.loadApplicationStatusOptions()),
        safeList(repository.loadFederalExemptionTypeOptions()));
  }

  @Override
  public FederalApplicationSearchResponseDto search(FederalApplicationSearchCriteria criteria) {
    return search(criteria, null);
  }

  @Override
  public FederalApplicationSearchResponseDto search(
      FederalApplicationSearchCriteria criteria, Integer knownTotal) {
    FederalApplicationSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<FederalApplicationSearchResultDto> searchPage =
        knownTotal == null ? repository.search(normalized) : repository.search(normalized, knownTotal);
    if (searchPage == null) {
      throw new DataRetrievalFailureException(
          "Federal application search returned no authoritative Oracle page.");
    }
    return new FederalApplicationSearchResponseDto(
        safeList(searchPage.getContent()),
        (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(FederalApplicationSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository
        .findByApplicationNumber(applicationNumber)
        .map(
            detail -> {
              String endUse =
                  applicationDetailsService.getApplicationSpeciesEndUseSort(applicationNumber);
              String productType =
                  applicationDetailsRepository
                      .findProductTypeDescription(detail.productType())
                      .orElse(detail.productType());
              String ageClass =
                  applicationDetailsRepository
                      .findGrowthTypeDescription(detail.ageClass())
                      .orElse(detail.ageClass());
              return detail
                  .withEndUse(endUse)
                  .withProductDescriptions(productType, ageClass)
                  .withClientContexts(
                    resolveClientContext(
                        detail.ownerClientNumber(), detail.ownerClientLocationCode()),
                    resolveClientContext(
                        detail.agentClientNumber(), detail.agentClientLocationCode()));
            });
  }

  @Override
  public Optional<FederalApplicationEditContext> findEditContext(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository
        .findMutationContextRequired(applicationNumber)
        .map(
            context ->
                new FederalApplicationEditContext(
                    context.statusCode(), context.listingDate()));
  }

  private FederalApplicationClientContextDto resolveClientContext(
      String clientNumber, String clientLocationCode) {
    if (trimToNull(clientNumber) == null || trimToNull(clientLocationCode) == null) {
      return null;
    }

    return clientLookupService
        .getClientDataRequired(clientNumber, clientLocationCode)
        .map(
            data ->
                new FederalApplicationClientContextDto(
                    data.address(),
                    data.city(),
                    data.province(),
                    data.postalCode(),
                    data.country(),
                    data.phone(),
                    data.fax(),
                    data.email()))
        .orElse(null);
  }

  @Override
  @Transactional(readOnly = true)
  public Optional<List<FederalApplicationRemarkDto>> findRemarksByApplicationNumber(
      Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    if (repository.findMutationContextRequired(applicationNumber).isEmpty()) {
      return Optional.empty();
    }
    List<FederalApplicationRemarkDto> remarks =
        applicationDetailsRepository.findRemarksByApplicationNumber(applicationNumber).stream()
            .map(row -> toFederalRemark(applicationNumber, row))
            .sorted(Comparator.comparing(FederalApplicationRemarkDto::remarkId))
            .toList();
    return Optional.of(remarks);
  }

  @Override
  @Transactional
  public FederalMutationResult approve(Long applicationNumber, String userId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return failure(List.of("Federal application was not found."));
    }
    FederalApplicationRepository.FederalMutationContextRow context =
        repository.findMutationContextRequired(applicationNumber).orElse(null);
    if (context == null) {
      return failure(List.of("Federal application was not found."));
    }
    String currentStatus = normalizedCode(context.statusCode());
    if (currentStatus == null) {
      return failure(List.of("Federal application status could not be verified."));
    }
    if (!APPROVAL_SOURCE_STATUSES.contains(currentStatus)) {
      return failure(List.of("Federal applications can only be approved from NEW or PND."));
    }
    ApplicationApprovalEligibilityService.Eligibility eligibility =
        approvalEligibilityService.evaluate(applicationNumber);
    if (!eligibility.eligible()) {
      return failure(eligibility.errors());
    }
    return transitionStatus(applicationNumber, "APP", null, userId, APPROVAL_SOURCE_STATUSES);
  }

  @Override
  @Transactional
  public FederalMutationResult updateStatus(
      Long applicationNumber, FederalStatusMutationRequest request, String userId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return failure(List.of("Federal application was not found."));
    }
    String status = request == null ? null : normalizedCode(request.statusCode());
    if (status == null || !POST_APPROVAL_TARGET_STATUSES.contains(status)) {
      return failure(List.of("Federal status must be REJ or WDN."));
    }
    String remark = trimToNull(request.remark());
    if (remark == null) {
      return failure(List.of("A remark is required when rejecting or withdrawing a federal application."));
    }
    if (remark.length() > REMARK_MAX_LENGTH) {
      return failure(List.of("Remark is too long to save. Shorten it and try again."));
    }

    FederalApplicationRepository.FederalMutationContextRow context =
        repository.findMutationContextRequired(applicationNumber).orElse(null);
    if (context == null) {
      return failure(List.of("Federal application was not found."));
    }
    String currentStatus = normalizedCode(context.statusCode());
    if (currentStatus == null) {
      return failure(List.of("Federal application status could not be verified."));
    }
    if (!"APP".equals(currentStatus)) {
      return failure(List.of("Federal applications can only be rejected or withdrawn from APP."));
    }
    LocalDate listingDate = context.listingDate();
    if (listingDate == null) {
      return failure(List.of("Federal application listing date could not be verified."));
    }
    if (!LocalDate.now(clock).isBefore(listingDate.plusDays(1))) {
      return failure(
          List.of(
              "Federal applications can only be rejected or withdrawn through the listing day."));
    }
    return transitionStatus(applicationNumber, status, remark, userId, List.of("APP"));
  }

  private FederalMutationResult transitionStatus(
      Long applicationNumber,
      String targetStatus,
      String remark,
      String userId,
      List<String> allowedSourceStatuses) {
    ApplicationReviewRepository.ApplicationStatusTransitionRow result =
        applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            applicationNumber,
            targetStatus,
            remark,
            TextUtils.defaultSystemUser(userId),
            allowedSourceStatuses);
    if (!result.applicationFound()) {
      return failure(List.of("Federal application status could not be verified."));
    }
    if (!result.transitionAllowed()) {
      return failure(
          List.of("Federal application status changed before the update; reload and try again."));
    }
    if (!result.updated() || (remark != null && result.remark() == null)) {
      markRollbackOnly();
      return failure(List.of("Federal application status could not be updated."));
    }
    return new FederalMutationResult(true, "Federal application status updated.", List.of());
  }

  private String normalizedCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  @Override
  @Transactional
  public FederalRemarkMutationResult addRemark(
      Long applicationNumber, FederalRemarkMutationRequest request, String userId) {
    String remark = normalizedRemark(request);
    List<String> errors = validateRemark(applicationNumber, null, remark, false);
    if (!errors.isEmpty()) {
      return remarkFailure(errors);
    }

    try {
      if (repository.findMutationContextRequired(applicationNumber).isEmpty()) {
        return remarkFailure(List.of("Federal application was not found."));
      }
      Optional<ApplicationDetailsRpcRepository.RemarkRow> inserted =
          applicationDetailsRepository.insertRemark(
              applicationNumber, remark, TextUtils.defaultSystemUser(userId), Instant.now());
      if (inserted.isEmpty()) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be saved."));
      }
      FederalApplicationRemarkDto persisted =
          toFederalRemark(applicationNumber, inserted.get());
      if (!remark.equals(persisted.remark())) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be verified."));
      }
      return remarkSuccess("Federal application remark added.", persisted);
    } catch (DataAccessException ex) {
      markRollbackOnly();
      return remarkFailure(List.of("Federal application remark could not be saved."));
    }
  }

  @Override
  @Transactional
  public FederalRemarkMutationResult updateRemark(
      Long applicationNumber,
      Long remarkId,
      FederalRemarkMutationRequest request,
      String userId) {
    String remark = normalizedRemark(request);
    List<String> errors = validateRemark(applicationNumber, remarkId, remark, true);
    if (!errors.isEmpty()) {
      return remarkFailure(errors);
    }

    try {
      if (repository.findMutationContextRequired(applicationNumber).isEmpty()) {
        return remarkFailure(List.of("Federal application was not found."));
      }
      if (applicationDetailsRepository.findRemarkRequired(remarkId, applicationNumber).isEmpty()) {
        return remarkFailure(List.of("Federal application remark was not found."));
      }
      if (applicationDetailsRepository.isRemarkNumberShared(remarkId)) {
        return remarkFailure(List.of(ApplicationDetailsRpcService.SHARED_REMARK_NUMBER_MESSAGE));
      }

      if (!applicationDetailsRepository.updateRemark(
          remarkId,
          applicationNumber,
          remark,
          TextUtils.defaultSystemUser(userId),
          Instant.now())) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be updated."));
      }

      Optional<ApplicationDetailsRpcRepository.RemarkRow> updated =
          applicationDetailsRepository.findRemarkRequired(remarkId, applicationNumber);
      if (updated.isEmpty()) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be verified."));
      }
      FederalApplicationRemarkDto persisted =
          toFederalRemark(applicationNumber, updated.get());
      if (!remark.equals(persisted.remark())) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be verified."));
      }
      return remarkSuccess("Federal application remark updated.", persisted);
    } catch (DataAccessException ex) {
      markRollbackOnly();
      return remarkFailure(List.of("Federal application remark could not be updated."));
    }
  }

  private String normalizedRemark(FederalRemarkMutationRequest request) {
    return request == null ? null : trimToNull(request.remark());
  }

  private List<String> validateRemark(
      Long applicationNumber, Long remarkId, String remark, boolean update) {
    List<String> errors = new ArrayList<>();
    if (applicationNumber == null || applicationNumber < 1) {
      errors.add("Application number is required.");
    }
    if (update && (remarkId == null || remarkId < 1)) {
      errors.add("Remark number is required.");
    }
    if (remark == null) {
      errors.add("Remark is required.");
    } else if (remark.length() > 250) {
      errors.add("Remark must not exceed 250 characters.");
    }
    return errors;
  }

  private FederalApplicationRemarkDto toFederalRemark(
      Long expectedApplicationNumber, ApplicationDetailsRpcRepository.RemarkRow row) {
    if (row == null
        || row.remarkId() < 1
        || row.applicationNumber() == null
        || !expectedApplicationNumber.equals(row.applicationNumber())) {
      throw new DataRetrievalFailureException(
          "Federal application remark did not match its application parent.");
    }
    return new FederalApplicationRemarkDto(
        row.remarkId(), row.remark(), row.user(), row.date());
  }

  private FederalRemarkMutationResult remarkSuccess(
      String message, FederalApplicationRemarkDto remark) {
    return new FederalRemarkMutationResult(true, message, remark, List.of());
  }

  private FederalRemarkMutationResult remarkFailure(List<String> errors) {
    return new FederalRemarkMutationResult(false, null, null, List.copyOf(errors));
  }

  private FederalMutationResult failure(List<String> errors) {
    return new FederalMutationResult(false, null, List.copyOf(errors));
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Unit calls may not have an active transaction.
    }
  }

  private FederalApplicationSearchCriteria normalizeCriteria(FederalApplicationSearchCriteria input) {
    if (input == null) {
      return new FederalApplicationSearchCriteria(
          null, null, null, null, null, null, null, null, null, null, List.of(), 0, 25);
    }

    return new FederalApplicationSearchCriteria(
        trimToNull(input.federalApplicationNumber()),
        normalizedCode(input.packageNumber()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.applicationStatus()),
        input.receivedFromDate(),
        input.receivedToDate(),
        input.listingFromDate(),
        input.listingToDate(),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.agentClientNumber()),
        positiveDistinctLongs(input.regionNumbers()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

}

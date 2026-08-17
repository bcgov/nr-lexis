package ca.bc.gov.mof.lexis.service.review;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.TextUtils.defaultSystemUser;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationNotificationRecipientResolver;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService.FederalMutationResult;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService.FederalStatusMutationRequest;
import ca.bc.gov.mof.lexis.service.mail.MailRecipientValidator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class ApplicationReviewOracleService implements ApplicationReviewService {

  private static final List<String> EMAIL_SUPPORTED_STATUS_CODES = List.of("REJ", "WDN");
  private static final List<String> STATUSES_REQUIRING_REMARK = List.of("REJ", "WDN", "EXP");
  private static final List<String> REVIEW_STATUS_UPDATE_CODES = List.of("REJ", "WDN", "EXP");
  private static final List<String> APPROVAL_SOURCE_CODES = List.of("NEW", "PND");
  private static final List<String> REVIEW_STATUS_SOURCE_CODES = List.of("NEW", "PND", "APP");
  private static final String FEDERAL_JURISDICTION = "F";
  private static final String PROVINCIAL_JURISDICTION = "P";

  private final ApplicationReviewRepository repository;
  private final ApplicationReviewStatusEmailSender emailSender;
  private final ApplicationApprovalEligibilityService approvalEligibilityService;
  private final ApplicationNotificationRecipientResolver notificationRecipientResolver;
  private final FederalApplicationService federalApplicationService;

  public ApplicationReviewOracleService(
      ApplicationReviewRepository repository,
      ApplicationReviewStatusEmailSender emailSender,
      ApplicationApprovalEligibilityService approvalEligibilityService,
      ApplicationNotificationRecipientResolver notificationRecipientResolver,
      FederalApplicationService federalApplicationService) {
    this.repository = repository;
    this.emailSender = emailSender;
    this.approvalEligibilityService = approvalEligibilityService;
    this.notificationRecipientResolver = notificationRecipientResolver;
    this.federalApplicationService = federalApplicationService;
  }

  @Override
  public ApplicationReviewSearchOptionsDto searchOptions() {
    return new ApplicationReviewSearchOptionsDto(
        safeList(repository.loadProductTypeOptions()),
        safeList(repository.loadRegionOptions()),
        safeList(repository.loadReviewStatusOptions()));
  }

  @Override
  public ApplicationReviewSearchResponseDto search(ApplicationReviewSearchCriteria criteria) {
    return search(criteria, null);
  }

  @Override
  public ApplicationReviewSearchResponseDto search(
      ApplicationReviewSearchCriteria criteria, Integer knownTotal) {
    ApplicationReviewSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<ApplicationReviewSearchResultDto> searchPage =
        knownTotal == null ? repository.search(normalized) : repository.search(normalized, knownTotal);
    List<ApplicationReviewSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.getContent());

    return new ApplicationReviewSearchResponseDto(
        results,
        searchPage == null ? 0 : (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(ApplicationReviewSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public ApplicationReviewPreviewResponseDto preview(ApplicationReviewSearchCriteria criteria) {
    ApplicationReviewSearchCriteria normalized = normalizeCriteria(criteria);
    Slice<ApplicationReviewSearchResultDto> slice = repository.slice(normalized);
    List<ApplicationReviewSearchResultDto> results = slice == null ? List.of() : safeList(slice.getContent());
    return new ApplicationReviewPreviewResponseDto(
        results,
        slice != null && slice.hasNext(),
        normalized.page(),
        normalized.size());
  }

  @Override
  @Transactional
  public ApplicationReviewStatusUpdateResultDto approve(Long applicationNumber, String updateUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return statusUpdateResult(
          false,
          false,
          null,
          null,
          null,
          null,
          "Application number must be a positive value.");
    }

    Optional<String> jurisdiction = authoritativeJurisdiction(applicationNumber);
    if (jurisdiction.isEmpty()) {
      return statusUpdateResult(
          false,
          false,
          "APP",
          null,
          null,
          null,
          "Application jurisdiction could not be verified.");
    }
    if (FEDERAL_JURISDICTION.equals(jurisdiction.get())) {
      return updateFederalStatus(applicationNumber, "APP", null, null, updateUserId);
    }
    if (!PROVINCIAL_JURISDICTION.equals(jurisdiction.get())) {
      return statusUpdateResult(
          false,
          false,
          "APP",
          null,
          null,
          null,
          "Application jurisdiction is not supported for application review.");
    }

    ApplicationApprovalEligibilityService.Eligibility eligibility =
        approvalEligibilityService.evaluate(applicationNumber);
    if (!eligibility.eligible()) {
      return statusUpdateResult(
          false,
          false,
          null,
          null,
          null,
          null,
          eligibility.message());
    }

    ApplicationReviewRepository.ApplicationStatusTransitionRow updateRow =
        repository.updateStatusWithRemarkFromAllowedSources(
            applicationNumber,
            "APP",
            null,
            defaultMutationUser(updateUserId),
            APPROVAL_SOURCE_CODES);
    if (!updateRow.applicationFound()) {
      return statusUpdateResult(
          false,
          false,
          "APP",
          null,
          null,
          null,
          "Application was not found.");
    }
    if (!updateRow.transitionAllowed()) {
      String currentStatus =
          updateRow.currentStatus() == null ? "unknown" : updateRow.currentStatus();
      return statusUpdateResult(
          false,
          false,
          "APP",
          null,
          null,
          null,
          "Application approval can only occur from NEW or PND; current status is "
              + currentStatus
              + ".");
    }
    if (updateRow.updated()) {
      return statusUpdateResult(
          true,
          true,
          "APP",
          null,
          null,
          null,
          "Application approved.");
    }
    return statusUpdateResult(
        false,
        true,
        "APP",
        null,
        null,
        null,
        "Application was not updated.");
  }

  @Override
  @Transactional
  public ApplicationReviewStatusUpdateResultDto updateStatus(
      Long applicationNumber,
      ApplicationReviewStatusUpdateRequestDto request,
      String updateUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return statusUpdateResult(
          false,
          false,
          null,
          null,
          null,
          null,
          "Application number must be a positive value.");
    }
    String statusCode = request == null ? null : trimToNull(request.statusCode());
    if (statusCode != null) {
      statusCode = statusCode.toUpperCase(java.util.Locale.ROOT);
    }
    if (statusCode == null) {
      return statusUpdateResult(
          false,
          false,
          null,
          null,
          null,
          null,
          "Status code is required.");
    }
    if (!REVIEW_STATUS_UPDATE_CODES.contains(statusCode)) {
      return statusUpdateResult(
          false,
          false,
          statusCode,
          request == null ? null : trimToNull(request.clientEmailAddress()),
          null,
          null,
          "Application review status must be REJ, WDN, or EXP; use the approval action for APP.");
    }

    String remark = request == null ? null : trimToNull(request.remark());
    if (STATUSES_REQUIRING_REMARK.contains(statusCode) && remark == null) {
      return statusUpdateResult(
          false,
          false,
          statusCode,
          request == null ? null : trimToNull(request.clientEmailAddress()),
          null,
          null,
          "Remark is required when rejecting, withdrawing, or expiring an application.");
    }

    String clientEmail = request == null ? null : trimToNull(request.clientEmailAddress());
    Optional<String> jurisdiction = authoritativeJurisdiction(applicationNumber);
    if (jurisdiction.isEmpty()) {
      return statusUpdateResult(
          false,
          false,
          statusCode,
          clientEmail,
          remark,
          null,
          "Application jurisdiction could not be verified.");
    }
    if (!PROVINCIAL_JURISDICTION.equals(jurisdiction.get())
        && !FEDERAL_JURISDICTION.equals(jurisdiction.get())) {
      return statusUpdateResult(
          false,
          false,
          statusCode,
          clientEmail,
          remark,
          null,
          "Application jurisdiction is not supported for application review.");
    }
    ApplicationReviewRepository.ApplicationStatusTransitionRow updateRow =
        repository.updateStatusWithRemarkFromAllowedSources(
            applicationNumber,
            statusCode,
            remark,
            defaultMutationUser(updateUserId),
            REVIEW_STATUS_SOURCE_CODES);

    if (!updateRow.applicationFound()) {
      return statusUpdateResult(
          false,
          false,
          statusCode,
          clientEmail,
          remark,
          null,
          "Application was not found.");
    }
    if (!updateRow.transitionAllowed()) {
      String currentStatus =
          updateRow.currentStatus() == null ? "unknown" : updateRow.currentStatus();
      return statusUpdateResult(
          false,
          false,
          statusCode,
          clientEmail,
          remark,
          null,
          "Application review status can only change from NEW, PND, or APP; current status is "
              + currentStatus
              + ".");
    }

    if (updateRow.updated()) {
      if (remark != null && updateRow.remark() == null) {
        markRollbackOnly();
        return statusUpdateResult(
            false,
            true,
            statusCode,
            clientEmail,
            remark,
            null,
            "Application status remark did not persist.");
      }
      return statusUpdateResult(
          true,
          true,
          statusCode,
          clientEmail,
          remark,
          updateRow.remark(),
          "Application status updated.");
    }
    return statusUpdateResult(
        false,
        true,
        statusCode,
        clientEmail,
        remark,
        null,
        "Application status update did not persist.");
  }

  private Optional<String> authoritativeJurisdiction(Long applicationNumber) {
    return repository.findAuthoritativeJurisdictionCode(applicationNumber)
        .map(String::trim)
        .filter(value -> !value.isEmpty())
        .map(value -> value.toUpperCase(Locale.ROOT));
  }

  private ApplicationReviewStatusUpdateResultDto updateFederalStatus(
      Long applicationNumber,
      String statusCode,
      String remark,
      String clientEmail,
      String updateUserId) {
    FederalMutationResult result =
        federalApplicationService.updateStatus(
            applicationNumber,
            new FederalStatusMutationRequest(statusCode, remark),
            defaultMutationUser(updateUserId));
    String message = result.message();
    if (!result.success() && (message == null || message.isBlank())) {
      message = String.join(" ", safeList(result.errors()));
    }
    if (message == null || message.isBlank()) {
      message =
          result.success()
              ? "Federal application status updated."
              : "Federal application status could not be updated.";
    }
    return statusUpdateResult(
        result.success(),
        result.success(),
        statusCode,
        clientEmail,
        remark,
        null,
        message);
  }

  private ApplicationReviewStatusUpdateResultDto statusUpdateResult(
      boolean updated,
      boolean valid,
      String statusCode,
      String clientEmail,
      String remark,
      ApplicationReviewRepository.ReviewRemarkRow remarkRow,
      String message) {
    return new ApplicationReviewStatusUpdateResultDto(
        updated,
        valid,
        statusCode,
        clientEmail,
        remark,
        remarkRow == null ? null : remarkRow.remarkId(),
        remarkRow == null ? null : remarkRow.user(),
        remarkRow == null ? null : remarkRow.date(),
        message);
  }

  @Override
  public ApplicationReviewStatusEmailResultDto sendStatusEmail(
      Long applicationNumber,
      ApplicationReviewStatusEmailRequestDto request) {
    if (applicationNumber == null || applicationNumber < 1) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application number must be a positive value.");
    }

    String statusCode = request == null ? null : trimToNull(request.statusCode());
    if (statusCode != null) {
      statusCode = statusCode.toUpperCase(java.util.Locale.ROOT);
    }
    if (statusCode == null) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Status code is required.");
    }

    if (!EMAIL_SUPPORTED_STATUS_CODES.contains(statusCode)) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Status email is only supported for rejected or withdrawn applications.");
    }

    ApplicationReviewRepository.AuthoritativeApplicantStatusContext context =
        repository.findAuthoritativeApplicantStatusContext(applicationNumber).orElse(null);
    if (context == null) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status and applicant details could not be verified.");
    }
    if (!statusCode.equals(context.statusCode())) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status no longer matches the requested email status.");
    }

    String requestedRecipient = request == null ? null : trimToNull(request.clientEmailAddress());
    String clientEmail;
    if (requestedRecipient == null) {
      clientEmail =
          notificationRecipientResolver
              .resolve(
                  applicationNumber,
                  context.applicantTypeCode(),
                  "O".equalsIgnoreCase(context.applicantTypeCode())
                      ? context.clientNumber()
                      : null,
                  "O".equalsIgnoreCase(context.applicantTypeCode())
                      ? context.locationCode()
                      : null,
                  "A".equalsIgnoreCase(context.applicantTypeCode())
                      ? context.clientNumber()
                      : null,
                  "A".equalsIgnoreCase(context.applicantTypeCode())
                      ? context.locationCode()
                      : null)
              .orElse(null);
    } else {
      clientEmail = MailRecipientValidator.normalize(requestedRecipient).orElse(null);
      if (clientEmail == null) {
        return new ApplicationReviewStatusEmailResultDto(
            false,
            "Client email address must contain one valid email address.");
      }
    }
    if (clientEmail == null) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "No valid email address is available for the application applicant.");
    }

    String requestedRemark = request == null ? null : trimToNull(request.remark());
    ApplicationReviewRepository.ReviewRemarkRow authoritativeRemark =
        repository.findLatestAuthoritativeRemark(applicationNumber).orElse(null);
    String persistedRemark =
        authoritativeRemark == null ? null : trimToNull(authoritativeRemark.remark());
    if (persistedRemark == null) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status remark could not be verified.");
    }
    if (!persistedRemark.equals(requestedRemark)) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status remark no longer matches the persisted status remark.");
    }

    ApplicationReviewRepository.AuthoritativeApplicantStatusContext confirmedContext =
        repository.findAuthoritativeApplicantStatusContext(applicationNumber).orElse(null);
    if (!context.equals(confirmedContext)
        || !statusCode.equals(confirmedContext.statusCode())) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status or applicant changed before the email could be sent.");
    }
    ApplicationReviewRepository.ReviewRemarkRow confirmedRemark =
        repository.findLatestAuthoritativeRemark(applicationNumber).orElse(null);
    if (!authoritativeRemark.equals(confirmedRemark)) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status remark changed before the email could be sent.");
    }

    boolean staged =
        repository.sendStatusEmail(
            applicationNumber,
            statusCode,
            clientEmail,
            persistedRemark);
    if (!staged) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status email could not be prepared.");
    }

    boolean queued =
        emailSender.sendStatusEmail(
            applicationNumber,
            statusCode,
            clientEmail,
            persistedRemark,
            confirmedContext.orgUnitNumber());
    if (!queued) {
      return new ApplicationReviewStatusEmailResultDto(
          false, "Application status email could not be prepared.");
    }
    return new ApplicationReviewStatusEmailResultDto(
        true,
        "Application status email sent.");
  }

  private ApplicationReviewSearchCriteria normalizeCriteria(ApplicationReviewSearchCriteria input) {
    if (input == null) {
      return new ApplicationReviewSearchCriteria(
          null, null, null, null, null, null, List.of(), null, 0, 25);
    }

    return new ApplicationReviewSearchCriteria(
        trimToNull(input.applicationNumber()),
        trimToNull(input.productTypeCode()),
        input.receivedFromDate(),
        input.receivedToDate(),
        input.listingFromDate(),
        input.listingToDate(),
        positiveDistinctLongs(input.regionNumbers()),
        trimToNull(input.sortField()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

  private String defaultMutationUser(String userId) {
    return defaultSystemUser(userId);
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Unit tests call the service without Spring transaction advice.
    }
  }

}

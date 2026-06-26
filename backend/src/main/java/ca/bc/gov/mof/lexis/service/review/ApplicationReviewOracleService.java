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
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Slice;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class ApplicationReviewOracleService implements ApplicationReviewService {

  private static final List<String> EMAIL_SUPPORTED_STATUS_CODES = List.of("REJ", "WDN");
  private static final List<String> STATUSES_REQUIRING_REMARK = List.of("REJ", "WDN");
  private static final Pattern SIMPLE_EMAIL_PATTERN =
      Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

  private final ApplicationReviewRepository repository;
  private final ApplicationReviewStatusEmailSender emailSender;

  public ApplicationReviewOracleService(
      ApplicationReviewRepository repository,
      ApplicationReviewStatusEmailSender emailSender) {
    this.repository = repository;
    this.emailSender = emailSender;
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
    ApplicationReviewSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<ApplicationReviewSearchResultDto> searchPage = repository.search(normalized);
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

    boolean updated = repository.approve(applicationNumber, defaultMutationUser(updateUserId));
    if (updated) {
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

    String remark = request == null ? null : trimToNull(request.remark());
    if (STATUSES_REQUIRING_REMARK.contains(statusCode) && remark == null) {
      return statusUpdateResult(
          false,
          false,
          statusCode,
          request == null ? null : trimToNull(request.clientEmailAddress()),
          null,
          null,
          "Remark is required when rejecting or withdrawing an application.");
    }

    String clientEmail = request == null ? null : trimToNull(request.clientEmailAddress());
    ApplicationReviewRepository.ApplicationStatusUpdateRow updateRow =
        repository.updateStatusWithRemark(applicationNumber, statusCode, remark, defaultMutationUser(updateUserId));

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
    String clientEmail = request == null ? null : trimToNull(request.clientEmailAddress());
    if (statusCode == null || clientEmail == null) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Status code and client email are required.");
    }
    if (!isValidEmailAddress(clientEmail)) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Client email must be a valid email address.");
    }

    if (!EMAIL_SUPPORTED_STATUS_CODES.contains(statusCode)) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Status email is only supported for rejected or withdrawn applications.");
    }

    boolean staged =
        repository.sendStatusEmail(
            applicationNumber,
            statusCode,
            clientEmail,
            request == null ? null : trimToNull(request.remark()));
    if (!staged) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status email could not be prepared.");
    }

    try {
      emailSender.sendStatusEmail(
          applicationNumber,
          statusCode,
          clientEmail,
          request == null ? null : trimToNull(request.remark()));
      return new ApplicationReviewStatusEmailResultDto(
          true,
          "Application status email sent.");
    } catch (MailException ex) {
      return new ApplicationReviewStatusEmailResultDto(
          false,
          "Application status email failed to send.");
    }
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

  private static boolean isValidEmailAddress(String value) {
    if (!SIMPLE_EMAIL_PATTERN.matcher(value).matches()) {
      return false;
    }
    try {
      InternetAddress[] addresses = InternetAddress.parse(value, true);
      return addresses.length == 1 && value.equals(addresses[0].getAddress());
    } catch (AddressException ex) {
      return false;
    }
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Unit tests call the service without Spring transaction advice.
    }
  }

}

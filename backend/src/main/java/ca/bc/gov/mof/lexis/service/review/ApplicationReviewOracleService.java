package ca.bc.gov.mof.lexis.service.review;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class ApplicationReviewOracleService implements ApplicationReviewService {

  private final ApplicationReviewRepository repository;

  public ApplicationReviewOracleService(ApplicationReviewRepository repository) {
    this.repository = repository;
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

    List<ApplicationReviewSearchResultDto> results = safeList(repository.search(normalized));
    int fromIndex = Math.min(page * size, results.size());
    int toIndex = Math.min(fromIndex + size, results.size());

    return new ApplicationReviewSearchResponseDto(
        results.subList(fromIndex, toIndex),
        results.size(),
        page,
        size);
  }

  @Override
  public ApplicationReviewStatusUpdateResultDto approve(Long applicationNumber, String updateUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return new ApplicationReviewStatusUpdateResultDto(
          false,
          false,
          null,
          null,
          null,
          "Application number must be a positive value.");
    }

    boolean updated = repository.approve(applicationNumber, defaultMutationUser(updateUserId));
    if (updated) {
      return new ApplicationReviewStatusUpdateResultDto(
          true,
          true,
          "APR",
          null,
          null,
          "Application approved.");
    }
    return new ApplicationReviewStatusUpdateResultDto(
        false,
        true,
        "APR",
        null,
        null,
        "Application was not updated.");
  }

  @Override
  public ApplicationReviewStatusUpdateResultDto updateStatus(
      Long applicationNumber,
      ApplicationReviewStatusUpdateRequestDto request,
      String updateUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return new ApplicationReviewStatusUpdateResultDto(
          false,
          false,
          null,
          null,
          null,
          "Application number must be a positive value.");
    }
    String statusCode = request == null ? null : trimToNull(request.statusCode());
    if (statusCode == null) {
      return new ApplicationReviewStatusUpdateResultDto(
          false,
          false,
          null,
          null,
          null,
          "Status code is required.");
    }

    String remark = request == null ? null : trimToNull(request.remark());
    String clientEmail = request == null ? null : trimToNull(request.clientEmailAddress());
    boolean updated =
        repository.updateStatus(applicationNumber, statusCode, remark, defaultMutationUser(updateUserId));

    if (updated) {
      return new ApplicationReviewStatusUpdateResultDto(
          true,
          true,
          statusCode,
          clientEmail,
          remark,
          "Application status updated.");
    }
    return new ApplicationReviewStatusUpdateResultDto(
        false,
        true,
        statusCode,
        clientEmail,
        remark,
        "Application status update did not persist.");
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

    String remark = request == null ? null : trimToNull(request.remark());
    boolean success = repository.sendStatusEmail(applicationNumber, statusCode, clientEmail, remark);

    if (success) {
      return new ApplicationReviewStatusEmailResultDto(true, "Status email sent.");
    }
    return new ApplicationReviewStatusEmailResultDto(false, "Status email could not be sent.");
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
        normalizeRegions(input.regionNumbers()),
        trimToNull(input.sortField()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

  private List<Long> normalizeRegions(List<Long> rawValues) {
    if (rawValues == null) {
      return List.of();
    }
    return rawValues.stream().filter(value -> value != null && value > 0).distinct().toList();
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String defaultMutationUser(String userId) {
    String normalized = trimToNull(userId);
    return normalized == null ? "system" : normalized;
  }

  private static <T> List<T> safeList(List<T> input) {
    return input == null ? List.of() : input;
  }
}

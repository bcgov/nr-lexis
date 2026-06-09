package ca.bc.gov.mof.lexis.service.review;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;

public interface ApplicationReviewService {

  ApplicationReviewSearchOptionsDto searchOptions();

  ApplicationReviewSearchResponseDto search(ApplicationReviewSearchCriteria criteria);

  int count(ApplicationReviewSearchCriteria criteria);

  ApplicationReviewPreviewResponseDto preview(ApplicationReviewSearchCriteria criteria);

  ApplicationReviewStatusUpdateResultDto approve(Long applicationNumber, String updateUserId);

  ApplicationReviewStatusUpdateResultDto updateStatus(
      Long applicationNumber,
      ApplicationReviewStatusUpdateRequestDto request,
      String updateUserId);

  ApplicationReviewStatusEmailResultDto sendStatusEmail(
      Long applicationNumber,
      ApplicationReviewStatusEmailRequestDto request);
}

package ca.bc.gov.mof.lexis.dto.review;

import java.util.List;

public record ApplicationReviewPreviewResponseDto(
    List<ApplicationReviewSearchResultDto> results,
    boolean hasNext,
    int page,
    int size) {}

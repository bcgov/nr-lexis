package ca.bc.gov.mof.lexis.dto.review;

import java.util.List;

public record ApplicationReviewSearchResponseDto(
    List<ApplicationReviewSearchResultDto> results,
    int total,
    int page,
    int size) {}

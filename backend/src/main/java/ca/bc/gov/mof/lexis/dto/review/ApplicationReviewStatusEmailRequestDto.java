package ca.bc.gov.mof.lexis.dto.review;

public record ApplicationReviewStatusEmailRequestDto(
    String statusCode,
    String clientEmailAddress,
    String remark) {}

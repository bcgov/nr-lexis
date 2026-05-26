package ca.bc.gov.mof.lexis.dto.review;

public record ApplicationReviewStatusUpdateRequestDto(
    String statusCode,
    String remark,
    String clientEmailAddress) {}

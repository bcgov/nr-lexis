package ca.bc.gov.mof.lexis.dto.review;

public record ApplicationReviewStatusUpdateResultDto(
    boolean updated,
    boolean valid,
    String statusCode,
    String clientEmail,
    String remark,
    Long remarkId,
    String remarkUser,
    java.time.Instant remarkDate,
    String message) {}

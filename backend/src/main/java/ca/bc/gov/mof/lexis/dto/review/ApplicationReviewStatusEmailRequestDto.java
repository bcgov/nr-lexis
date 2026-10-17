package ca.bc.gov.mof.lexis.dto.review;

/**
 * A status email request. {@code clientEmailAddress} names one recipient, or none to use the
 * applicant's email on file. When {@code ownerEmail} or {@code agentEmail} is present, the email
 * goes to those addresses instead, and at least one of them must be filled in.
 */
public record ApplicationReviewStatusEmailRequestDto(
    String statusCode,
    String clientEmailAddress,
    String remark,
    String ownerEmail,
    String agentEmail) {

  public ApplicationReviewStatusEmailRequestDto(
      String statusCode, String clientEmailAddress, String remark) {
    this(statusCode, clientEmailAddress, remark, null, null);
  }

  public boolean hasContactRecipients() {
    return ownerEmail != null || agentEmail != null;
  }
}

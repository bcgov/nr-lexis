package ca.bc.gov.mof.lexis.dto.exemption;

import java.time.LocalDate;

/**
 * One exemption search row. {@code outsideApprovalRegions} is set for a Ministerial exemption in
 * New status when the searching user's approval grants don't cover every region it reaches.
 */
public record ExemptionSearchResultDto(
    String exemptionNumber,
    String exemptionType,
    String status,
    String applicantClientNumber,
    String ownerClientNumber,
    Long applicationNumber,
    LocalDate approvalDate,
    LocalDate listingDate,
    LocalDate expiryDate,
    String region,
    double approvedVolume,
    double balanceRemaining,
    boolean locked,
    boolean outsideApprovalRegions) {

  public ExemptionSearchResultDto(
      String exemptionNumber,
      String exemptionType,
      String status,
      String applicantClientNumber,
      String ownerClientNumber,
      Long applicationNumber,
      LocalDate approvalDate,
      LocalDate listingDate,
      LocalDate expiryDate,
      String region,
      double approvedVolume,
      double balanceRemaining,
      boolean locked) {
    this(
        exemptionNumber,
        exemptionType,
        status,
        applicantClientNumber,
        ownerClientNumber,
        applicationNumber,
        approvalDate,
        listingDate,
        expiryDate,
        region,
        approvedVolume,
        balanceRemaining,
        locked,
        false);
  }
}

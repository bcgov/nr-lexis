package ca.bc.gov.mof.lexis.dto.exemption;

import java.time.LocalDate;

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
    boolean locked) {}

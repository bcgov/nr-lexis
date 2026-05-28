package ca.bc.gov.mof.lexis.dto.exemption;

import java.time.LocalDate;

public record ExemptionSearchResultDto(
    String exemptionNumber,
    String exemptionType,
    String status,
    String ownerClientNumber,
    Long applicationNumber,
    LocalDate approvalDate,
    LocalDate listingDate,
    String region,
    double approvedVolume,
    boolean locked) {}

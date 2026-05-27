package ca.bc.gov.mof.lexis.dto.summary;

import java.time.LocalDate;

public record SummaryExemptionItemDto(
    String exemption,
    String exemptionType,
    String ownerClientNumber,
    String agentClientNumber,
    String status,
    double approvedVolume,
    double balanceRemaining,
    LocalDate approvalDate,
    LocalDate expiryDate) {}

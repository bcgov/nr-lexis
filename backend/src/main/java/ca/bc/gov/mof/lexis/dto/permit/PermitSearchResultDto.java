package ca.bc.gov.mof.lexis.dto.permit;

import java.time.LocalDate;

public record PermitSearchResultDto(
    Long permitNumber,
    String statusDescription,
    String applicantClientNumber,
    String ownerClientNumber,
    double totalVolume,
    LocalDate issueDate,
    String region) {}

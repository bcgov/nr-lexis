package ca.bc.gov.mof.lexis.dto.exemption;

public record ExemptionSummaryLookupDto(
    String exemptionNumber,
    String exemptionTypeDescription,
    String exemptionStatusDescription) {}

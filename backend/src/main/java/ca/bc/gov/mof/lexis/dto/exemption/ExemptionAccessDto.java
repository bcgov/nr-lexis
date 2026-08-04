package ca.bc.gov.mof.lexis.dto.exemption;

/** Minimal authoritative exemption projection used by access checks. */
public record ExemptionAccessDto(
    String exemptionNumber,
    String exemptionTypeCode,
    String exemptionStatusCode,
    boolean blanketOic) {}

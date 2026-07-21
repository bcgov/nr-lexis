package ca.bc.gov.mof.lexis.dto.permit;

/** Minimal authoritative permit projection used by access checks. */
public record PermitAccessDto(
    Long permitNumber,
    String applicantClientNumber,
    String ownerClientNumber,
    Long orgUnitNumber) {}

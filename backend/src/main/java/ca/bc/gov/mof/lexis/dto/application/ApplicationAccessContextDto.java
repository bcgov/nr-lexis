package ca.bc.gov.mof.lexis.dto.application;

/** Application ownership and region fields required for an authorization decision. */
public record ApplicationAccessContextDto(
    Long applicationNumber,
    String jurisdictionCode,
    Long orgUnitNumber,
    String ownerClientNumber,
    String agentClientNumber) {}

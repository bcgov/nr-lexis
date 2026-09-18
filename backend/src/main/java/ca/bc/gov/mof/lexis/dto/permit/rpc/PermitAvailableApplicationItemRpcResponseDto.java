package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitAvailableApplicationItemRpcResponseDto(
    String applicationNumber,
    boolean disabled,
    String disabledReason,
    Long unassignedPieces,
    Double unassignedVolume) {}

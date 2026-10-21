package ca.bc.gov.mof.lexis.dto.permit.rpc;

/** An application's pieces and volume on one permit, summed from that permit's scale rows. */
public record PermitApplicationTotalsRpcResponseDto(
    String applicationNumber, long pieces, double volume) {}

package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitDataAfterScaleUpdateRpcResponseDto(
    String packageVolume,
    long pieces,
    String totalFees,
    double exemptionVolume) {}

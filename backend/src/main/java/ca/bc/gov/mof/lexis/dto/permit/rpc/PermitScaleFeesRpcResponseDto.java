package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitScaleFeesRpcResponseDto(
    String totalFeeForPackage,
    List<PermitRpcScaleItemDto> scaleList,
    String growthType) {}

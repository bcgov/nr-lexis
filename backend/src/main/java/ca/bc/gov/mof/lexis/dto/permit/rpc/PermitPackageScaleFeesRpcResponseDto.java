package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitPackageScaleFeesRpcResponseDto(
    String packageNumber,
    String totalFeeForPackage,
    List<PermitRpcScaleItemDto> scaleList,
    String growthType) {}

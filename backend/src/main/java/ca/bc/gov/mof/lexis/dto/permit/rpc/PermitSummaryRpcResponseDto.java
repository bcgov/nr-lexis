package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitSummaryRpcResponseDto(
    String volume,
    long pieces,
    String totalFees,
    List<PermitRpcScaleItemDto> scaleList,
    String totalFeeForPackage,
    String growthType) {}

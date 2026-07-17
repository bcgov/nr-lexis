package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

/** Package data needed to render a provincial permit's core tabs in one authorized response. */
public record PermitCorePackageRpcResponseDto(
    String packageNumber,
    PermitPackageInfoRpcResponseDto packageInfo,
    PermitPackageDetailsRpcResponseDto packageDetails,
    List<PermitScaleItemRpcResponseDto> scaleList) {}

package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

/** All permit fee rows grouped by package under one permit authorization check. */
public record PermitAllScaleFeesRpcResponseDto(
    List<PermitPackageScaleFeesRpcResponseDto> packageList) {}

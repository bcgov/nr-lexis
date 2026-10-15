package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

/**
 * All permit fee rows grouped by package under one permit authorization check.
 * {@code exemptionRateOverride} is true when the permit's exemption has a fixed override rate.
 */
public record PermitAllScaleFeesRpcResponseDto(
    List<PermitPackageScaleFeesRpcResponseDto> packageList,
    String totalVolume,
    boolean exemptionRateOverride) {}

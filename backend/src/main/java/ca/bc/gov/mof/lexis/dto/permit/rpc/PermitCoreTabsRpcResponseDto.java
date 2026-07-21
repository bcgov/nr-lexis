package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

/** Core permit-tab data assembled under one permit authorization check. */
public record PermitCoreTabsRpcResponseDto(
    List<String> applicationList, List<PermitCorePackageRpcResponseDto> packageList) {}

package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;
import java.util.Map;

/**
 * Core permit-tab data assembled under one permit authorization check. Application totals give
 * each listed application's pieces and volume on this permit, in the order of the application list.
 * Application statuses map each listed application number to its status description.
 */
public record PermitCoreTabsRpcResponseDto(
    List<String> applicationList,
    List<PermitCorePackageRpcResponseDto> packageList,
    List<PermitApplicationTotalsRpcResponseDto> applicationTotals,
    Map<String, String> applicationStatuses) {

  public PermitCoreTabsRpcResponseDto(
      List<String> applicationList, List<PermitCorePackageRpcResponseDto> packageList) {
    this(applicationList, packageList, List.of(), Map.of());
  }
}

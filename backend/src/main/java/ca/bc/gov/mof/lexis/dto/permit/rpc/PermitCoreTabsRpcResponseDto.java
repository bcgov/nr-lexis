package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

/**
 * Core permit-tab data assembled under one permit authorization check. Application totals give
 * each listed application's pieces and volume on this permit, in the order of the application list.
 */
public record PermitCoreTabsRpcResponseDto(
    List<String> applicationList,
    List<PermitCorePackageRpcResponseDto> packageList,
    List<PermitApplicationTotalsRpcResponseDto> applicationTotals) {

  public PermitCoreTabsRpcResponseDto(
      List<String> applicationList, List<PermitCorePackageRpcResponseDto> packageList) {
    this(applicationList, packageList, List.of());
  }
}

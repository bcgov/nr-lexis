package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitAvailableApplicationListRpcResponseDto(
    List<String> applicationList,
    String errorMessage,
    List<PermitAvailableApplicationItemRpcResponseDto> applicationItems) {

  public PermitAvailableApplicationListRpcResponseDto(
      List<String> applicationList, String errorMessage) {
    this(applicationList, errorMessage, List.of());
  }
}

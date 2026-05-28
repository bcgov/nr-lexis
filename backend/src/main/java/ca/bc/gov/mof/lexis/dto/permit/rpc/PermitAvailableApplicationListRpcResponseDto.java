package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitAvailableApplicationListRpcResponseDto(
    List<String> applicationList,
    String errorMessage) {}

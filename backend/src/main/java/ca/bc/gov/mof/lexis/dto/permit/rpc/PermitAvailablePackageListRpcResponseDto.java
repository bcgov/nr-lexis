package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitAvailablePackageListRpcResponseDto(
    List<String> packageList,
    String errorMessage) {}

package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitPersistenceRpcResponseDto(
    boolean success,
    String message,
    List<String> errors,
    List<String> warnings,
    Long permitNumber) {}

package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitMutationRpcResponseDto(
    boolean success,
    String message,
    List<String> errors,
    List<String> warnings,
    Long permitNumber,
    String permitStatus,
    String permitReceiptNo,
    Boolean sendApprovalEmail,
    Boolean sendRequestPermit,
    String regionalEmailAddress) {}

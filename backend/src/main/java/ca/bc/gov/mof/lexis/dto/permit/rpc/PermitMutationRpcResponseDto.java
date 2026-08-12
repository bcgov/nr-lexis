package ca.bc.gov.mof.lexis.dto.permit.rpc;

import com.fasterxml.jackson.annotation.JsonInclude;
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
    String regionalEmailAddress,
    @JsonInclude(JsonInclude.Include.NON_NULL) Double permitVolume,
    @JsonInclude(JsonInclude.Include.NON_NULL) Long permitNumberOfPieces) {

  public PermitMutationRpcResponseDto(
      boolean success,
      String message,
      List<String> errors,
      List<String> warnings,
      Long permitNumber,
      String permitStatus,
      String permitReceiptNo,
      Boolean sendApprovalEmail,
      Boolean sendRequestPermit,
      String regionalEmailAddress) {
    this(
        success,
        message,
        errors,
        warnings,
        permitNumber,
        permitStatus,
        permitReceiptNo,
        sendApprovalEmail,
        sendRequestPermit,
        regionalEmailAddress,
        null,
        null);
  }
}

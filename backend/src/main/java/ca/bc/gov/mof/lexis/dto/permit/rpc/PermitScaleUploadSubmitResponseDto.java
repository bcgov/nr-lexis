package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitScaleUploadSubmitResponseDto(
    boolean success,
    String message,
    int submittedRows,
    Long permitNumber,
    List<String> errors,
    List<String> warnings,
    List<PermitScaleUploadRowDto> rows) {}

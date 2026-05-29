package ca.bc.gov.mof.lexis.dto.application.rpc;

import java.util.List;

public record ApplicationScaleUploadSubmitResponseDto(
    boolean success,
    String message,
    int submittedRows,
    Long applicationNumber,
    List<String> errors,
    List<String> warnings,
    List<ApplicationScaleUploadRowDto> rows) {}

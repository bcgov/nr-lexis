package ca.bc.gov.mof.lexis.dto.rtm;

import java.util.List;

public record RtmEmsLogAmvUploadResultDto(
    String status,
    String fileName,
    long fileSize,
    String message,
    int attemptedRowCount,
    int uploadedRowCount,
    List<String> errors,
    List<String> warnings,
    List<RtmEmsLogAmvRowDto> rows) {}

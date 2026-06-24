package ca.bc.gov.mof.lexis.dto.rtm;

import java.util.List;

public record RtmEmsLogAmvUploadPreviewDto(
    String status,
    String fileName,
    long fileSize,
    String message,
    int rowCount,
    String retrievalDate,
    String updateDate,
    List<String> errors,
    List<String> warnings,
    List<RtmEmsLogAmvRowDto> rows) {}

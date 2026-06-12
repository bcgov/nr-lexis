package ca.bc.gov.mof.lexis.dto.upload;

import java.util.List;

public record LexisXmlImportResultDto(
    String uploadType,
    String fileName,
    long fileSize,
    String status,
    String message,
    Long applicationNumber,
    String packageNumber,
    int scaleRows,
    List<String> errors,
    List<String> warnings) {}

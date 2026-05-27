package ca.bc.gov.mof.lexis.dto.upload;

public record LexisUploadResultDto(
    String uploadType,
    String fileName,
    long fileSize,
    String status,
    String message) {}


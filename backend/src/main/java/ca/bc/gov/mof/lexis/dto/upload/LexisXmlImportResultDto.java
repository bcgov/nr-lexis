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
    List<String> warnings,
    String userReference,
    LexisXmlSubmissionSummaryDto submissionSummary) {
  public LexisXmlImportResultDto(
      String uploadType,
      String fileName,
      long fileSize,
      String status,
      String message,
      Long applicationNumber,
      String packageNumber,
      int scaleRows,
      List<String> errors,
      List<String> warnings) {
    this(
        uploadType,
        fileName,
        fileSize,
        status,
        message,
        applicationNumber,
        packageNumber,
        scaleRows,
        errors,
        warnings,
        null,
        null);
  }

  public LexisXmlImportResultDto(
      String uploadType,
      String fileName,
      long fileSize,
      String status,
      String message,
      Long applicationNumber,
      String packageNumber,
      int scaleRows,
      List<String> errors,
      List<String> warnings,
      LexisXmlSubmissionSummaryDto submissionSummary) {
    this(
        uploadType,
        fileName,
        fileSize,
        status,
        message,
        applicationNumber,
        packageNumber,
        scaleRows,
        errors,
        warnings,
        null,
        submissionSummary);
  }
}

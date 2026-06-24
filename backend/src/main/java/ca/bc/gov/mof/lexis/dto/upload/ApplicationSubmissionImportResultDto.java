package ca.bc.gov.mof.lexis.dto.upload;

import java.util.List;

public record ApplicationSubmissionImportResultDto(
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
    ApplicationSubmissionSummaryDto submissionSummary) {
  public ApplicationSubmissionImportResultDto(
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

  public ApplicationSubmissionImportResultDto(
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
      ApplicationSubmissionSummaryDto submissionSummary) {
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

  public ApplicationSubmissionImportResultDto(
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
      String userReference) {
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
        userReference,
        null);
  }

}

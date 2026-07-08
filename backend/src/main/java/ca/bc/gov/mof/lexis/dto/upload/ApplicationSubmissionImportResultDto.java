package ca.bc.gov.mof.lexis.dto.upload;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

public record ApplicationSubmissionImportResultDto(
    String uploadType,
    String fileName,
    long fileSize,
    String status,
    String message,
    Long applicationNumber,
    String packageNumber,
    @JsonInclude(JsonInclude.Include.NON_NULL) Long federalPermitNumber,
    int scaleRows,
    List<String> errors,
    List<String> warnings,
    String userReference,
    ApplicationSubmissionSummaryDto submissionSummary,
    @JsonInclude(JsonInclude.Include.NON_NULL) String requestId,
    @JsonInclude(JsonInclude.Include.NON_NULL) String idempotencyKey,
    @JsonInclude(JsonInclude.Include.NON_NULL) String payloadSha256,
    @JsonInclude(JsonInclude.Include.NON_NULL) String sourceSystem,
    @JsonInclude(JsonInclude.Include.NON_NULL) String payloadRootType) {
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
        null,
        scaleRows,
        errors,
        warnings,
        null,
        null,
        null,
        null,
        null,
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
        null,
        scaleRows,
        errors,
        warnings,
        null,
        submissionSummary,
        null,
        null,
        null,
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
      String userReference,
      ApplicationSubmissionSummaryDto submissionSummary) {
    this(
        uploadType,
        fileName,
        fileSize,
        status,
        message,
        applicationNumber,
        packageNumber,
        null,
        scaleRows,
        errors,
        warnings,
        userReference,
        submissionSummary,
        null,
        null,
        null,
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
      String userReference,
      ApplicationSubmissionSummaryDto submissionSummary,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      String sourceSystem,
      String payloadRootType) {
    this(
        uploadType,
        fileName,
        fileSize,
        status,
        message,
        applicationNumber,
        packageNumber,
        null,
        scaleRows,
        errors,
        warnings,
        userReference,
        submissionSummary,
        requestId,
        idempotencyKey,
        payloadSha256,
        sourceSystem,
        payloadRootType);
  }

  public ApplicationSubmissionImportResultDto withTraceMetadata(
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      String sourceSystem,
      String payloadRootType) {
    return new ApplicationSubmissionImportResultDto(
        uploadType,
        fileName,
        fileSize,
        status,
        message,
        applicationNumber,
        packageNumber,
        federalPermitNumber,
        scaleRows,
        errors,
        warnings,
        userReference,
        submissionSummary,
        requestId,
        idempotencyKey,
        payloadSha256,
        sourceSystem,
        payloadRootType);
  }

  public ApplicationSubmissionImportResultDto withFederalPermitNumber(Long federalPermitNumber) {
    return new ApplicationSubmissionImportResultDto(
        uploadType,
        fileName,
        fileSize,
        status,
        message,
        applicationNumber,
        packageNumber,
        federalPermitNumber,
        scaleRows,
        errors,
        warnings,
        userReference,
        submissionSummary,
        requestId,
        idempotencyKey,
        payloadSha256,
        sourceSystem,
        payloadRootType);
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

package ca.bc.gov.mof.lexis.service.coordination;

import java.time.Instant;

public class StaleRecordException extends RuntimeException {

  private final OptimisticRecordType recordType;
  private final String recordId;
  private final String expectedVersion;
  private final String currentVersion;
  private final Instant currentSavedAt;
  private final String currentUpdatedBy;

  public StaleRecordException(
      OptimisticRecordType recordType,
      String recordId,
      String expectedVersion,
      OptimisticRecordVersion currentVersion) {
    super("This record was saved by another user. Refresh before saving, or confirm overwrite.");
    this.recordType = recordType;
    this.recordId = recordId;
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion == null ? null : currentVersion.token();
    this.currentSavedAt = currentVersion == null ? null : currentVersion.savedAt();
    this.currentUpdatedBy = currentVersion == null ? null : currentVersion.updatedBy();
  }

  public OptimisticRecordType recordType() {
    return recordType;
  }

  public String recordId() {
    return recordId;
  }

  public String expectedVersion() {
    return expectedVersion;
  }

  public String currentVersion() {
    return currentVersion;
  }

  public Instant currentSavedAt() {
    return currentSavedAt;
  }

  public String currentUpdatedBy() {
    return currentUpdatedBy;
  }
}

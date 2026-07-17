package ca.bc.gov.mof.lexis.service.coordination;

import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion.ExpectedRecordVersion;
import java.util.Optional;

public record OptimisticLockRequest(Optional<ExpectedRecordVersion> expectedVersion) {

  public OptimisticLockRequest {
    expectedVersion = expectedVersion == null ? Optional.empty() : expectedVersion;
  }

  public static OptimisticLockRequest none() {
    return new OptimisticLockRequest(Optional.empty());
  }
}

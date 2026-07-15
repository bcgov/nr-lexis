package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import java.time.Clock;
import java.time.Duration;
import java.util.Collection;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * Compatibility facade for legacy edit-lock endpoints. Interactive edits use optimistic save
 * versions, so opening a record never creates a server-side lease.
 */
@Service
public class ApplicationEditLockService {

  public ApplicationEditLockService() {}

  ApplicationEditLockService(Duration ignoredTtl, Clock ignoredClock) {}

  public ApplicationEditLockDto acquire(
      Long applicationNumber, String userId, String displayName, boolean showOwner) {
    return editable(validNumber(applicationNumber));
  }

  public ApplicationEditLockDto acquirePermit(
      Long permitNumber, String userId, String displayName, boolean showOwner) {
    return editable(validNumber(permitNumber));
  }

  public ApplicationEditLockDto acquireOffer(
      Long offerNumber, String userId, String displayName, boolean showOwner) {
    return editable(validNumber(offerNumber));
  }

  public ApplicationEditLockDto acquireExemption(
      String exemptionNumber, String userId, String displayName, boolean showOwner) {
    return editable(validText(exemptionNumber));
  }

  public ApplicationEditLockDto snapshot(
      Long applicationNumber, String userId, boolean showOwner) {
    return editable(false);
  }

  public ApplicationEditLockDto snapshotPermit(
      Long permitNumber, String userId, boolean showOwner) {
    return editable(false);
  }

  public ApplicationEditLockDto snapshotOffer(
      Long offerNumber, String userId, boolean showOwner) {
    return editable(false);
  }

  public ApplicationEditLockDto snapshotExemption(
      String exemptionNumber, String userId, boolean showOwner) {
    return editable(false);
  }

  public Set<Long> lockedApplicationNumbers(Collection<Long> applicationNumbers) {
    return Set.of();
  }

  public boolean touch(Long applicationNumber, String userId) {
    return validNumber(applicationNumber);
  }

  public boolean touchOffer(Long offerNumber, String userId) {
    return validNumber(offerNumber);
  }

  public boolean release(Long applicationNumber, String userId) {
    return validNumber(applicationNumber);
  }

  public boolean releasePermit(Long permitNumber, String userId) {
    return validNumber(permitNumber);
  }

  public boolean releaseOffer(Long offerNumber, String userId) {
    return validNumber(offerNumber);
  }

  public boolean releaseExemption(String exemptionNumber, String userId) {
    return validText(exemptionNumber);
  }

  public ApplicationEditLockDto requireEditable(
      Long applicationNumber, String userId, String displayName) {
    return editable(validNumber(applicationNumber));
  }

  private ApplicationEditLockDto editable(boolean heldByCurrentUser) {
    return new ApplicationEditLockDto(false, heldByCurrentUser, null, null, null);
  }

  private boolean validNumber(Long value) {
    return value != null && value > 0;
  }

  private boolean validText(String value) {
    return value != null && !value.isBlank();
  }
}

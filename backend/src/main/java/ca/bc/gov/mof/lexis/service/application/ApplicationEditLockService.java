package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class ApplicationEditLockService {

  static final String LOCKED_MESSAGE =
      "This application is currently locked for editing by another user. The ability to make changes has been disabled.";
  static final String LOCKED_WITH_OWNER_MESSAGE =
      "This application is currently locked for editing by %s. The ability to make changes has been disabled.";
  static final String LOCK_EXPIRED_MESSAGE =
      "The application lock has expired or is no longer valid. Please close and re-open the application to acquire a new lock.";

  private final Map<String, LockState> locks = new ConcurrentHashMap<>();
  private final Duration ttl;
  private final Clock clock;

  @Autowired
  public ApplicationEditLockService(
      @Value("${lexis.application-edit-lock.ttl-minutes:20}") long ttlMinutes) {
    this(Duration.ofMinutes(ttlMinutes), Clock.systemUTC());
  }

  ApplicationEditLockService(Duration ttl, Clock clock) {
    this.ttl = ttl.isNegative() || ttl.isZero() ? Duration.ofMinutes(20) : ttl;
    this.clock = clock;
  }

  public ApplicationEditLockDto acquire(Long applicationNumber, String userId, String displayName, boolean showOwner) {
    if (applicationNumber == null || applicationNumber < 1) {
      return unlocked(false);
    }
    return acquireAggregate(
        "application:" + applicationNumber, "application", userId, displayName, showOwner);
  }

  public ApplicationEditLockDto acquirePermit(
      Long permitNumber, String userId, String displayName, boolean showOwner) {
    if (permitNumber == null || permitNumber < 1) {
      return unlocked(false);
    }
    return acquireAggregate("permit:" + permitNumber, "permit", userId, displayName, showOwner);
  }

  public ApplicationEditLockDto acquireOffer(
      Long offerNumber, String userId, String displayName, boolean showOwner) {
    if (offerNumber == null || offerNumber < 1) {
      return unlocked(false);
    }
    return acquireAggregate("offer:" + offerNumber, "offer", userId, displayName, showOwner);
  }

  public ApplicationEditLockDto acquireExemption(
      String exemptionNumber, String userId, String displayName, boolean showOwner) {
    String normalized = TextUtils.trimToNull(exemptionNumber);
    if (normalized == null) {
      return unlocked(false);
    }
    return acquireAggregate(
        "exemption:" + normalized.toUpperCase(Locale.ROOT),
        "exemption",
        userId,
        displayName,
        showOwner);
  }

  private ApplicationEditLockDto acquireAggregate(
      String aggregateKey,
      String aggregateLabel,
      String userId,
      String displayName,
      boolean showOwner) {
    String normalizedUserId = normalizeUserId(userId);
    if (normalizedUserId == null) {
      return locked(null, showOwner, aggregateLabel);
    }

    Instant now = clock.instant();
    LockState state =
        locks.compute(
            aggregateKey,
            (ignored, current) -> {
              if (current == null || current.expired(now) || current.heldBy(normalizedUserId)) {
                return new LockState(
                    normalizedUserId,
                    TextUtils.trimToNull(displayName) == null ? normalizedUserId : displayName.trim(),
                    now.plus(ttl));
              }
              return current;
            });

    if (state.heldBy(normalizedUserId)) {
      return new ApplicationEditLockDto(false, true, null, null, state.expiresAt());
    }
    return locked(state, showOwner, aggregateLabel);
  }

  public ApplicationEditLockDto snapshot(Long applicationNumber, String userId, boolean showOwner) {
    if (applicationNumber == null || applicationNumber < 1) {
      return unlocked(false);
    }
    return snapshotAggregate("application:" + applicationNumber, "application", userId, showOwner);
  }

  /**
   * Returns the active application locks from one in-memory registry snapshot pass.
   *
   * <p>Legacy search treated an application as locked even when the current user held the lock, so
   * this intentionally does not resolve a user identity. The work is bounded by the current search
   * page and performs no database calls.
   */
  public Set<Long> lockedApplicationNumbers(Collection<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return Set.of();
    }

    Set<Long> lockedApplicationNumbers = new LinkedHashSet<>();
    applicationNumbers.stream()
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
        .distinct()
        .forEach(
            applicationNumber -> {
              if (activeLock("application:" + applicationNumber) != null) {
                lockedApplicationNumbers.add(applicationNumber);
              }
            });
    return Set.copyOf(lockedApplicationNumbers);
  }

  public ApplicationEditLockDto snapshotPermit(
      Long permitNumber, String userId, boolean showOwner) {
    if (permitNumber == null || permitNumber < 1) {
      return unlocked(false);
    }
    return snapshotAggregate("permit:" + permitNumber, "permit", userId, showOwner);
  }

  public ApplicationEditLockDto snapshotOffer(
      Long offerNumber, String userId, boolean showOwner) {
    if (offerNumber == null || offerNumber < 1) {
      return unlocked(false);
    }
    return snapshotAggregate("offer:" + offerNumber, "offer", userId, showOwner);
  }

  public ApplicationEditLockDto snapshotExemption(
      String exemptionNumber, String userId, boolean showOwner) {
    String normalized = TextUtils.trimToNull(exemptionNumber);
    if (normalized == null) {
      return unlocked(false);
    }
    return snapshotAggregate(
        "exemption:" + normalized.toUpperCase(Locale.ROOT), "exemption", userId, showOwner);
  }

  private ApplicationEditLockDto snapshotAggregate(
      String aggregateKey, String aggregateLabel, String userId, boolean showOwner) {
    LockState state = activeLock(aggregateKey);
    if (state == null) {
      return unlocked(false);
    }
    boolean heldByCurrentUser = state.heldBy(normalizeUserId(userId));
    return heldByCurrentUser
        ? new ApplicationEditLockDto(false, true, null, null, state.expiresAt())
        : locked(state, showOwner, aggregateLabel);
  }

  public boolean touch(Long applicationNumber, String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (applicationNumber == null || applicationNumber < 1 || normalizedUserId == null) {
      return false;
    }
    return touchAggregate("application:" + applicationNumber, normalizedUserId);
  }

  public boolean touchOffer(Long offerNumber, String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (offerNumber == null || offerNumber < 1 || normalizedUserId == null) {
      return false;
    }
    return touchAggregate("offer:" + offerNumber, normalizedUserId);
  }

  private boolean touchAggregate(String aggregateKey, String normalizedUserId) {
    Instant now = clock.instant();
    LockState state =
        locks.computeIfPresent(
            aggregateKey,
            (ignored, current) ->
                current.expired(now)
                    ? null
                    : current.heldBy(normalizedUserId)
                        ? new LockState(current.userId(), current.displayName(), now.plus(ttl))
                        : current);
    return state != null && state.heldBy(normalizedUserId);
  }

  public boolean release(Long applicationNumber, String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (applicationNumber == null || applicationNumber < 1 || normalizedUserId == null) {
      return false;
    }
    return releaseAggregate("application:" + applicationNumber, normalizedUserId);
  }

  public boolean releasePermit(Long permitNumber, String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (permitNumber == null || permitNumber < 1 || normalizedUserId == null) {
      return false;
    }
    return releaseAggregate("permit:" + permitNumber, normalizedUserId);
  }

  public boolean releaseOffer(Long offerNumber, String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (offerNumber == null || offerNumber < 1 || normalizedUserId == null) {
      return false;
    }
    return releaseAggregate("offer:" + offerNumber, normalizedUserId);
  }

  public boolean releaseExemption(String exemptionNumber, String userId) {
    String normalizedExemption = TextUtils.trimToNull(exemptionNumber);
    String normalizedUserId = normalizeUserId(userId);
    if (normalizedExemption == null || normalizedUserId == null) {
      return false;
    }
    return releaseAggregate(
        "exemption:" + normalizedExemption.toUpperCase(Locale.ROOT), normalizedUserId);
  }

  private boolean releaseAggregate(String aggregateKey, String normalizedUserId) {
    LockState state = activeLock(aggregateKey);
    return state != null
        && state.heldBy(normalizedUserId)
        && locks.remove(aggregateKey, state);
  }

  public ApplicationEditLockDto requireEditable(Long applicationNumber, String userId, String displayName) {
    return acquire(applicationNumber, userId, displayName, false);
  }

  private LockState activeLock(String aggregateKey) {
    Instant now = clock.instant();
    LockState state = locks.get(aggregateKey);
    if (state != null && state.expired(now)) {
      locks.remove(aggregateKey, state);
      return null;
    }
    return state;
  }

  private ApplicationEditLockDto locked(
      LockState state, boolean showOwner, String aggregateLabel) {
    String lockedBy = showOwner && state != null ? state.displayName() : null;
    String message =
        lockedBy == null
            ? "This "
                + aggregateLabel
                + " is currently locked for editing by another user. The ability to make changes has been disabled."
            : "This "
                + aggregateLabel
                + " is currently locked for editing by "
                + lockedBy
                + ". The ability to make changes has been disabled.";
    return new ApplicationEditLockDto(true, false, lockedBy, message, state == null ? null : state.expiresAt());
  }

  private ApplicationEditLockDto unlocked(boolean heldByCurrentUser) {
    return new ApplicationEditLockDto(false, heldByCurrentUser, null, null, null);
  }

  private String normalizeUserId(String userId) {
    String normalized = TextUtils.trimToNull(userId);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private record LockState(String userId, String displayName, Instant expiresAt) {
    boolean heldBy(String otherUserId) {
      return otherUserId != null && userId.equalsIgnoreCase(otherUserId);
    }

    boolean expired(Instant now) {
      return !expiresAt.isAfter(now);
    }
  }
}

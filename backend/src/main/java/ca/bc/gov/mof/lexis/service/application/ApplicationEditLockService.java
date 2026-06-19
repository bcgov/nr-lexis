package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
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

  private final Map<Long, LockState> locks = new ConcurrentHashMap<>();
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
    String normalizedUserId = normalizeUserId(userId);
    if (normalizedUserId == null) {
      return locked(null, showOwner);
    }

    Instant now = clock.instant();
    LockState state =
        locks.compute(
            applicationNumber,
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
    return locked(state, showOwner);
  }

  public ApplicationEditLockDto snapshot(Long applicationNumber, String userId, boolean showOwner) {
    LockState state = activeLock(applicationNumber);
    if (state == null) {
      return unlocked(false);
    }
    boolean heldByCurrentUser = state.heldBy(normalizeUserId(userId));
    return heldByCurrentUser
        ? new ApplicationEditLockDto(false, true, null, null, state.expiresAt())
        : locked(state, showOwner);
  }

  public boolean touch(Long applicationNumber, String userId) {
    String normalizedUserId = normalizeUserId(userId);
    if (applicationNumber == null || applicationNumber < 1 || normalizedUserId == null) {
      return false;
    }
    Instant now = clock.instant();
    LockState state =
        locks.computeIfPresent(
            applicationNumber,
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
    LockState state = activeLock(applicationNumber);
    return state != null && state.heldBy(normalizedUserId) && locks.remove(applicationNumber, state);
  }

  public ApplicationEditLockDto requireEditable(Long applicationNumber, String userId, String displayName) {
    return acquire(applicationNumber, userId, displayName, false);
  }

  private LockState activeLock(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return null;
    }
    Instant now = clock.instant();
    LockState state = locks.get(applicationNumber);
    if (state != null && state.expired(now)) {
      locks.remove(applicationNumber, state);
      return null;
    }
    return state;
  }

  private ApplicationEditLockDto locked(LockState state, boolean showOwner) {
    String lockedBy = showOwner && state != null ? state.displayName() : null;
    String message =
        lockedBy == null ? LOCKED_MESSAGE : String.format(LOCKED_WITH_OWNER_MESSAGE, lockedBy);
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

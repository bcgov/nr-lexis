package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ApplicationEditLockServiceTest {

  private final MutableClock clock =
      new MutableClock(Instant.parse("2026-06-18T20:00:00Z"), ZoneOffset.UTC);
  private ApplicationEditLockService service;

  @BeforeEach
  void setup() {
    service = new ApplicationEditLockService(Duration.ofMinutes(20), clock);
  }

  @Test
  void acquireShouldReserveApplicationForFirstUserAndHideOwnerFromSubmitters() {
    ApplicationEditLockDto firstLock =
        service.acquire(45970L, "idir\\reviewer1", "Reviewer One", true);

    ApplicationEditLockDto secondLock =
        service.acquire(45970L, "idir\\reviewer2", "Reviewer Two", false);

    assertThat(firstLock.locked()).isFalse();
    assertThat(firstLock.heldByCurrentUser()).isTrue();
    assertThat(firstLock.expiresAt()).isEqualTo(Instant.parse("2026-06-18T20:20:00Z"));
    assertThat(secondLock.locked()).isTrue();
    assertThat(secondLock.heldByCurrentUser()).isFalse();
    assertThat(secondLock.lockedBy()).isNull();
    assertThat(secondLock.message()).isEqualTo(ApplicationEditLockService.LOCKED_MESSAGE);
  }

  @Test
  void snapshotShouldShowLockOwnerWhenUserCanReviewApplications() {
    service.acquire(45970L, "idir\\reviewer1", "Reviewer One", true);

    ApplicationEditLockDto lock = service.snapshot(45970L, "idir\\reviewer2", true);

    assertThat(lock.locked()).isTrue();
    assertThat(lock.lockedBy()).isEqualTo("Reviewer One");
    assertThat(lock.message()).contains("Reviewer One");
  }

  @Test
  void acquireShouldRenewLockForCurrentHolder() {
    service.acquire(45970L, "idir\\reviewer1", "Reviewer One", true);
    clock.advance(Duration.ofMinutes(5));

    ApplicationEditLockDto lock =
        service.acquire(45970L, "IDIR\\REVIEWER1", "Reviewer One", true);

    assertThat(lock.locked()).isFalse();
    assertThat(lock.heldByCurrentUser()).isTrue();
    assertThat(lock.expiresAt()).isEqualTo(Instant.parse("2026-06-18T20:25:00Z"));
  }

  @Test
  void releaseShouldOnlyReleaseCurrentHolderLock() {
    service.acquire(45970L, "idir\\reviewer1", "Reviewer One", true);

    assertThat(service.release(45970L, "idir\\reviewer2")).isFalse();
    assertThat(service.release(45970L, "idir\\reviewer1")).isTrue();

    ApplicationEditLockDto lock =
        service.acquire(45970L, "idir\\reviewer2", "Reviewer Two", true);
    assertThat(lock.locked()).isFalse();
    assertThat(lock.heldByCurrentUser()).isTrue();
  }

  @Test
  void expiredLockShouldBeAvailableToNextUser() {
    service.acquire(45970L, "idir\\reviewer1", "Reviewer One", true);
    clock.advance(Duration.ofMinutes(21));

    ApplicationEditLockDto lock =
        service.acquire(45970L, "idir\\reviewer2", "Reviewer Two", true);

    assertThat(lock.locked()).isFalse();
    assertThat(lock.heldByCurrentUser()).isTrue();
    assertThat(lock.expiresAt()).isEqualTo(Instant.parse("2026-06-18T20:41:00Z"));
  }

  private static final class MutableClock extends Clock {
    private Instant instant;
    private final ZoneId zone;

    private MutableClock(Instant instant, ZoneId zone) {
      this.instant = instant;
      this.zone = zone;
    }

    private void advance(Duration duration) {
      instant = instant.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return zone;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return new MutableClock(instant, zone);
    }

    @Override
    public Instant instant() {
      return instant;
    }
  }
}

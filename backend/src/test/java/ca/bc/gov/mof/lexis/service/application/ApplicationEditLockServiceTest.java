package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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
  void lockedApplicationNumbersShouldResolveOnePageWithoutChangingLockOwnership() {
    service.acquire(45970L, "idir\\reviewer1", "Reviewer One", true);
    service.acquire(45971L, "idir\\reviewer2", "Reviewer Two", true);
    clock.advance(Duration.ofMinutes(21));
    service.acquire(45972L, "idir\\reviewer3", "Reviewer Three", true);

    assertThat(
            service.lockedApplicationNumbers(
                List.of(45970L, 45971L, 45972L, 45972L, -1L)))
        .containsExactly(45972L);
    assertThat(service.snapshot(45972L, "idir\\reviewer4", true).lockedBy())
        .isEqualTo("Reviewer Three");
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

  @Test
  void applicationPermitExemptionAndOfferLocksShouldUseIndependentAggregateNamespaces() {
    ApplicationEditLockDto applicationLock =
        service.acquire(45970L, "idir\\reviewer1", "Reviewer One", true);
    ApplicationEditLockDto permitLock =
        service.acquirePermit(45970L, "idir\\reviewer2", "Reviewer Two", true);
    ApplicationEditLockDto exemptionLock =
        service.acquireExemption("ex-45970", "idir\\reviewer3", "Reviewer Three", true);
    ApplicationEditLockDto offerLock =
        service.acquireOffer(45970L, "idir\\reviewer4", "Reviewer Four", true);

    assertThat(applicationLock.locked()).isFalse();
    assertThat(permitLock.locked()).isFalse();
    assertThat(exemptionLock.locked()).isFalse();
    assertThat(offerLock.locked()).isFalse();
    assertThat(service.snapshotPermit(45970L, "idir\\reviewer1", true).lockedBy())
        .isEqualTo("Reviewer Two");
    assertThat(service.snapshotExemption("EX-45970", "idir\\reviewer1", true).lockedBy())
        .isEqualTo("Reviewer Three");
    assertThat(service.snapshotOffer(45970L, "idir\\reviewer1", true).lockedBy())
        .isEqualTo("Reviewer Four");
  }

  @Test
  void permitAndExemptionLocksShouldRejectOtherEditorsAndReleaseOnlyTheirOwner() {
    service.acquirePermit(88L, "idir\\reviewer1", "Reviewer One", false);
    service.acquireExemption("EX-88", "idir\\reviewer1", "Reviewer One", false);

    ApplicationEditLockDto permitLock =
        service.acquirePermit(88L, "idir\\reviewer2", "Reviewer Two", false);
    ApplicationEditLockDto exemptionLock =
        service.acquireExemption("ex-88", "idir\\reviewer2", "Reviewer Two", false);

    assertThat(permitLock.locked()).isTrue();
    assertThat(permitLock.message()).startsWith("This permit is currently locked");
    assertThat(exemptionLock.locked()).isTrue();
    assertThat(exemptionLock.message()).startsWith("This exemption is currently locked");
    assertThat(service.releasePermit(88L, "idir\\reviewer2")).isFalse();
    assertThat(service.releaseExemption("EX-88", "idir\\reviewer2")).isFalse();
    assertThat(service.releasePermit(88L, "idir\\reviewer1")).isTrue();
    assertThat(service.releaseExemption("EX-88", "idir\\reviewer1")).isTrue();
  }

  @Test
  void offerLockShouldRequireItsOwnerForTouchAndRelease() {
    service.acquireOffer(81001L, "idir\\reviewer1", "Reviewer One", false);

    assertThat(service.touchOffer(81001L, "idir\\reviewer2")).isFalse();
    assertThat(service.releaseOffer(81001L, "idir\\reviewer2")).isFalse();
    assertThat(service.touchOffer(81001L, "IDIR\\REVIEWER1")).isTrue();
    assertThat(service.releaseOffer(81001L, "idir\\reviewer1")).isTrue();
  }

  @Test
  void concurrentOfferEditorsShouldProduceExactlyOneLockOwner() throws Exception {
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<ApplicationEditLockDto> first =
          executor.submit(
              () -> {
                ready.countDown();
                start.await();
                return service.acquireOffer(81001L, "idir\\reviewer1", "Reviewer One", true);
              });
      Future<ApplicationEditLockDto> second =
          executor.submit(
              () -> {
                ready.countDown();
                start.await();
                return service.acquireOffer(81001L, "idir\\reviewer2", "Reviewer Two", true);
              });

      assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      List<ApplicationEditLockDto> results = List.of(first.get(), second.get());

      assertThat(results).filteredOn(ApplicationEditLockDto::heldByCurrentUser).hasSize(1);
      assertThat(results).filteredOn(ApplicationEditLockDto::locked).hasSize(1);
    } finally {
      executor.shutdownNow();
    }
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

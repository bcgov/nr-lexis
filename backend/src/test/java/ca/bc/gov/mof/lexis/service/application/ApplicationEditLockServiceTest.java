package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ApplicationEditLockServiceTest {

  private ApplicationEditLockService service;

  @BeforeEach
  void setUp() {
    service = new ApplicationEditLockService(Duration.ofMinutes(20), Clock.systemUTC());
  }

  @Test
  void openingTheSameApplicationFromDifferentUsersShouldNotCreateALease() {
    var first = service.acquire(45970L, "IDIR\\FIRST", "First User", true);
    var second = service.acquire(45970L, "IDIR\\SECOND", "Second User", true);

    assertThat(first.locked()).isFalse();
    assertThat(second.locked()).isFalse();
    assertThat(service.snapshot(45970L, "IDIR\\THIRD", true).locked()).isFalse();
    assertThat(service.lockedApplicationNumbers(List.of(45970L))).isEmpty();
  }

  @Test
  void allInteractiveAggregateTypesShouldRemainEditable() {
    assertThat(service.acquirePermit(70001L, "IDIR\\USER", "User", true).locked()).isFalse();
    assertThat(service.acquireExemption("EX-1", "IDIR\\USER", "User", true).locked()).isFalse();
    assertThat(service.acquireOffer(80001L, "IDIR\\USER", "User", true).locked()).isFalse();
  }

  @Test
  void compatibilityTouchAndReleaseShouldNotDependOnStoredState() {
    assertThat(service.touch(45970L, "IDIR\\USER")).isTrue();
    assertThat(service.touchOffer(80001L, "IDIR\\USER")).isTrue();
    assertThat(service.release(45970L, "IDIR\\USER")).isTrue();
    assertThat(service.releasePermit(70001L, "IDIR\\USER")).isTrue();
    assertThat(service.releaseExemption("EX-1", "IDIR\\USER")).isTrue();
    assertThat(service.releaseOffer(80001L, "IDIR\\USER")).isTrue();
  }
}

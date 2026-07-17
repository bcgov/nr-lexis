package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ApplicationEditLockServiceTest {

  private static final long SYNTHETIC_APPLICATION_NUMBER = 999_000_001L;
  private static final long SYNTHETIC_PERMIT_NUMBER = 999_000_002L;
  private static final long SYNTHETIC_OFFER_NUMBER = 999_000_003L;
  private static final String SYNTHETIC_EXEMPTION_NUMBER = "TEST-EX-001";

  private ApplicationEditLockService service;

  @BeforeEach
  void setUp() {
    service = new ApplicationEditLockService();
  }

  @Test
  void openingTheSameApplicationFromDifferentUsersShouldNotCreateALease() {
    var first = service.acquire(SYNTHETIC_APPLICATION_NUMBER, "IDIR\\FIRST", "First User", true);
    var second =
        service.acquire(SYNTHETIC_APPLICATION_NUMBER, "IDIR\\SECOND", "Second User", true);

    assertThat(first.locked()).isFalse();
    assertThat(second.locked()).isFalse();
    assertThat(service.snapshot(SYNTHETIC_APPLICATION_NUMBER, "IDIR\\THIRD", true).locked())
        .isFalse();
    assertThat(service.lockedApplicationNumbers(List.of(SYNTHETIC_APPLICATION_NUMBER))).isEmpty();
  }

  @Test
  void allInteractiveAggregateTypesShouldRemainEditable() {
    assertThat(
            service.acquirePermit(SYNTHETIC_PERMIT_NUMBER, "IDIR\\USER", "User", true).locked())
        .isFalse();
    assertThat(
            service
                .acquireExemption(SYNTHETIC_EXEMPTION_NUMBER, "IDIR\\USER", "User", true)
                .locked())
        .isFalse();
    assertThat(
            service.acquireOffer(SYNTHETIC_OFFER_NUMBER, "IDIR\\USER", "User", true).locked())
        .isFalse();
  }

  @Test
  void compatibilityReleaseShouldNotDependOnStoredState() {
    assertThat(service.release(SYNTHETIC_APPLICATION_NUMBER, "IDIR\\USER")).isTrue();
    assertThat(service.releasePermit(SYNTHETIC_PERMIT_NUMBER, "IDIR\\USER")).isTrue();
    assertThat(service.releaseExemption(SYNTHETIC_EXEMPTION_NUMBER, "IDIR\\USER")).isTrue();
    assertThat(service.releaseOffer(SYNTHETIC_OFFER_NUMBER, "IDIR\\USER")).isTrue();
  }
}

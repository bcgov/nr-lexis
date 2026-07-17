package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class FederalSubmissionIdempotencyStoreTest {

  @Test
  void shouldExpireStaleClaimsAfterTtl() {
    MutableClock clock = new MutableClock(Instant.parse("2026-07-10T20:00:00Z"));
    FederalSubmissionIdempotencyStore store =
        new FederalSubmissionIdempotencyStore(Duration.ofSeconds(30), 2, clock);

    FederalSubmissionIdempotencyStore.Decision first =
        store.claim(" caller ", " key ", "digest-one");
    FederalSubmissionIdempotencyStore.Decision normalizedDuplicate =
        store.claim("caller", "key", "digest-one");
    FederalSubmissionIdempotencyStore.Decision payloadMismatch =
        store.claim("caller", "key", "digest-two");
    clock.advance(Duration.ofSeconds(31));
    FederalSubmissionIdempotencyStore.Decision replacement =
        store.claim("caller", "key", "digest-two");

    assertThat(first.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
    assertThat(normalizedDuplicate.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.IN_FLIGHT);
    assertThat(payloadMismatch.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.PAYLOAD_MISMATCH);
    assertThat(replacement.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
    assertThat(store.size()).isEqualTo(1);
  }

  @Test
  void shouldFailClosedAtCapacityUntilEntriesExpire() {
    MutableClock clock = new MutableClock(Instant.parse("2026-07-10T20:00:00Z"));
    FederalSubmissionIdempotencyStore store =
        new FederalSubmissionIdempotencyStore(Duration.ofMinutes(5), 2, clock);

    FederalSubmissionIdempotencyStore.Decision first = store.claim("caller", "key-1", "digest-1");
    FederalSubmissionIdempotencyStore.Decision second = store.claim("caller", "key-2", "digest-2");
    FederalSubmissionIdempotencyStore.Decision full = store.claim("caller", "key-3", "digest-3");

    assertThat(first.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
    assertThat(second.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
    assertThat(full.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CAPACITY_EXCEEDED);

    store.complete(first.claim(), acceptedResponse());
    FederalSubmissionIdempotencyStore.Decision stillFull =
        store.claim("caller", "key-3", "digest-3");

    assertThat(stillFull.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CAPACITY_EXCEEDED);
    assertThat(store.claim("caller", "key-2", "digest-2").outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.IN_FLIGHT);
    assertThat(store.size()).isEqualTo(2);

    clock.advance(Duration.ofMinutes(6));
    assertThat(store.claim("caller", "key-3", "digest-3").outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
  }

  @Test
  void shouldReplayNonServerErrorAndReleaseServerError() {
    FederalSubmissionIdempotencyStore store =
        new FederalSubmissionIdempotencyStore(
            Duration.ofMinutes(5),
            10,
            Clock.fixed(Instant.parse("2026-07-10T20:00:00Z"), ZoneOffset.UTC));
    FederalSubmissionIdempotencyStore.Decision completedClaim =
        store.claim("caller", "completed", "digest");
    ResponseEntity<ApplicationSubmissionImportResultDto> completedResponse =
        ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
            .header("X-Test-Header", "preserved")
            .body(result());

    store.complete(completedClaim.claim(), completedResponse);
    FederalSubmissionIdempotencyStore.Decision replay =
        store.claim("caller", "completed", "digest");

    assertThat(replay.outcome()).isEqualTo(FederalSubmissionIdempotencyStore.Outcome.REPLAY);
    assertThat(replay.replayResponse().getStatusCode()).isEqualTo(completedResponse.getStatusCode());
    assertThat(replay.replayResponse().getHeaders()).isEqualTo(completedResponse.getHeaders());
    assertThat(replay.replayResponse().getBody()).isEqualTo(completedResponse.getBody());

    FederalSubmissionIdempotencyStore.Decision transientClaim =
        store.claim("caller", "transient", "digest");
    store.complete(
        transientClaim.claim(),
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(result()));

    assertThat(store.claim("caller", "transient", "digest").outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> acceptedResponse() {
    return ResponseEntity.status(HttpStatus.CREATED)
        .header("Location", "/api/lexis/federal/applications/9001")
        .header("X-Test-Header", "preserved")
        .body(result());
  }

  private ApplicationSubmissionImportResultDto result() {
    return new ApplicationSubmissionImportResultDto(
        "applicationSubmission",
        "federal.xml",
        100L,
        "accepted",
        "created",
        9001L,
        "FED-1",
        1,
        List.of(),
        List.of());
  }

  private static final class MutableClock extends Clock {
    private Instant instant;

    private MutableClock(Instant instant) {
      this.instant = instant;
    }

    private void advance(Duration duration) {
      instant = instant.plus(duration);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return instant;
    }
  }
}

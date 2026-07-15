package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * Process-local duplicate suppression for synchronous federal submissions. State is not shared
 * across pods or retained across restarts.
 */
@Component
final class FederalSubmissionIdempotencyStore {

  static final Duration DEFAULT_TTL = Duration.ofMinutes(15);
  static final int DEFAULT_MAX_ENTRIES = 10_000;

  private static final String UNKNOWN_CALLER = "<unknown-authenticated-caller>";

  private final Duration ttl;
  private final int maxEntries;
  private final Clock clock;
  private final Map<ScopedKey, Entry> entries = new LinkedHashMap<>();
  private long nextClaimId;

  FederalSubmissionIdempotencyStore() {
    this(DEFAULT_TTL, DEFAULT_MAX_ENTRIES, Clock.systemUTC());
  }

  FederalSubmissionIdempotencyStore(Duration ttl, int maxEntries, Clock clock) {
    if (ttl == null || ttl.isZero() || ttl.isNegative()) {
      throw new IllegalArgumentException("Federal submission idempotency TTL must be positive.");
    }
    if (maxEntries < 1) {
      throw new IllegalArgumentException(
          "Federal submission idempotency maximum entries must be positive.");
    }
    this.ttl = ttl;
    this.maxEntries = maxEntries;
    this.clock = Objects.requireNonNull(clock, "clock");
  }

  synchronized Decision claim(String caller, String idempotencyKey, String payloadSha256) {
    ScopedKey scopedKey =
        new ScopedKey(normalize(caller, UNKNOWN_CALLER), requireValue(idempotencyKey, "key"));
    String normalizedPayloadSha256 = requireValue(payloadSha256, "payload SHA-256");
    Instant now = clock.instant();
    removeExpired(now);

    Entry existing = entries.get(scopedKey);
    if (existing != null) {
      if (!existing.payloadSha256.equals(normalizedPayloadSha256)) {
        return Decision.payloadMismatch();
      }
      if (existing.response != null) {
        return Decision.replay(existing.response.toResponseEntity());
      }
      return Decision.inFlight();
    }

    if (entries.size() >= maxEntries) {
      return Decision.capacityExceeded();
    }

    long claimId = ++nextClaimId;
    entries.put(
        scopedKey,
        new Entry(normalizedPayloadSha256, claimId, now.plus(ttl), null));
    return Decision.claimed(new Claim(scopedKey.caller(), scopedKey.idempotencyKey(), claimId));
  }

  synchronized void complete(
      Claim claim, ResponseEntity<ApplicationSubmissionImportResultDto> response) {
    if (claim == null || response == null || response.getStatusCode().is5xxServerError()) {
      release(claim);
      return;
    }

    ScopedKey scopedKey = new ScopedKey(claim.caller(), claim.idempotencyKey());
    Entry current = entries.get(scopedKey);
    if (current == null || current.claimId != claim.claimId()) {
      return;
    }
    current.response = CachedResponse.from(response);
    current.expiresAt = clock.instant().plus(ttl);
  }

  synchronized void release(Claim claim) {
    if (claim == null) {
      return;
    }
    ScopedKey scopedKey = new ScopedKey(claim.caller(), claim.idempotencyKey());
    Entry current = entries.get(scopedKey);
    if (current != null && current.claimId == claim.claimId()) {
      entries.remove(scopedKey);
    }
  }

  synchronized int size() {
    removeExpired(clock.instant());
    return entries.size();
  }

  private void removeExpired(Instant now) {
    entries.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt));
  }

  private String requireValue(String value, String description) {
    String normalized = normalize(value, null);
    if (normalized == null) {
      throw new IllegalArgumentException(
          "Federal submission idempotency " + description + " is required.");
    }
    return normalized;
  }

  private String normalize(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }

  enum Outcome {
    CLAIMED,
    REPLAY,
    PAYLOAD_MISMATCH,
    IN_FLIGHT,
    CAPACITY_EXCEEDED
  }

  record Claim(String caller, String idempotencyKey, long claimId) {}

  record Decision(
      Outcome outcome,
      Claim claim,
      ResponseEntity<ApplicationSubmissionImportResultDto> replayResponse) {

    private static Decision claimed(Claim claim) {
      return new Decision(Outcome.CLAIMED, claim, null);
    }

    private static Decision replay(
        ResponseEntity<ApplicationSubmissionImportResultDto> replayResponse) {
      return new Decision(Outcome.REPLAY, null, replayResponse);
    }

    private static Decision payloadMismatch() {
      return new Decision(Outcome.PAYLOAD_MISMATCH, null, null);
    }

    private static Decision inFlight() {
      return new Decision(Outcome.IN_FLIGHT, null, null);
    }

    private static Decision capacityExceeded() {
      return new Decision(Outcome.CAPACITY_EXCEEDED, null, null);
    }
  }

  private record ScopedKey(String caller, String idempotencyKey) {}

  private static final class Entry {
    private final String payloadSha256;
    private final long claimId;
    private Instant expiresAt;
    private CachedResponse response;

    private Entry(
        String payloadSha256, long claimId, Instant expiresAt, CachedResponse response) {
      this.payloadSha256 = payloadSha256;
      this.claimId = claimId;
      this.expiresAt = expiresAt;
      this.response = response;
    }
  }

  private record CachedResponse(
      int status,
      HttpHeaders headers,
      ApplicationSubmissionImportResultDto body) {

    private static CachedResponse from(
        ResponseEntity<ApplicationSubmissionImportResultDto> response) {
      return new CachedResponse(
          response.getStatusCode().value(), copyHeaders(response.getHeaders()), response.getBody());
    }

    private ResponseEntity<ApplicationSubmissionImportResultDto> toResponseEntity() {
      return ResponseEntity.status(status).headers(copyHeaders(headers)).body(body);
    }

    private static HttpHeaders copyHeaders(HttpHeaders source) {
      HttpHeaders copy = new HttpHeaders();
      source.forEach((name, values) -> copy.put(name, new ArrayList<>(values)));
      return copy;
    }
  }
}

package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

/** Shares federal submission claims and replay responses across backend pods. */
@Service
@Profile("oracle")
final class RedisFederalSubmissionIdempotencyStore {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(RedisFederalSubmissionIdempotencyStore.class);

  private static final long CLAIMED = 1L;
  private static final long REPLAY = 2L;
  private static final long IN_FLIGHT = 3L;
  private static final long PAYLOAD_MISMATCH = 4L;
  private static final DefaultRedisScript<Long> CLAIM_SCRIPT =
      new DefaultRedisScript<>(
          "if redis.call('exists',KEYS[1])==1 then "
              + "if redis.call('hget',KEYS[1],'payload')~=ARGV[1] then return 4 end; "
              + "if redis.call('hget',KEYS[1],'state')=='COMPLETED' then return 2 end; "
              + "return 3; end; "
              + "redis.call('hset',KEYS[1],'payload',ARGV[1],'claim',ARGV[2],'state','IN_FLIGHT'); "
              + "redis.call('pexpire',KEYS[1],ARGV[3]); return 1",
          Long.class);
  private static final DefaultRedisScript<Long> COMPLETE_SCRIPT =
      new DefaultRedisScript<>(
          "if redis.call('hget',KEYS[1],'claim')~=ARGV[1] then return 0 end; "
              + "redis.call('hset',KEYS[1],'state','COMPLETED','response',ARGV[2]); "
              + "redis.call('pexpire',KEYS[1],ARGV[3]); return 1",
          Long.class);
  private static final DefaultRedisScript<Long> RENEW_SCRIPT =
      new DefaultRedisScript<>(
          "if redis.call('hget',KEYS[1],'claim')==ARGV[1] "
              + "and redis.call('hget',KEYS[1],'state')=='IN_FLIGHT' then "
              + "return redis.call('pexpire',KEYS[1],ARGV[2]); end; return 0",
          Long.class);
  private static final DefaultRedisScript<Long> RELEASE_SCRIPT =
      new DefaultRedisScript<>(
          "if redis.call('hget',KEYS[1],'claim')==ARGV[1] then "
              + "return redis.call('del',KEYS[1]); end; return 0",
          Long.class);

  private final StringRedisTemplate redisTemplate;
  private final RedisCoordinationKeyspace keyspace;
  private final ObjectMapper objectMapper;
  private final Duration inFlightTtl;
  private final Duration replayTtl;
  private final Map<String, ScheduledFuture<?>> renewals = new ConcurrentHashMap<>();
  private final ScheduledExecutorService renewalExecutor =
      Executors.newScheduledThreadPool(
          2,
          Thread.ofPlatform().name("lexis-federal-idempotency-renewal-", 0).daemon(true).factory());

  RedisFederalSubmissionIdempotencyStore(
      StringRedisTemplate redisTemplate,
      RedisCoordinationKeyspace keyspace,
      ObjectMapper objectMapper,
      @Value("${lexis.federal-submission.in-flight-ttl:5m}") Duration inFlightTtl,
      @Value("${lexis.federal-submission.replay-ttl:24h}") Duration replayTtl) {
    this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate");
    this.keyspace = Objects.requireNonNull(keyspace, "keyspace");
    this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    this.inFlightTtl = positive(inFlightTtl, "in-flight TTL");
    this.replayTtl = positive(replayTtl, "replay TTL");
  }

  FederalSubmissionIdempotencyStore.Decision claim(
      String caller, String idempotencyKey, String payloadSha256) {
    String key = redisKey(caller, idempotencyKey);
    long claimId = ThreadLocalRandom.current().nextLong(1L, Long.MAX_VALUE);
    Long outcome =
        redisTemplate.execute(
            CLAIM_SCRIPT,
            List.of(key),
            payloadSha256,
            Long.toString(claimId),
            Long.toString(inFlightTtl.toMillis()));
    if (Long.valueOf(CLAIMED).equals(outcome)) {
      FederalSubmissionIdempotencyStore.Claim claim =
          new FederalSubmissionIdempotencyStore.Claim(caller, idempotencyKey, claimId);
      scheduleRenewal(key, claim);
      return FederalSubmissionIdempotencyStore.Decision.claimed(claim);
    }
    if (Long.valueOf(PAYLOAD_MISMATCH).equals(outcome)) {
      return FederalSubmissionIdempotencyStore.Decision.payloadMismatch();
    }
    if (Long.valueOf(IN_FLIGHT).equals(outcome)) {
      return FederalSubmissionIdempotencyStore.Decision.inFlight();
    }
    if (Long.valueOf(REPLAY).equals(outcome)) {
      String encoded = (String) redisTemplate.opsForHash().get(key, "response");
      if (encoded == null) {
        return FederalSubmissionIdempotencyStore.Decision.inFlight();
      }
      return FederalSubmissionIdempotencyStore.Decision.replay(decodeResponse(encoded));
    }
    throw new IllegalStateException("LEXIS Redis idempotency claim returned no decision.");
  }

  void complete(
      FederalSubmissionIdempotencyStore.Claim claim,
      ResponseEntity<ApplicationSubmissionImportResultDto> response) {
    if (claim == null || response == null || response.getStatusCode().is5xxServerError()) {
      release(claim);
      return;
    }
    cancelRenewal(claim);
    try {
      Long completed =
          redisTemplate.execute(
              COMPLETE_SCRIPT,
              List.of(redisKey(claim.caller(), claim.idempotencyKey())),
              Long.toString(claim.claimId()),
              encodeResponse(response),
              Long.toString(replayTtl.toMillis()));
      if (!Long.valueOf(1L).equals(completed)) {
        LOGGER.warn(
            "event=lexis_federal_idempotency outcome=completion_not_stored reason=claim_not_owned");
      }
    } catch (RuntimeException exception) {
      LOGGER.warn("Unable to cache a completed federal submission response", exception);
    }
  }

  void release(FederalSubmissionIdempotencyStore.Claim claim) {
    if (claim == null) {
      return;
    }
    cancelRenewal(claim);
    try {
      redisTemplate.execute(
          RELEASE_SCRIPT,
          List.of(redisKey(claim.caller(), claim.idempotencyKey())),
          Long.toString(claim.claimId()));
    } catch (RuntimeException exception) {
      LOGGER.warn("Unable to release a federal submission idempotency claim", exception);
    }
  }

  private void scheduleRenewal(
      String key, FederalSubmissionIdempotencyStore.Claim claim) {
    long delayMillis = Math.max(100L, inFlightTtl.toMillis() / 4L);
    String handle = claimHandle(claim);
    ScheduledFuture<?> future =
        renewalExecutor.scheduleWithFixedDelay(
            () -> renewClaim(key, claim, handle),
            delayMillis,
            delayMillis,
            TimeUnit.MILLISECONDS);
    renewals.put(handle, future);
  }

  private void renewClaim(
      String key, FederalSubmissionIdempotencyStore.Claim claim, String handle) {
    try {
      Long renewed =
          redisTemplate.execute(
              RENEW_SCRIPT,
              List.of(key),
              Long.toString(claim.claimId()),
              Long.toString(inFlightTtl.toMillis()));
      if (!Long.valueOf(1L).equals(renewed)) {
        cancelRenewal(handle);
        LOGGER.warn(
            "event=lexis_federal_idempotency outcome=renewal_stopped reason=claim_not_owned");
      }
    } catch (RuntimeException exception) {
      LOGGER.warn("Unable to renew a federal submission idempotency claim", exception);
    }
  }

  private void cancelRenewal(FederalSubmissionIdempotencyStore.Claim claim) {
    cancelRenewal(claimHandle(claim));
  }

  private void cancelRenewal(String handle) {
    ScheduledFuture<?> renewal = renewals.remove(handle);
    if (renewal != null) {
      renewal.cancel(false);
    }
  }

  private String claimHandle(FederalSubmissionIdempotencyStore.Claim claim) {
    return claim.caller() + "\u0000" + claim.idempotencyKey() + "\u0000" + claim.claimId();
  }

  @PreDestroy
  void shutdownRenewals() {
    renewals.values().forEach(future -> future.cancel(false));
    renewals.clear();
    renewalExecutor.shutdownNow();
  }

  private Duration positive(Duration duration, String label) {
    if (duration == null || duration.isZero() || duration.isNegative()) {
      throw new IllegalArgumentException("Federal submission " + label + " must be positive.");
    }
    return duration;
  }

  private String redisKey(String caller, String idempotencyKey) {
    return keyspace.key("federal-idempotency", sha256(caller + "\u0000" + idempotencyKey));
  }

  private String sha256(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is unavailable.", exception);
    }
  }

  private String encodeResponse(ResponseEntity<ApplicationSubmissionImportResultDto> response) {
    try {
      return objectMapper.writeValueAsString(
          new StoredResponse(
              response.getStatusCode().value(), response.getHeaders(), response.getBody()));
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("Federal idempotency response could not be stored.", exception);
    }
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> decodeResponse(String encoded) {
    try {
      StoredResponse stored = objectMapper.readValue(encoded, StoredResponse.class);
      HttpHeaders headers = new HttpHeaders();
      if (stored.headers() != null) {
        stored.headers().forEach(headers::put);
      }
      return ResponseEntity.status(stored.status()).headers(headers).body(stored.body());
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("Federal idempotency response could not be replayed.", exception);
    }
  }

  private record StoredResponse(
      int status,
      Map<String, List<String>> headers,
      ApplicationSubmissionImportResultDto body) {}
}

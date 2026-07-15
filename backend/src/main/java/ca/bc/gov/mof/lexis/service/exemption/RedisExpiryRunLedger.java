package ca.bc.gov.mof.lexis.service.exemption;

import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/** Records successful expiry business dates so pod starts cannot repeat a completed daily run. */
@Service
@Profile("oracle")
class RedisExpiryRunLedger {

  private final StringRedisTemplate redisTemplate;
  private final RedisCoordinationKeyspace keyspace;
  private final Duration retention;

  RedisExpiryRunLedger(
      StringRedisTemplate redisTemplate,
      RedisCoordinationKeyspace keyspace,
      @Value("${lexis.expiry.completion-retention:3d}") Duration retention) {
    this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate");
    this.keyspace = Objects.requireNonNull(keyspace, "keyspace");
    if (retention == null || retention.isZero() || retention.isNegative()) {
      throw new IllegalArgumentException("Expiry completion retention must be positive.");
    }
    this.retention = retention;
  }

  boolean completed(LocalDate businessDate) {
    return Boolean.TRUE.equals(redisTemplate.hasKey(key(businessDate)));
  }

  void markCompleted(LocalDate businessDate) {
    redisTemplate.opsForValue().set(key(businessDate), "completed", retention);
  }

  private String key(LocalDate businessDate) {
    return keyspace.key(
        "expiry-completed", Objects.requireNonNull(businessDate, "businessDate").toString());
  }
}

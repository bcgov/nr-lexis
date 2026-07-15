package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

/** Stores interactive edit leases in Redis so every backend pod sees the same editor. */
@Service
@Profile("oracle")
final class RedisEditLockStore {

  private static final DefaultRedisScript<String> ACQUIRE_SCRIPT =
      new DefaultRedisScript<>(
          "local current=redis.call('get',KEYS[1]); "
              + "if (not current) or string.sub(current,1,string.len(ARGV[2]))==ARGV[2] then "
              + "redis.call('psetex',KEYS[1],ARGV[3],ARGV[1]); return ARGV[1]; end; "
              + "return current",
          String.class);
  private static final DefaultRedisScript<Long> TOUCH_SCRIPT =
      new DefaultRedisScript<>(
          "local current=redis.call('get',KEYS[1]); "
              + "if current and string.sub(current,1,string.len(ARGV[1]))==ARGV[1] then "
              + "return redis.call('pexpire',KEYS[1],ARGV[2]); end; return 0",
          Long.class);
  private static final DefaultRedisScript<Long> RELEASE_SCRIPT =
      new DefaultRedisScript<>(
          "local current=redis.call('get',KEYS[1]); "
              + "if current and string.sub(current,1,string.len(ARGV[1]))==ARGV[1] then "
              + "return redis.call('del',KEYS[1]); end; return 0",
          Long.class);

  private final StringRedisTemplate redisTemplate;
  private final RedisCoordinationKeyspace keyspace;
  private final Clock clock;

  RedisEditLockStore(
      StringRedisTemplate redisTemplate, RedisCoordinationKeyspace keyspace) {
    this(redisTemplate, keyspace, Clock.systemUTC());
  }

  RedisEditLockStore(
      StringRedisTemplate redisTemplate, RedisCoordinationKeyspace keyspace, Clock clock) {
    this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate");
    this.keyspace = Objects.requireNonNull(keyspace, "keyspace");
    this.clock = Objects.requireNonNull(clock, "clock");
  }

  LockRecord acquire(
      String aggregateKey, String normalizedUserId, String displayName, Duration ttl) {
    String key = redisKey(aggregateKey);
    String ownerPrefix = ownerPrefix(normalizedUserId);
    String encoded = ownerPrefix + encode(displayName);
    String current =
        redisTemplate.execute(
            ACQUIRE_SCRIPT,
            List.of(key),
            encoded,
            ownerPrefix,
            Long.toString(ttl.toMillis()));
    return decodeWithExpiry(key, current);
  }

  LockRecord activeLock(String aggregateKey) {
    String key = redisKey(aggregateKey);
    return decodeWithExpiry(key, redisTemplate.opsForValue().get(key));
  }

  Set<Long> lockedApplicationNumbers(Collection<Long> applicationNumbers) {
    List<Long> numbers =
        applicationNumbers.stream()
            .filter(number -> number != null && number > 0)
            .distinct()
            .toList();
    if (numbers.isEmpty()) {
      return Set.of();
    }
    List<String> values =
        redisTemplate
            .opsForValue()
            .multiGet(numbers.stream().map(number -> redisKey("application:" + number)).toList());
    if (values == null || values.isEmpty()) {
      return Set.of();
    }
    Set<Long> locked = new LinkedHashSet<>();
    for (int index = 0; index < Math.min(numbers.size(), values.size()); index++) {
      if (values.get(index) != null) {
        locked.add(numbers.get(index));
      }
    }
    return Set.copyOf(locked);
  }

  boolean touch(String aggregateKey, String normalizedUserId, Duration ttl) {
    Long touched =
        redisTemplate.execute(
            TOUCH_SCRIPT,
            List.of(redisKey(aggregateKey)),
            ownerPrefix(normalizedUserId),
            Long.toString(ttl.toMillis()));
    return Long.valueOf(1L).equals(touched);
  }

  boolean release(String aggregateKey, String normalizedUserId) {
    Long released =
        redisTemplate.execute(
            RELEASE_SCRIPT, List.of(redisKey(aggregateKey)), ownerPrefix(normalizedUserId));
    return Long.valueOf(1L).equals(released);
  }

  private LockRecord decodeWithExpiry(String key, String value) {
    if (value == null) {
      return null;
    }
    Long ttlMillis = redisTemplate.getExpire(key, TimeUnit.MILLISECONDS);
    if (ttlMillis == null || ttlMillis <= 0) {
      return null;
    }
    String[] parts = value.split(":", 2);
    if (parts.length != 2) {
      throw new IllegalStateException("LEXIS Redis edit lock data is invalid.");
    }
    return new LockRecord(
        decode(parts[0]), decode(parts[1]), clock.instant().plusMillis(ttlMillis));
  }

  private String redisKey(String aggregateKey) {
    return keyspace.key("edit", aggregateKey);
  }

  private String ownerPrefix(String normalizedUserId) {
    return encode(normalizedUserId) + ":";
  }

  private String encode(String value) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  private String decode(String value) {
    return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
  }

  record LockRecord(String userId, String displayName, Instant expiresAt) {}
}

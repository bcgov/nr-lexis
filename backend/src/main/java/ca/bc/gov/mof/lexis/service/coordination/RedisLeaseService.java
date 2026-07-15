package ca.bc.gov.mof.lexis.service.coordination;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

/** Acquires renewable, token-owned Redis leases for multi-pod mutation coordination. */
@Service
@Profile("oracle")
public final class RedisLeaseService {

  private static final Logger LOGGER = LoggerFactory.getLogger(RedisLeaseService.class);
  private static final DefaultRedisScript<Long> ACQUIRE_SCRIPT =
      new DefaultRedisScript<>(
          "for i,key in ipairs(KEYS) do "
              + "local current=redis.call('get',key); "
              + "if current and current~=ARGV[1] then return 0 end; "
              + "end; "
              + "for i,key in ipairs(KEYS) do redis.call('psetex',key,ARGV[2],ARGV[1]); end; "
              + "return 1",
          Long.class);
  private static final DefaultRedisScript<Long> RENEW_SCRIPT =
      new DefaultRedisScript<>(
          "for i,key in ipairs(KEYS) do "
              + "if redis.call('get',key)~=ARGV[1] then return 0 end; "
              + "end; "
              + "for i,key in ipairs(KEYS) do redis.call('pexpire',key,ARGV[2]); end; "
              + "return 1",
          Long.class);
  private static final DefaultRedisScript<Long> RELEASE_SCRIPT =
      new DefaultRedisScript<>(
          "local released=0; "
              + "for i,key in ipairs(KEYS) do "
              + "if redis.call('get',key)==ARGV[1] then "
              + "released=released+redis.call('del',key); "
              + "end; end; return released",
          Long.class);
  private static final DefaultRedisScript<Long> OWNERSHIP_SCRIPT =
      new DefaultRedisScript<>(
          "for i,key in ipairs(KEYS) do "
              + "if redis.call('get',key)~=ARGV[1] then return 0 end; "
              + "end; return 1",
          Long.class);

  private final StringRedisTemplate redisTemplate;
  private final RedisCoordinationKeyspace keyspace;
  private final Duration defaultWait;
  private final Duration defaultLease;
  private final Duration retryDelay;
  private final ScheduledExecutorService renewals =
      Executors.newScheduledThreadPool(
          2,
          Thread.ofPlatform().name("lexis-redis-lease-renewal-", 0).daemon(true).factory());

  public RedisLeaseService(
      StringRedisTemplate redisTemplate,
      RedisCoordinationKeyspace keyspace,
      @Value("${lexis.coordination.mutation-lock.wait:30s}") Duration defaultWait,
      @Value("${lexis.coordination.mutation-lock.lease:10m}") Duration defaultLease,
      @Value("${lexis.coordination.mutation-lock.retry-delay:50ms}") Duration retryDelay) {
    this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate");
    this.keyspace = Objects.requireNonNull(keyspace, "keyspace");
    this.defaultWait = requirePositiveOrZero(defaultWait, "lock wait");
    this.defaultLease = requirePositive(defaultLease, "lock lease");
    this.retryDelay = requirePositive(retryDelay, "lock retry delay");
  }

  public <T> T execute(Collection<String> resources, Supplier<T> operation) {
    Objects.requireNonNull(operation, "operation");
    try (Lease lease = acquire(resources, defaultWait, defaultLease)) {
      T result = operation.get();
      lease.requireValid();
      return result;
    }
  }

  public Lease acquire(Collection<String> resources) {
    return acquire(resources, defaultWait, defaultLease);
  }

  Lease acquire(Collection<String> resources, Duration wait, Duration leaseDuration) {
    List<String> keys = redisKeys(resources);
    Duration boundedWait = requirePositiveOrZero(wait, "lock wait");
    Duration boundedLease = requirePositive(leaseDuration, "lock lease");
    String token = UUID.randomUUID().toString();
    long deadline = System.nanoTime() + boundedWait.toNanos();

    while (true) {
      Long acquired =
          redisTemplate.execute(
              ACQUIRE_SCRIPT, keys, token, Long.toString(boundedLease.toMillis()));
      if (Long.valueOf(1L).equals(acquired)) {
        return new Lease(keys, token, boundedLease);
      }
      if (boundedWait.isZero() || System.nanoTime() >= deadline) {
        throw new DistributedLockBusyException(
            "Another LEXIS operation is updating the same record. Try again shortly.");
      }
      if (Thread.currentThread().isInterrupted()) {
        Thread.currentThread().interrupt();
        throw new DistributedLockBusyException(
            "LEXIS stopped waiting for another record update to finish.");
      }
      LockSupport.parkNanos(
          Math.min(retryDelay.toNanos(), Math.max(1L, deadline - System.nanoTime())));
    }
  }

  private List<String> redisKeys(Collection<String> resources) {
    if (resources == null || resources.isEmpty()) {
      throw new IllegalArgumentException("At least one distributed lock resource is required.");
    }
    List<String> keys =
        resources.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .distinct()
            .sorted()
            .map(resource -> keyspace.key("mutation", resource))
            .toList();
    if (keys.isEmpty()) {
      throw new IllegalArgumentException("At least one distributed lock resource is required.");
    }
    return new ArrayList<>(keys);
  }

  private Duration requirePositive(Duration duration, String label) {
    if (duration == null || duration.isZero() || duration.isNegative()) {
      throw new IllegalArgumentException("Redis " + label + " must be positive.");
    }
    return duration;
  }

  private Duration requirePositiveOrZero(Duration duration, String label) {
    if (duration == null || duration.isNegative()) {
      throw new IllegalArgumentException("Redis " + label + " cannot be negative.");
    }
    return duration;
  }

  @PreDestroy
  void shutdownRenewals() {
    renewals.shutdownNow();
  }

  public final class Lease implements AutoCloseable {

    private final List<String> keys;
    private final String token;
    private final Duration leaseDuration;
    private final AtomicBoolean closed = new AtomicBoolean();
    private final AtomicBoolean lost = new AtomicBoolean();
    private final AtomicLong validUntilNanos;
    private final ScheduledFuture<?> renewal;

    private Lease(List<String> keys, String token, Duration leaseDuration) {
      this.keys = List.copyOf(keys);
      this.token = token;
      this.leaseDuration = leaseDuration;
      this.validUntilNanos = new AtomicLong(System.nanoTime() + leaseDuration.toNanos());
      long renewalDelayMillis = Math.max(100L, leaseDuration.toMillis() / 3L);
      this.renewal =
          renewals.scheduleWithFixedDelay(
              this::renew,
              renewalDelayMillis,
              renewalDelayMillis,
              TimeUnit.MILLISECONDS);
    }

    private void renew() {
      if (closed.get()) {
        return;
      }
      try {
        Long renewed =
            redisTemplate.execute(
                RENEW_SCRIPT, keys, token, Long.toString(leaseDuration.toMillis()));
        if (Long.valueOf(1L).equals(renewed)) {
          validUntilNanos.set(System.nanoTime() + leaseDuration.toNanos());
          return;
        }
        lost.set(true);
      } catch (RuntimeException exception) {
        if (System.nanoTime() >= validUntilNanos.get()) {
          lost.set(true);
        }
        LOGGER.warn("Unable to renew a LEXIS Redis mutation lease", exception);
      }
    }

    public void requireValid() {
      if (lost.get() || System.nanoTime() >= validUntilNanos.get()) {
        throw new DistributedLockBusyException(
            "The shared LEXIS record lock expired. Refresh before trying again.");
      }
      Long owned = redisTemplate.execute(OWNERSHIP_SCRIPT, keys, token);
      if (!Long.valueOf(1L).equals(owned)) {
        lost.set(true);
        throw new DistributedLockBusyException(
            "The shared LEXIS record lock expired. Refresh before trying again.");
      }
    }

    @Override
    public void close() {
      if (!closed.compareAndSet(false, true)) {
        return;
      }
      renewal.cancel(false);
      try {
        redisTemplate.execute(RELEASE_SCRIPT, keys, token);
      } catch (RuntimeException exception) {
        LOGGER.warn("Unable to release a LEXIS Redis mutation lease", exception);
      }
    }
  }
}

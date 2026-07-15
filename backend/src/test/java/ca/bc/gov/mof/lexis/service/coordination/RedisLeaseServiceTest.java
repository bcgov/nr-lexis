package ca.bc.gov.mof.lexis.service.coordination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.util.ReflectionTestUtils;

class RedisLeaseServiceTest {

  private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
  private final AtomicReference<ScriptResult> scriptResult =
      new AtomicReference<>(script -> 1L);
  private RedisLeaseService service;

  @BeforeEach
  void setUp() {
    doAnswer(
            invocation -> {
              RedisScript<?> script = invocation.getArgument(0);
              return scriptResult.get().result(script.getScriptAsString());
            })
        .when(redisTemplate)
        .execute(any(RedisScript.class), anyList(), any(Object[].class));
    service =
        new RedisLeaseService(
            redisTemplate,
            new RedisCoordinationKeyspace("test"),
            Duration.ZERO,
            Duration.ofMinutes(1),
            Duration.ofMillis(1));
  }

  @AfterEach
  void tearDown() {
    service.shutdownRenewals();
  }

  @Test
  void shouldAcquireSortedDistinctKeysAndReleaseWithTheOwningToken() {
    RedisLeaseService.Lease lease =
        service.acquire(
            List.of("permit:20", "application:10", "permit:20"),
            Duration.ZERO,
            Duration.ofMinutes(1));

    lease.requireValid();
    lease.close();

    ArgumentCaptor<RedisScript<Long>> scriptCaptor = ArgumentCaptor.forClass(RedisScript.class);
    ArgumentCaptor<List<String>> keysCaptor = ArgumentCaptor.forClass(List.class);
    ArgumentCaptor<Object[]> argumentsCaptor = ArgumentCaptor.forClass(Object[].class);
    verify(redisTemplate, org.mockito.Mockito.times(3))
        .execute(scriptCaptor.capture(), keysCaptor.capture(), argumentsCaptor.capture());

    assertThat(keysCaptor.getAllValues().get(0))
        .containsExactly(
            "lexis:test:mutation:application:10", "lexis:test:mutation:permit:20");
    assertThat(keysCaptor.getAllValues().get(1)).isEqualTo(keysCaptor.getAllValues().get(0));
    assertThat(keysCaptor.getAllValues().get(2)).isEqualTo(keysCaptor.getAllValues().get(0));
    assertThat(argumentsCaptor.getAllValues().get(0)[0])
        .isEqualTo(argumentsCaptor.getAllValues().get(1)[0])
        .isEqualTo(argumentsCaptor.getAllValues().get(2)[0]);
    assertThat(scriptCaptor.getAllValues().get(0).getScriptAsString()).contains("psetex");
    assertThat(scriptCaptor.getAllValues().get(1).getScriptAsString()).contains("return 1");
    assertThat(scriptCaptor.getAllValues().get(2).getScriptAsString()).contains("del");
  }

  @Test
  void shouldFailClosedWhenRedisDoesNotAcquireTheLease() {
    scriptResult.set(script -> 0L);

    assertThatThrownBy(
            () ->
                service.acquire(
                    List.of("application:10"), Duration.ZERO, Duration.ofMinutes(1)))
        .isInstanceOf(DistributedLockBusyException.class)
        .hasMessageContaining("same record");
  }

  @Test
  void shouldMarkLeaseLostWhenTokenOwnedRenewalFails() {
    scriptResult.set(
        script -> script.contains("psetex") ? 1L : script.contains("pexpire") ? 0L : 1L);
    RedisLeaseService.Lease lease =
        service.acquire(
            List.of("application:10"), Duration.ZERO, Duration.ofMinutes(1));

    ReflectionTestUtils.invokeMethod(lease, "renew");

    assertThatThrownBy(lease::requireValid)
        .isInstanceOf(DistributedLockBusyException.class)
        .hasMessageContaining("lock expired");
    lease.close();
  }

  @Test
  void shouldFailClosedWhenRedisNoLongerReportsTokenOwnership() {
    scriptResult.set(
        script -> script.contains("psetex") || script.contains("del") ? 1L : 0L);
    RedisLeaseService.Lease lease =
        service.acquire(
            List.of("application:10"), Duration.ZERO, Duration.ofMinutes(1));

    assertThatThrownBy(lease::requireValid)
        .isInstanceOf(DistributedLockBusyException.class)
        .hasMessageContaining("lock expired");
    lease.close();
  }

  @FunctionalInterface
  private interface ScriptResult {
    Long result(String script);
  }
}

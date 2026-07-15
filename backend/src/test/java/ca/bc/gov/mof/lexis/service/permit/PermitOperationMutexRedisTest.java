package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.coordination.DistributedLockBusyException;
import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import ca.bc.gov.mof.lexis.service.coordination.RedisLeaseService;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.util.ReflectionTestUtils;

class PermitOperationMutexRedisTest {

  private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
  private final AtomicReference<ScriptResult> scriptResult =
      new AtomicReference<>(script -> 1L);
  private final List<ScriptInvocation> scriptInvocations = new ArrayList<>();
  private RedisLeaseService redisLeases;
  private PermitOperationMutex mutex;

  @BeforeEach
  void setUp() {
    doAnswer(
            invocation -> {
              RedisScript<?> script = invocation.getArgument(0);
              List<String> keys = invocation.getArgument(1);
              Object[] arguments =
                  Arrays.copyOfRange(
                      invocation.getArguments(), 2, invocation.getArguments().length);
              scriptInvocations.add(
                  new ScriptInvocation(script.getScriptAsString(), keys, arguments));
              return scriptResult.get().result(script.getScriptAsString());
            })
        .when(redisTemplate)
        .execute(any(RedisScript.class), anyList(), any(Object[].class));
    redisLeases =
        new RedisLeaseService(
            redisTemplate,
            new RedisCoordinationKeyspace("test"),
            Duration.ZERO,
            Duration.ofMinutes(1),
            Duration.ofMillis(1));
    ObjectProvider<RedisLeaseService> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(redisLeases);
    mutex = new PermitOperationMutex(provider);
  }

  @AfterEach
  void tearDown() {
    ReflectionTestUtils.invokeMethod(redisLeases, "shutdownRenewals");
  }

  @Test
  void shouldAcquireOneOrderedLeaseForTheWholeAggregate() {
    String result =
        mutex.executeAggregate(
            List.of(" z-2 ", "A-1", "a-1"),
            List.of(20L, 10L, 20L),
            List.of(200L, 100L, 200L),
            () -> "done");

    assertThat(acquisitions()).singleElement()
        .satisfies(
            invocation ->
                assertThat(invocation.keys())
                    .containsExactly(
                        "lexis:test:mutation:application:10",
                        "lexis:test:mutation:application:20",
                        "lexis:test:mutation:exemption:A-1",
                        "lexis:test:mutation:exemption:Z-2",
                        "lexis:test:mutation:permit:100",
                        "lexis:test:mutation:permit:200"));
    assertThat(releases()).hasSize(1);
    assertThat(result).isEqualTo("done");
  }

  @Test
  void shouldNotReacquireAReentrantAggregateKey() {
    String result =
        mutex.executeApplications(
            List.of(10L),
            () -> mutex.executeApplications(List.of(10L), () -> "nested"));

    assertThat(result).isEqualTo("nested");
    assertThat(acquisitions()).hasSize(1);
    assertThat(releases()).hasSize(1);
  }

  @Test
  void shouldAcquireOnlyNewKeysForAnOrderedNestedOperation() {
    String result =
        mutex.executeAggregate(
            List.of("EX-1"),
            List.of(10L),
            List.of(),
            () -> mutex.executeAggregate(List.of(10L), List.of(100L), () -> "nested"));

    assertThat(result).isEqualTo("nested");
    assertThat(acquisitions()).hasSize(2);
    assertThat(acquisitions().get(0).keys())
        .containsExactly(
            "lexis:test:mutation:application:10",
            "lexis:test:mutation:exemption:EX-1");
    assertThat(acquisitions().get(1).keys())
        .containsExactly("lexis:test:mutation:permit:100");
    assertThat(releases()).hasSize(2);
  }

  @Test
  void shouldRejectNestedLockAcquisitionThatViolatesGlobalOrder() {
    assertThatThrownBy(
            () ->
                mutex.execute(
                    100L,
                    () -> mutex.executeApplications(List.of(10L), () -> "not-reached")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("exemption-then-application-then-permit");

    assertThat(acquisitions()).hasSize(1);
    assertThat(releases()).hasSize(1);
  }

  @Test
  void shouldPropagateRedisContentionWithoutRunningTheMutation() {
    AtomicBoolean invoked = new AtomicBoolean();
    scriptResult.set(script -> script.contains("psetex") ? 0L : 1L);

    assertThatThrownBy(
            () ->
                mutex.execute(
                    100L,
                    () -> {
                      invoked.set(true);
                      return "not-reached";
                    }))
        .isInstanceOf(DistributedLockBusyException.class)
        .hasMessageContaining("same record");

    assertThat(invoked).isFalse();
    assertThat(acquisitions()).hasSize(1);
    assertThat(releases()).isEmpty();
  }

  private List<ScriptInvocation> acquisitions() {
    return scriptInvocations.stream()
        .filter(invocation -> invocation.script().contains("psetex"))
        .toList();
  }

  private List<ScriptInvocation> releases() {
    return scriptInvocations.stream()
        .filter(invocation -> invocation.script().contains("del"))
        .toList();
  }

  private record ScriptInvocation(String script, List<String> keys, Object[] arguments) {}

  @FunctionalInterface
  private interface ScriptResult {
    Long result(String script);
  }
}

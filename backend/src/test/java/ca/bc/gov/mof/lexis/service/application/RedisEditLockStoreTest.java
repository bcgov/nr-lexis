package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

class RedisEditLockStoreTest {

  private static final Instant NOW = Instant.parse("2026-07-15T16:00:00Z");

  private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
  private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
  private final AtomicReference<ScriptResult> scriptResult =
      new AtomicReference<>((script, arguments) -> null);
  private final List<ScriptInvocation> scriptInvocations = new ArrayList<>();
  private RedisEditLockStore store;

  @BeforeEach
  void setUp() {
    when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    doAnswer(
            invocation -> {
              RedisScript<?> script = invocation.getArgument(0);
              List<String> keys = invocation.getArgument(1);
              Object[] arguments =
                  Arrays.copyOfRange(
                      invocation.getArguments(), 2, invocation.getArguments().length);
              scriptInvocations.add(
                  new ScriptInvocation(script.getScriptAsString(), keys, arguments));
              return scriptResult.get().result(script.getScriptAsString(), arguments);
            })
        .when(redisTemplate)
        .execute(any(RedisScript.class), anyList(), any(Object[].class));
    store =
        new RedisEditLockStore(
            redisTemplate,
            new RedisCoordinationKeyspace("test"),
            Clock.fixed(NOW, ZoneOffset.UTC));
  }

  @Test
  void shouldAcquireAndDecodeTheCurrentOwnerWithRedisExpiry() {
    String encoded = encodedValue("idir/test-editor", "Test Editor");
    scriptResult.set((script, arguments) -> encoded);
    when(redisTemplate.getExpire(
            "lexis:test:edit:application:100", TimeUnit.MILLISECONDS))
        .thenReturn(45_000L);

    RedisEditLockStore.LockRecord lock =
        store.acquire(
            "application:100", "idir/test-editor", "Test Editor", Duration.ofMinutes(5));

    assertThat(lock.userId()).isEqualTo("idir/test-editor");
    assertThat(lock.displayName()).isEqualTo("Test Editor");
    assertThat(lock.expiresAt()).isEqualTo(NOW.plusSeconds(45));
    assertThat(scriptInvocations).hasSize(1);
    assertThat(scriptInvocations.get(0).keys())
        .containsExactly("lexis:test:edit:application:100");
    assertThat(scriptInvocations.get(0).arguments()[0]).isEqualTo(encoded);
    assertThat(scriptInvocations.get(0).arguments()[1])
        .isEqualTo(encode("idir/test-editor") + ":");
    assertThat(scriptInvocations.get(0).arguments()[2]).isEqualTo("300000");
  }

  @Test
  void shouldReturnTheExistingOwnerWhenAnotherUserAlreadyHoldsTheLock() {
    String existingOwner = encodedValue("bceid/sam", "Sam Submitter");
    scriptResult.set((script, arguments) -> existingOwner);
    when(redisTemplate.getExpire(
            "lexis:test:edit:application:100", TimeUnit.MILLISECONDS))
        .thenReturn(60_000L);

    RedisEditLockStore.LockRecord lock =
        store.acquire(
            "application:100", "idir/test-editor", "Test Editor", Duration.ofMinutes(5));

    assertThat(lock.userId()).isEqualTo("bceid/sam");
    assertThat(lock.displayName()).isEqualTo("Sam Submitter");
  }

  @Test
  void shouldOnlyReportApplicationsWithStoredLocksFromBatchLookup() {
    when(valueOperations.multiGet(
            List.of(
                "lexis:test:edit:application:10",
                "lexis:test:edit:application:20",
                "lexis:test:edit:application:30")))
        .thenReturn(
            Arrays.asList(
                encodedValue("user-1", "One"), null, encodedValue("user-3", "Three")));

    Set<Long> locked =
        store.lockedApplicationNumbers(Arrays.asList(10L, null, -1L, 20L, 10L, 30L));

    assertThat(locked).containsExactlyInAnyOrder(10L, 30L);
  }

  @Test
  void shouldUseTheEncodedOwnerTokenForTouchAndRelease() {
    scriptResult.set(
        (script, arguments) -> script.contains("pexpire") ? 1L : 0L);

    assertThat(store.touch("application:10", "idir/test-editor", Duration.ofMinutes(5)))
        .isTrue();
    assertThat(store.release("application:10", "idir/test-editor")).isFalse();

    String ownerPrefix = encode("idir/test-editor") + ":";
    assertThat(scriptInvocations).hasSize(2);
    assertThat(scriptInvocations.get(0).arguments()[0]).isEqualTo(ownerPrefix);
    assertThat(scriptInvocations.get(0).arguments()[1]).isEqualTo("300000");
    assertThat(scriptInvocations.get(1).arguments()[0]).isEqualTo(ownerPrefix);
  }

  @Test
  void shouldIgnoreExpiredOrMissingLockData() {
    String key = "lexis:test:edit:application:10";
    when(valueOperations.get(key)).thenReturn(encodedValue("user", "User"));
    when(redisTemplate.getExpire(key, TimeUnit.MILLISECONDS)).thenReturn(0L);

    assertThat(store.activeLock("application:10")).isNull();
  }

  private String encodedValue(String userId, String displayName) {
    return encode(userId) + ":" + encode(displayName);
  }

  private String encode(String value) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  private record ScriptInvocation(String script, List<String> keys, Object[] arguments) {}

  @FunctionalInterface
  private interface ScriptResult {
    Object result(String script, Object[] arguments);
  }
}

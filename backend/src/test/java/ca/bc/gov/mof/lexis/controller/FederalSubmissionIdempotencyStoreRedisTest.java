package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

class FederalSubmissionIdempotencyStoreRedisTest {

  @Test
  void shouldDelegateConcurrentClaimsWithoutSerializingThemInsideTheJvm() throws Exception {
    StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    CountDownLatch enteredRedis = new CountDownLatch(2);
    CountDownLatch releaseRedis = new CountDownLatch(1);
    doAnswer(
            invocation -> {
              enteredRedis.countDown();
              if (!releaseRedis.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("Concurrent Redis claim was not released.");
              }
              return 1L;
            })
        .when(redisTemplate)
        .execute(any(RedisScript.class), anyList(), any(Object[].class));
    RedisFederalSubmissionIdempotencyStore redisStore =
        new RedisFederalSubmissionIdempotencyStore(
            redisTemplate,
            new RedisCoordinationKeyspace("test"),
            new ObjectMapper().findAndRegisterModules(),
            Duration.ofMinutes(5),
            Duration.ofHours(24));
    ObjectProvider<RedisFederalSubmissionIdempotencyStore> provider =
        mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(redisStore);
    FederalSubmissionIdempotencyStore store =
        new FederalSubmissionIdempotencyStore(provider);
    ExecutorService executor = Executors.newFixedThreadPool(2);

    try {
      Future<FederalSubmissionIdempotencyStore.Decision> first =
          executor.submit(() -> store.claim(" caller-one ", " key-one ", " payload-one "));
      Future<FederalSubmissionIdempotencyStore.Decision> second =
          executor.submit(() -> store.claim("caller-two", "key-two", "payload-two"));

      assertThat(enteredRedis.await(2, TimeUnit.SECONDS)).isTrue();
      releaseRedis.countDown();

      assertThat(first.get(2, TimeUnit.SECONDS).outcome())
          .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
      assertThat(second.get(2, TimeUnit.SECONDS).outcome())
          .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
      assertThat(store.size()).isZero();
    } finally {
      releaseRedis.countDown();
      executor.shutdownNow();
      redisStore.shutdownRenewals();
    }
  }
}

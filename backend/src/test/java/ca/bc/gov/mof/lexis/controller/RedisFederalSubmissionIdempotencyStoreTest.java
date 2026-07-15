package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

class RedisFederalSubmissionIdempotencyStoreTest {

  private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
  private final HashOperations<String, Object, Object> hashOperations =
      mock(HashOperations.class);
  private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
  private final AtomicReference<Long> outcome = new AtomicReference<>(1L);
  private final List<ScriptInvocation> scriptInvocations = new ArrayList<>();
  private RedisFederalSubmissionIdempotencyStore store;

  @BeforeEach
  void setUp() {
    when(redisTemplate.opsForHash()).thenReturn(hashOperations);
    doAnswer(
            invocation -> {
              RedisScript<?> script = invocation.getArgument(0);
              List<String> keys = invocation.getArgument(1);
              Object[] arguments =
                  Arrays.copyOfRange(
                      invocation.getArguments(), 2, invocation.getArguments().length);
              scriptInvocations.add(
                  new ScriptInvocation(script.getScriptAsString(), keys, arguments));
              return outcome.get();
            })
        .when(redisTemplate)
        .execute(any(RedisScript.class), anyList(), any(Object[].class));
    store =
        new RedisFederalSubmissionIdempotencyStore(
            redisTemplate,
            new RedisCoordinationKeyspace("test"),
            objectMapper,
            Duration.ofMinutes(5),
            Duration.ofHours(24));
  }

  @AfterEach
  void tearDown() {
    store.shutdownRenewals();
  }

  @Test
  void shouldAtomicallyClaimAHashedCallerScopedKey() {
    FederalSubmissionIdempotencyStore.Decision decision =
        store.claim("nexcol-client", "request-123", "payload-sha");

    assertThat(decision.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.CLAIMED);
    assertThat(decision.claim().caller()).isEqualTo("nexcol-client");
    assertThat(decision.claim().idempotencyKey()).isEqualTo("request-123");
    assertThat(decision.claim().claimId()).isPositive();
    assertThat(scriptInvocations).hasSize(1);
    assertThat(scriptInvocations.get(0).keys().get(0))
        .matches("lexis:test:federal-idempotency:[a-f0-9]{64}")
        .doesNotContain("request-123")
        .doesNotContain("nexcol-client");
    assertThat(scriptInvocations.get(0).arguments()[0]).isEqualTo("payload-sha");
    assertThat(scriptInvocations.get(0).arguments()[1])
        .isEqualTo(Long.toString(decision.claim().claimId()));
    assertThat(scriptInvocations.get(0).arguments()[2]).isEqualTo("300000");
  }

  @Test
  void shouldRenewAnOwnedInFlightClaim() {
    FederalSubmissionIdempotencyStore.Decision decision =
        store.claim("nexcol-client", "request-123", "request-fingerprint");
    String redisKey = scriptInvocations.get(0).keys().get(0);
    String handle =
        decision.claim().caller()
            + "\u0000"
            + decision.claim().idempotencyKey()
            + "\u0000"
            + decision.claim().claimId();

    ReflectionTestUtils.invokeMethod(store, "renewClaim", redisKey, decision.claim(), handle);

    assertThat(scriptInvocations).hasSize(2);
    assertThat(scriptInvocations.get(1).script()).contains("state')=='IN_FLIGHT'");
    assertThat(scriptInvocations.get(1).arguments())
        .containsExactly(Long.toString(decision.claim().claimId()), "300000");
  }

  @Test
  void shouldMapPayloadMismatchAndInFlightOutcomes() {
    outcome.set(4L);
    FederalSubmissionIdempotencyStore.Decision mismatch =
        store.claim("caller", "key", "different-payload");
    outcome.set(3L);
    FederalSubmissionIdempotencyStore.Decision inFlight =
        store.claim("caller", "key", "payload");

    assertThat(mismatch.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.PAYLOAD_MISMATCH);
    assertThat(inFlight.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.IN_FLIGHT);
  }

  @Test
  void shouldReplayTheOriginalStatusHeadersAndBody() throws Exception {
    outcome.set(2L);
    String encodedResponse =
        objectMapper.writeValueAsString(
            Map.of(
                "status",
                422,
                "headers",
                Map.of("X-Request-Id", List.of("original-request")),
                "body",
                result()));
    when(hashOperations.get(any(String.class), org.mockito.ArgumentMatchers.eq("response")))
        .thenReturn(encodedResponse);

    FederalSubmissionIdempotencyStore.Decision decision =
        store.claim("caller", "key", "payload");

    assertThat(decision.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.REPLAY);
    assertThat(decision.replayResponse().getStatusCode())
        .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(decision.replayResponse().getHeaders().getFirst("X-Request-Id"))
        .isEqualTo("original-request");
    assertThat(decision.replayResponse().getBody()).isEqualTo(result());
  }

  @Test
  void shouldFailClosedAsInFlightWhenCompletedResponseIsMissing() {
    outcome.set(2L);
    when(hashOperations.get(any(String.class), org.mockito.ArgumentMatchers.eq("response")))
        .thenReturn(null);

    FederalSubmissionIdempotencyStore.Decision decision =
        store.claim("caller", "key", "payload");

    assertThat(decision.outcome())
        .isEqualTo(FederalSubmissionIdempotencyStore.Outcome.IN_FLIGHT);
  }

  @Test
  void shouldRejectUnknownLuaClaimOutcome() {
    outcome.set(null);

    assertThatThrownBy(() -> store.claim("caller", "key", "payload"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("returned no decision");
  }

  @Test
  void shouldCompleteAClaimWithTheOwningTokenAndReplayPayload() throws Exception {
    FederalSubmissionIdempotencyStore.Claim claim =
        new FederalSubmissionIdempotencyStore.Claim("caller", "key", 99L);
    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        ResponseEntity.status(HttpStatus.CREATED)
            .header("Location", "/api/lexis/federal/applications/9001")
            .body(result());

    store.complete(claim, response);

    assertThat(scriptInvocations).hasSize(1);
    ScriptInvocation invocation = scriptInvocations.get(0);
    assertThat(invocation.script()).contains("state','COMPLETED");
    assertThat(invocation.arguments()[0]).isEqualTo("99");
    assertThat(invocation.arguments()[2]).isEqualTo("86400000");
    Map<?, ?> encoded = objectMapper.readValue((String) invocation.arguments()[1], Map.class);
    assertThat(encoded.get("status")).isEqualTo(201);
    assertThat(((Map<?, ?>) encoded.get("headers")).get("Location"))
        .isEqualTo(List.of("/api/lexis/federal/applications/9001"));
    assertThat(((Map<?, ?>) encoded.get("body")).get("applicationNumber"))
        .isEqualTo(9001);
  }

  @Test
  void shouldStopRenewingWhenCompletionNoLongerOwnsTheClaim() {
    FederalSubmissionIdempotencyStore.Decision decision =
        store.claim("caller", "key", "payload");
    outcome.set(0L);

    store.complete(
        decision.claim(), ResponseEntity.status(HttpStatus.CREATED).body(result()));

    assertThat(scriptInvocations).hasSize(2);
    assertThat(scriptInvocations.get(1).script()).contains("state','COMPLETED");
    assertThat((Map<?, ?>) ReflectionTestUtils.getField(store, "renewals")).isEmpty();
  }

  @Test
  void shouldReleaseServerErrorsAndExplicitClaimsWithTheOwningToken() {
    FederalSubmissionIdempotencyStore.Claim serverErrorClaim =
        new FederalSubmissionIdempotencyStore.Claim("caller", "server-error", 101L);
    FederalSubmissionIdempotencyStore.Claim explicitClaim =
        new FederalSubmissionIdempotencyStore.Claim("caller", "explicit", 102L);

    store.complete(
        serverErrorClaim,
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(result()));
    store.release(explicitClaim);

    assertThat(scriptInvocations).hasSize(2);
    assertThat(scriptInvocations)
        .allSatisfy(invocation -> assertThat(invocation.script()).contains("del"));
    assertThat(scriptInvocations.get(0).arguments()).containsExactly("101");
    assertThat(scriptInvocations.get(1).arguments()).containsExactly("102");
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

  private record ScriptInvocation(String script, List<String> keys, Object[] arguments) {}
}

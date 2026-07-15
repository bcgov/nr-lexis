package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.coordination.RedisCoordinationKeyspace;
import java.time.Duration;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

class RedisExpiryRunLedgerTest {

  @Test
  void shouldReadAndRetainEnvironmentScopedCompletionDates() {
    StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    ValueOperations<String, String> values = mock(ValueOperations.class);
    when(redisTemplate.opsForValue()).thenReturn(values);
    String key = "lexis:test:expiry-completed:2026-07-15";
    when(redisTemplate.hasKey(key)).thenReturn(true);
    RedisExpiryRunLedger ledger =
        new RedisExpiryRunLedger(
            redisTemplate,
            new RedisCoordinationKeyspace("test"),
            Duration.ofDays(3));
    LocalDate runDate = LocalDate.of(2026, 7, 15);

    assertThat(ledger.completed(runDate)).isTrue();
    ledger.markCompleted(runDate);

    verify(values).set(key, "completed", Duration.ofDays(3));
  }
}

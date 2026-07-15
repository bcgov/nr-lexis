package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import net.javacrumbs.shedlock.provider.redis.spring.RedisLockProvider;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisConnectionFactory;

class RedisCoordinationConfigurationTest {

  private final RedisCoordinationConfiguration configuration =
      new RedisCoordinationConfiguration();
  private final RedisConnectionFactory connectionFactory =
      mock(RedisConnectionFactory.class);

  @Test
  void shouldCreateRedisShedLockProviderForTheEnvironmentNamespace() {
    assertThat(configuration.redisLockProvider(connectionFactory, "lexis-test"))
        .isInstanceOf(RedisLockProvider.class);
  }

  @Test
  void shouldRejectBlankEnvironmentNamespace() {
    assertThatThrownBy(() -> configuration.redisLockProvider(connectionFactory, " "))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("coordination.namespace");
  }
}

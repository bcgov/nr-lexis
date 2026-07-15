package ca.bc.gov.mof.lexis.configuration;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.redis.spring.RedisLockProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.util.Assert;

@Configuration(proxyBeanMethods = false)
public class RedisCoordinationConfiguration {

  @Bean
  LockProvider redisLockProvider(
      RedisConnectionFactory connectionFactory,
      @Value("${lexis.coordination.namespace:local}") String namespace) {
    Assert.hasText(namespace, "lexis.coordination.namespace must not be blank");
    return new RedisLockProvider(connectionFactory, namespace.trim());
  }
}

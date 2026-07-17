package ca.bc.gov.mof.lexis.configuration;

import javax.sql.DataSource;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

/** Provides the Oracle-backed lock used by the multi-replica expiry scheduler. */
@Configuration(proxyBeanMethods = false)
@Profile("oracle")
@ConditionalOnProperty(prefix = "lexis.expiry", name = "enabled", havingValue = "true")
public class OracleShedLockConfiguration {

  @Bean(name = "expiryLockProvider")
  LockProvider expiryLockProvider(
      DataSource dataSource, @Value("${HOSTNAME:lexis-backend}") String lockedBy) {
    return new JdbcTemplateLockProvider(
        JdbcTemplateLockProvider.Configuration.builder()
            .withJdbcTemplate(new JdbcTemplate(dataSource))
            .withTableName("THE.LEXIS_SHEDLOCK")
            .withLockedByValue(lockedBy)
            .usingDbTime()
            .build());
  }
}

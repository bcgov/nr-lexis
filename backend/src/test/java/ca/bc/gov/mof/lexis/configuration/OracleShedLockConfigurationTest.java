package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import javax.sql.DataSource;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import org.junit.jupiter.api.Test;

class OracleShedLockConfigurationTest {

  @Test
  void shouldCreateJdbcLockProviderWithoutOpeningAStartupConnection() {
    DataSource dataSource = mock(DataSource.class);

    LockProvider provider =
        new OracleShedLockConfiguration().expiryLockProvider(dataSource, "lexis-backend-1");

    assertThat(provider).isInstanceOf(JdbcTemplateLockProvider.class);
    verifyNoInteractions(dataSource);
  }
}

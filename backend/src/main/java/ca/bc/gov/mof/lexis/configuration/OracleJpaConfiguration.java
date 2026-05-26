package ca.bc.gov.mof.lexis.configuration;

import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
@Profile("oracle")
public class OracleJpaConfiguration {

  @Bean
  public InitializingBean warmOraclePool(DataSource dataSource) {
    return () -> {
      try (var ignored = dataSource.getConnection()) {
        // Force pool initialization on startup for fail-fast behavior.
      } catch (SQLException ex) {
        throw new IllegalStateException("Failed to validate Oracle DataSource at startup", ex);
      }
    };
  }

  @Bean(name = "oracleJdbcTemplate")
  public JdbcTemplate oracleJdbcTemplate(DataSource dataSource) {
    return new JdbcTemplate(dataSource);
  }
}

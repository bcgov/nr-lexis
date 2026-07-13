package ca.bc.gov.mof.lexis.configuration;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Prevents a deployed backend from silently starting without its Oracle business services. */
@Configuration(proxyBeanMethods = false)
@Profile("!oracle")
@ConditionalOnProperty(name = "lexis.runtime.require-oracle-profile", havingValue = "true")
public class OracleProfileRequirementConfiguration {

  @Bean
  SmartInitializingSingleton missingOracleProfileGuard() {
    return () -> {
      throw new IllegalStateException(
          "The oracle Spring profile is required for this deployed LEXIS runtime.");
    };
  }
}

package ca.bc.gov.mof.lexis.configuration;

import ca.bc.gov.mof.lexis.service.scan.VirusScanProperties;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Prevents a deployed Oracle runtime from accepting uploads without malware scanning. */
@Configuration(proxyBeanMethods = false)
@Profile("oracle")
@ConditionalOnProperty(name = "lexis.runtime.require-oracle-profile", havingValue = "true")
public class VirusScanRequirementConfiguration {

  @Bean
  SmartInitializingSingleton requiredVirusScanGuard(VirusScanProperties properties) {
    return () -> {
      if (!properties.enabled()) {
        throw new IllegalStateException(
            "Virus scanning must be enabled for this deployed LEXIS runtime.");
      }
    };
  }
}

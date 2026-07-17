package ca.bc.gov.mof.lexis.configuration;

import java.util.Set;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

/** Validates the permit invoice mode before an Oracle runtime accepts traffic. */
@Configuration(proxyBeanMethods = false)
@Profile("oracle")
public class PermitInvoiceModeConfiguration {

  private static final String MODE_PROPERTY = "lexis.permit-invoice.mode";
  private static final Set<String> ALLOWED_MODES =
      Set.of("legacy-best-effort", "canadian-internal", "disabled");

  @Bean
  SmartInitializingSingleton permitInvoiceModeGuard(Environment environment) {
    return () -> {
      if (!environment.containsProperty(MODE_PROPERTY)) {
        return;
      }
      String configuredMode = environment.getProperty(MODE_PROPERTY);
      boolean supported =
          configuredMode != null
              && ALLOWED_MODES.stream().anyMatch(mode -> mode.equalsIgnoreCase(configuredMode));
      if (!supported) {
        throw new IllegalStateException(
            "Permit invoice mode must be legacy-best-effort, canadian-internal, or disabled.");
      }
    };
  }
}

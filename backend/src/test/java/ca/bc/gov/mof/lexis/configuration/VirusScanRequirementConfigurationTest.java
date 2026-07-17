package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.service.scan.VirusScanProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class VirusScanRequirementConfigurationTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withUserConfiguration(VirusScanRequirementConfiguration.class)
          .withPropertyValues("spring.profiles.active=oracle");

  @Test
  void localOracleRuntimeShouldAllowDisabledVirusScanning() {
    contextRunner
        .withBean(VirusScanProperties.class, () -> properties(false))
        .run(context -> assertThat(context).hasNotFailed());
  }

  @Test
  void deployedOracleRuntimeShouldFailStartupWhenVirusScanningIsDisabled() {
    contextRunner
        .withPropertyValues("lexis.runtime.require-oracle-profile=true")
        .withBean(VirusScanProperties.class, () -> properties(false))
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(context.getStartupFailure())
                  .isInstanceOf(IllegalStateException.class)
                  .hasMessageContaining("Virus scanning must be enabled");
            });
  }

  @Test
  void deployedOracleRuntimeShouldStartWhenVirusScanningIsEnabled() {
    contextRunner
        .withPropertyValues("lexis.runtime.require-oracle-profile=true")
        .withBean(VirusScanProperties.class, () -> properties(true))
        .run(context -> assertThat(context).hasNotFailed());
  }

  private VirusScanProperties properties(boolean enabled) {
    return new VirusScanProperties(enabled, "clamav", 3310, Duration.ofSeconds(10), 8192);
  }
}

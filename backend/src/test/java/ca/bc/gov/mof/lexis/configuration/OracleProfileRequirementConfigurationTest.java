package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class OracleProfileRequirementConfigurationTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withUserConfiguration(OracleProfileRequirementConfiguration.class);

  @Test
  void localNonOracleRuntimeShouldRemainAvailableByDefault() {
    contextRunner.run(context -> assertThat(context).hasNotFailed());
  }

  @Test
  void deployedRuntimeShouldFailStartupWithoutOracleProfile() {
    contextRunner
        .withPropertyValues("lexis.runtime.require-oracle-profile=true")
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(context.getStartupFailure())
                  .isInstanceOf(IllegalStateException.class)
                  .hasMessageContaining("oracle Spring profile is required");
            });
  }

  @Test
  void deployedRuntimeShouldStartWithOracleProfile() {
    contextRunner
        .withPropertyValues(
            "lexis.runtime.require-oracle-profile=true", "spring.profiles.active=oracle")
        .run(context -> assertThat(context).hasNotFailed());
  }
}

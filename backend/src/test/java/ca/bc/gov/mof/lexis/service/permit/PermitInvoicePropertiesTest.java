package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class PermitInvoicePropertiesTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner().withUserConfiguration(TestConfiguration.class);

  @Test
  void shouldBindTheSafeDefaultAndOverride() {
    contextRunner.run(
        context ->
            assertThat(context.getBean(PermitInvoiceProperties.class).getGbmsTimeoutSeconds())
                .isEqualTo(60));
    contextRunner
        .withPropertyValues("lexis.permit-invoice.gbms-timeout-seconds=90")
        .run(
            context ->
                assertThat(context.getBean(PermitInvoiceProperties.class).getGbmsTimeoutSeconds())
                    .isEqualTo(90));
  }

  @ParameterizedTest
  @ValueSource(ints = {0, 3601})
  void shouldRejectAnOutOfRangeGbmsTimeout(int timeoutSeconds) {
    contextRunner
        .withPropertyValues(
            "lexis.permit-invoice.gbms-timeout-seconds=" + timeoutSeconds)
        .run(context -> assertThat(context).hasFailed());
  }

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties(PermitInvoiceProperties.class)
  static class TestConfiguration {}
}

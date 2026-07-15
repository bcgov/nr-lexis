package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class LexisReportResourcePropertiesTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner().withUserConfiguration(TestConfiguration.class);

  @Test
  void shouldBindSafeDefaults() {
    contextRunner.run(
        context -> {
          LexisReportResourceProperties properties =
              context.getBean(LexisReportResourceProperties.class);
          assertThat(properties.getMaxConcurrent()).isEqualTo(4);
          assertThat(properties.getMaxOutputBytes()).isEqualTo(25L * 1024L * 1024L);
          assertThat(properties.getVirtualizerDirectory()).isEqualTo("/tmp/lexis-jasper");
          assertThat(properties.getVirtualizerMaxPages()).isEqualTo(50);
          assertThat(properties.getQueryTimeoutSeconds()).isEqualTo(120);
        });
  }

  @Test
  void shouldBindDeploymentOverrides() {
    contextRunner
        .withPropertyValues(
            "lexis.reports.max-concurrent=3",
            "lexis.reports.max-output-bytes=4096",
            "lexis.reports.query-timeout-seconds=37",
            "lexis.reports.virtualizer-directory=/tmp/custom-jasper",
            "lexis.reports.virtualizer-max-pages=7")
        .run(
            context -> {
              LexisReportResourceProperties properties =
                  context.getBean(LexisReportResourceProperties.class);
              assertThat(properties.getMaxConcurrent()).isEqualTo(3);
              assertThat(properties.getMaxOutputBytes()).isEqualTo(4096);
              assertThat(properties.getQueryTimeoutSeconds()).isEqualTo(37);
              assertThat(properties.getVirtualizerDirectory()).isEqualTo("/tmp/custom-jasper");
              assertThat(properties.getVirtualizerMaxPages()).isEqualTo(7);
            });
  }

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties(LexisReportResourceProperties.class)
  static class TestConfiguration {}
}

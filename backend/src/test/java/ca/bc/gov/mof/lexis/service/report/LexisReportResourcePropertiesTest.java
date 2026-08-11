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
          assertThat(properties.getArtifactDirectory()).isEqualTo("/tmp/lexis-reports");
          assertThat(properties.getVirtualizerDirectory()).isEqualTo("/tmp/lexis-jasper");
          assertThat(properties.getVirtualizerMaxPages()).isEqualTo(50);
          assertThat(properties.getQueryTimeoutSeconds()).isEqualTo(120);
          assertThat(properties.getJdbcFetchSize()).isEqualTo(100);
        });
  }

  @Test
  void shouldBindDeploymentOverrides() {
    contextRunner
        .withPropertyValues(
            "lexis.reports.artifact-directory=/tmp/custom-reports",
            "lexis.reports.query-timeout-seconds=37",
            "lexis.reports.jdbc-fetch-size=250",
            "lexis.reports.virtualizer-directory=/tmp/custom-jasper",
            "lexis.reports.virtualizer-max-pages=7")
        .run(
            context -> {
              LexisReportResourceProperties properties =
                  context.getBean(LexisReportResourceProperties.class);
              assertThat(properties.getArtifactDirectory()).isEqualTo("/tmp/custom-reports");
              assertThat(properties.getQueryTimeoutSeconds()).isEqualTo(37);
              assertThat(properties.getJdbcFetchSize()).isEqualTo(250);
              assertThat(properties.getVirtualizerDirectory()).isEqualTo("/tmp/custom-jasper");
              assertThat(properties.getVirtualizerMaxPages()).isEqualTo(7);
            });
  }

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties(LexisReportResourceProperties.class)
  static class TestConfiguration {}
}

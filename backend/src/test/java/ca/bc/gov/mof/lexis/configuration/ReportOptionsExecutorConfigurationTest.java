package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.ThreadPoolExecutor;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class ReportOptionsExecutorConfigurationTest {

  @Test
  void shouldBoundConcurrentReportOptionLookups() {
    ThreadPoolTaskExecutor executor =
        new ReportOptionsExecutorConfiguration().reportOptionsExecutor();
    executor.initialize();

    try {
      assertThat(executor.getCorePoolSize())
          .isEqualTo(ReportOptionsExecutorConfiguration.MAX_PARALLEL_LOOKUPS);
      assertThat(executor.getMaxPoolSize())
          .isEqualTo(ReportOptionsExecutorConfiguration.MAX_PARALLEL_LOOKUPS);
      assertThat(executor.getQueueCapacity()).isEqualTo(16);
      assertThat(executor.getThreadNamePrefix()).isEqualTo("report-options-");
      assertThat(executor.getThreadPoolExecutor().getRejectedExecutionHandler())
          .isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);
    } finally {
      executor.shutdown();
    }
  }
}

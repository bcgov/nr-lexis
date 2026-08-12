package ca.bc.gov.mof.lexis.configuration;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.SimpleAsyncTaskExecutor;
import org.springframework.util.Assert;

/** Configures virtual threads for asynchronous response streaming. */
@Configuration(proxyBeanMethods = false)
public class MvcAsyncExecutionConfiguration {

  private static final Duration SHUTDOWN_TIMEOUT = Duration.ofSeconds(10);

  @Bean(
      name = TaskExecutionAutoConfiguration.APPLICATION_TASK_EXECUTOR_BEAN_NAME,
      destroyMethod = "close")
  public SimpleAsyncTaskExecutor applicationTaskExecutor(
      @Value("${lexis.streaming.max-concurrency}") int maxConcurrency) {
    Assert.isTrue(maxConcurrency > 0, "lexis.streaming.max-concurrency must be greater than zero");
    SimpleAsyncTaskExecutor executor = new SimpleAsyncTaskExecutor("lexis-download-");
    executor.setVirtualThreads(true);
    executor.setConcurrencyLimit(maxConcurrency);
    executor.setRejectTasksWhenLimitReached(true);
    executor.setTaskTerminationTimeout(SHUTDOWN_TIMEOUT.toMillis());
    return executor;
  }
}

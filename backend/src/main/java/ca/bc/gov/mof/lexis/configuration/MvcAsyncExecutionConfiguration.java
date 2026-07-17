package ca.bc.gov.mof.lexis.configuration;

import java.time.Duration;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.SimpleAsyncTaskExecutor;

/** Configures virtual threads for asynchronous response streaming. */
@Configuration(proxyBeanMethods = false)
public class MvcAsyncExecutionConfiguration {

  private static final Duration SHUTDOWN_TIMEOUT = Duration.ofSeconds(10);

  @Bean(
      name = TaskExecutionAutoConfiguration.APPLICATION_TASK_EXECUTOR_BEAN_NAME,
      destroyMethod = "close")
  public SimpleAsyncTaskExecutor applicationTaskExecutor() {
    SimpleAsyncTaskExecutor executor = new SimpleAsyncTaskExecutor("lexis-download-");
    executor.setVirtualThreads(true);
    executor.setTaskTerminationTimeout(SHUTDOWN_TIMEOUT.toMillis());
    return executor;
  }
}

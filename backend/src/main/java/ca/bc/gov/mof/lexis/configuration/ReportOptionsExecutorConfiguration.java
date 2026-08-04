package ca.bc.gov.mof.lexis.configuration;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Configures the bounded executor used for independent report option lookups. */
@Configuration(proxyBeanMethods = false)
public class ReportOptionsExecutorConfiguration {

  public static final String EXECUTOR_BEAN_NAME = "reportOptionsExecutor";
  public static final int MAX_PARALLEL_LOOKUPS = 4;
  private static final int QUEUE_CAPACITY = MAX_PARALLEL_LOOKUPS * 4;

  @Bean(name = EXECUTOR_BEAN_NAME)
  public ThreadPoolTaskExecutor reportOptionsExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(MAX_PARALLEL_LOOKUPS);
    executor.setMaxPoolSize(MAX_PARALLEL_LOOKUPS);
    executor.setQueueCapacity(QUEUE_CAPACITY);
    executor.setThreadNamePrefix("report-options-");
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
    executor.setWaitForTasksToCompleteOnShutdown(false);
    executor.setStrictEarlyShutdown(true);
    executor.setAwaitTerminationSeconds(15);
    return executor;
  }
}

package ca.bc.gov.mof.lexis.configuration;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Configures the bounded executor used to assemble legacy Oracle dynamic search pages. */
@Configuration(proxyBeanMethods = false)
public class OracleLegacyDynamicFetchExecutorConfiguration {

  public static final String EXECUTOR_BEAN_NAME = "oracleLegacyDynamicFetchExecutor";
  public static final int MAX_PARALLEL_FETCHES = 4;
  private static final int QUEUE_CAPACITY = MAX_PARALLEL_FETCHES * 4;

  @Bean(name = EXECUTOR_BEAN_NAME)
  public ThreadPoolTaskExecutor oracleLegacyDynamicFetchExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(MAX_PARALLEL_FETCHES);
    executor.setMaxPoolSize(MAX_PARALLEL_FETCHES);
    // Four queued four-page batches absorb a modest request burst while bounding Oracle work.
    executor.setQueueCapacity(QUEUE_CAPACITY);
    executor.setThreadNamePrefix("oracle-legacy-page-fetch-");
    // Reject overload instead of running Oracle work on the caller/request thread.
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
    // These reads are retryable; do not drain stale queued work while Oracle is shutting down.
    executor.setWaitForTasksToCompleteOnShutdown(false);
    executor.setStrictEarlyShutdown(true);
    executor.setAwaitTerminationSeconds(15);
    return executor;
  }
}

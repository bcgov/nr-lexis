package ca.bc.gov.mof.lexis.configuration;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Configures the dedicated executor used for best-effort workflow email delivery. */
@Configuration
@EnableAsync
public class EmailNotificationConfiguration {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(EmailNotificationConfiguration.class);
  static final String REJECTED_TASK_METRIC = "lexis.email.executor.rejections";

  @Bean(name = "emailExecutor")
  public Executor emailExecutor(MeterRegistry meterRegistry) {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(2);
    executor.setMaxPoolSize(4);
    executor.setQueueCapacity(50);
    executor.setThreadNamePrefix("email-");
    Counter rejectedTasks =
        Counter.builder(REJECTED_TASK_METRIC)
            .description("Number of workflow email tasks rejected by the bounded executor")
            .register(meterRegistry);
    // Email is best effort after commit. Do not run SMTP on the request thread or throw after the
    // business transaction has already committed when this bounded executor is saturated.
    executor.setRejectedExecutionHandler(new EmailTaskRejectionHandler(rejectedTasks));
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(15);
    executor.initialize();
    return executor;
  }

  static final class EmailTaskRejectionHandler implements RejectedExecutionHandler {

    private final Counter rejectedTasks;

    EmailTaskRejectionHandler(Counter rejectedTasks) {
      this.rejectedTasks = rejectedTasks;
    }

    @Override
    public void rejectedExecution(Runnable task, ThreadPoolExecutor executor) {
      rejectedTasks.increment();
      LOGGER.error(
          "event=lexis_workflow_email operation=enqueue outcome=rejected activeThreads={} poolSize={} queuedTasks={}",
          executor.getActiveCount(),
          executor.getPoolSize(),
          executor.getQueue().size());
    }
  }
}

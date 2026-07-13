package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class EmailNotificationConfigurationTest {

  @Test
  void shouldMatchFsptsEmailExecutorProfile() {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    Executor configured = new EmailNotificationConfiguration().emailExecutor(registry);
    assertThat(configured).isInstanceOf(ThreadPoolTaskExecutor.class);

    ThreadPoolTaskExecutor executor = (ThreadPoolTaskExecutor) configured;
    try {
      assertThat(executor.getCorePoolSize()).isEqualTo(2);
      assertThat(executor.getMaxPoolSize()).isEqualTo(4);
      assertThat(executor.getQueueCapacity()).isEqualTo(50);
      assertThat(executor.getThreadNamePrefix()).isEqualTo("email-");
      assertThat(executor.getThreadPoolExecutor().getRejectedExecutionHandler())
          .isInstanceOf(EmailNotificationConfiguration.EmailTaskRejectionHandler.class);
    } finally {
      executor.shutdown();
      registry.close();
    }
  }

  @Test
  void saturatedExecutorShouldDiscardAndMeterTheFiftyFifthTaskWithoutThrowing()
      throws InterruptedException {
    SimpleMeterRegistry registry = new SimpleMeterRegistry();
    ThreadPoolTaskExecutor executor =
        (ThreadPoolTaskExecutor) new EmailNotificationConfiguration().emailExecutor(registry);
    CountDownLatch fourWorkersStarted = new CountDownLatch(4);
    CountDownLatch releaseWorkers = new CountDownLatch(1);
    Runnable blockedTask =
        () -> {
          fourWorkersStarted.countDown();
          try {
            releaseWorkers.await();
          } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
          }
        };

    try {
      // Two core workers run, fifty tasks fill the queue, and two more workers grow the pool to
      // its maximum. The next submission is therefore the first rejected task.
      for (int taskNumber = 1; taskNumber <= 54; taskNumber++) {
        executor.execute(blockedTask);
      }
      assertThat(fourWorkersStarted.await(Duration.ofSeconds(5).toMillis(), TimeUnit.MILLISECONDS))
          .isTrue();
      assertThat(executor.getActiveCount()).isEqualTo(4);
      assertThat(executor.getThreadPoolExecutor().getQueue()).hasSize(50);

      AtomicBoolean rejectedTaskRan = new AtomicBoolean();
      assertThatCode(() -> executor.execute(() -> rejectedTaskRan.set(true)))
          .doesNotThrowAnyException();

      assertThat(rejectedTaskRan).isFalse();
      assertThat(
              registry
                  .get(EmailNotificationConfiguration.REJECTED_TASK_METRIC)
                  .counter()
                  .count())
          .isEqualTo(1.0);
      assertThat(executor.getActiveCount()).isEqualTo(4);
      assertThat(executor.getThreadPoolExecutor().getQueue()).hasSize(50);
    } finally {
      releaseWorkers.countDown();
      executor.shutdown();
      registry.close();
    }
  }
}

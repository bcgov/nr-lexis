package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.util.ReflectionTestUtils;

class OracleLegacyDynamicFetchExecutorConfigurationTest {

  @Test
  void shouldConfigureDedicatedBoundedExecutorAndShutdownPolicy() {
    ThreadPoolTaskExecutor executor =
        new OracleLegacyDynamicFetchExecutorConfiguration().oracleLegacyDynamicFetchExecutor();
    executor.initialize();

    try {
      assertThat(executor.getCorePoolSize())
          .isEqualTo(OracleLegacyDynamicFetchExecutorConfiguration.MAX_PARALLEL_FETCHES);
      assertThat(executor.getMaxPoolSize())
          .isEqualTo(OracleLegacyDynamicFetchExecutorConfiguration.MAX_PARALLEL_FETCHES);
      assertThat(executor.getQueueCapacity()).isEqualTo(16);
      assertThat(executor.getThreadNamePrefix()).isEqualTo("oracle-legacy-page-fetch-");
      assertThat(executor.getThreadPoolExecutor().getQueue().remainingCapacity()).isEqualTo(16);
      assertThat(executor.getThreadPoolExecutor().getRejectedExecutionHandler())
          .isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);
      assertThat(ReflectionTestUtils.getField(executor, "waitForTasksToCompleteOnShutdown"))
          .isEqualTo(false);
      assertThat(ReflectionTestUtils.getField(executor, "strictEarlyShutdown")).isEqualTo(true);
      assertThat(ReflectionTestUtils.getField(executor, "awaitTerminationMillis"))
          .isEqualTo(15_000L);
    } finally {
      executor.shutdown();
    }
  }

  @Test
  void shutdownShouldCancelQueuedReadsAndBoundTheInFlightWait() throws Exception {
    ThreadPoolTaskExecutor executor =
        new OracleLegacyDynamicFetchExecutorConfiguration().oracleLegacyDynamicFetchExecutor();
    executor.initialize();
    CountDownLatch workersStarted =
        new CountDownLatch(
            OracleLegacyDynamicFetchExecutorConfiguration.MAX_PARALLEL_FETCHES);
    CountDownLatch workersInterrupted =
        new CountDownLatch(
            OracleLegacyDynamicFetchExecutorConfiguration.MAX_PARALLEL_FETCHES);
    CountDownLatch releaseWorkers = new CountDownLatch(1);
    AtomicBoolean queuedReadExecuted = new AtomicBoolean();

    try {
      for (
          int task = 0;
          task < OracleLegacyDynamicFetchExecutorConfiguration.MAX_PARALLEL_FETCHES;
          task++) {
        executor.execute(
            () -> holdUntilReleased(workersStarted, workersInterrupted, releaseWorkers));
      }
      assertThat(workersStarted.await(5, TimeUnit.SECONDS)).isTrue();
      Future<?> queuedRead = executor.submit(() -> queuedReadExecuted.set(true));

      CompletableFuture<Void> shutdown = CompletableFuture.runAsync(executor::shutdown);

      assertThat(workersInterrupted.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(queuedRead).isCancelled();
      assertThat(queuedReadExecuted).isFalse();
      releaseWorkers.countDown();
      shutdown.get(2, TimeUnit.SECONDS);
      assertThat(executor.getThreadPoolExecutor().isShutdown()).isTrue();
      assertThat(queuedReadExecuted).isFalse();
    } finally {
      releaseWorkers.countDown();
      executor.shutdown();
    }
  }

  @Test
  void springManagedRepositoryShouldRequireTheQualifiedExecutor() {
    new ApplicationContextRunner()
        .withUserConfiguration(RepositoryOnlyConfiguration.class)
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(context.getStartupFailure())
                  .hasRootCauseInstanceOf(NoSuchBeanDefinitionException.class)
                  .hasMessageContaining(
                      OracleLegacyDynamicFetchExecutorConfiguration.EXECUTOR_BEAN_NAME);
            });
  }

  @Test
  void springManagedRepositoryShouldResolveTheDedicatedExecutor() {
    AtomicReference<ThreadPoolTaskExecutor> managedExecutor = new AtomicReference<>();
    new ApplicationContextRunner()
        .withUserConfiguration(
            OracleLegacyDynamicFetchExecutorConfiguration.class,
            RepositoryOnlyConfiguration.class)
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(context).hasSingleBean(ContextRepository.class);
              assertThat(
                      context.getBean(
                          OracleLegacyDynamicFetchExecutorConfiguration.EXECUTOR_BEAN_NAME))
                  .isInstanceOf(ThreadPoolTaskExecutor.class);
              managedExecutor.set(
                  context.getBean(
                      OracleLegacyDynamicFetchExecutorConfiguration.EXECUTOR_BEAN_NAME,
                      ThreadPoolTaskExecutor.class));
            });
    assertThat(managedExecutor.get().getThreadPoolExecutor().isShutdown()).isTrue();
  }

  @Configuration(proxyBeanMethods = false)
  static class RepositoryOnlyConfiguration {

    @Bean(name = "oracleJdbcTemplate")
    JdbcTemplate oracleJdbcTemplate() {
      return mock(JdbcTemplate.class);
    }

    @Bean
    ContextRepository contextRepository(
        @Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
      return new ContextRepository(jdbcTemplate);
    }
  }

  private static final class ContextRepository extends OracleRepositorySupport {

    private ContextRepository(JdbcTemplate jdbcTemplate) {
      super(jdbcTemplate);
    }
  }

  private static void holdUntilReleased(
      CountDownLatch workersStarted,
      CountDownLatch workersInterrupted,
      CountDownLatch releaseWorkers) {
    workersStarted.countDown();
    boolean interrupted = false;
    while (true) {
      try {
        releaseWorkers.await();
        if (interrupted) {
          Thread.currentThread().interrupt();
        }
        return;
      } catch (InterruptedException ex) {
        interrupted = true;
        workersInterrupted.countDown();
      }
    }
  }
}

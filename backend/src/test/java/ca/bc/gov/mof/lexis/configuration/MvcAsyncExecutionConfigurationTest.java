package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.SimpleAsyncTaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter;

@SpringBootTest(
    properties = {
      "spring.profiles.active=stub-reports,stub-services",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json",
      "lexis.streaming.max-concurrency=2"
    })
class MvcAsyncExecutionConfigurationTest {

  @Autowired
  @Qualifier("applicationTaskExecutor")
  private Executor applicationTaskExecutor;

  @Autowired
  @Qualifier("emailExecutor")
  private Executor emailExecutor;

  @Autowired private RequestMappingHandlerAdapter handlerAdapter;

  @Test
  void mvcShouldUseDedicatedVirtualThreadExecutor() throws Exception {
    assertThat(applicationTaskExecutor).isNotSameAs(emailExecutor);
    assertThat(applicationTaskExecutor).isInstanceOf(SimpleAsyncTaskExecutor.class);
    SimpleAsyncTaskExecutor executor = (SimpleAsyncTaskExecutor) applicationTaskExecutor;
    assertThat(executor.getConcurrencyLimit()).isEqualTo(2);
    assertThat(executor.getThreadNamePrefix()).isEqualTo("lexis-download-");

    CountDownLatch completed = new CountDownLatch(1);
    boolean[] virtualThread = new boolean[1];
    executor.execute(
        () -> {
          virtualThread[0] = Thread.currentThread().isVirtual();
          completed.countDown();
        });
    assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
    assertThat(virtualThread[0]).isTrue();
    assertThat(ReflectionTestUtils.getField(handlerAdapter, "taskExecutor"))
        .isSameAs(applicationTaskExecutor);
    assertThat(ReflectionTestUtils.getField(handlerAdapter, "asyncRequestTimeout"))
        .isEqualTo(300_000L);
  }

  @Test
  void mvcShouldRejectTransfersBeyondTheConfiguredConcurrencyLimit() throws Exception {
    SimpleAsyncTaskExecutor executor = (SimpleAsyncTaskExecutor) applicationTaskExecutor;
    CountDownLatch started = new CountDownLatch(2);
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch completed = new CountDownLatch(2);

    try {
      for (int index = 0; index < 2; index++) {
        executor.execute(
            () -> {
              started.countDown();
              try {
                release.await();
              } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
              } finally {
                completed.countDown();
              }
            });
      }
      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      assertThatThrownBy(() -> executor.execute(() -> {}))
          .isInstanceOf(TaskRejectedException.class);
    } finally {
      release.countDown();
    }
    assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
  }
}

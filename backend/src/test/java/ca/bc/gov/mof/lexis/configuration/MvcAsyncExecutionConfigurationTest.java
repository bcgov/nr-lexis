package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter;

@SpringBootTest(
    properties = {
      "spring.profiles.active=stub-reports,stub-services",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito-idp.ca-central-1.amazonaws.com/test",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json"
    })
class MvcAsyncExecutionConfigurationTest {

  @Autowired
  @Qualifier("applicationTaskExecutor")
  private Executor applicationTaskExecutor;

  @Autowired
  @Qualifier("emailExecutor")
  private Executor emailExecutor;

  @Autowired
  @Qualifier(OracleLegacyDynamicFetchExecutorConfiguration.EXECUTOR_BEAN_NAME)
  private Executor oracleLegacyDynamicFetchExecutor;

  @Autowired private RequestMappingHandlerAdapter handlerAdapter;

  @Test
  void mvcShouldUseDedicatedBoundedExecutor() {
    assertThat(applicationTaskExecutor).isNotSameAs(emailExecutor);
    assertThat(applicationTaskExecutor).isNotSameAs(oracleLegacyDynamicFetchExecutor);
    assertThat(emailExecutor).isNotSameAs(oracleLegacyDynamicFetchExecutor);
    assertThat(applicationTaskExecutor).isInstanceOf(ThreadPoolTaskExecutor.class);
    ThreadPoolTaskExecutor executor = (ThreadPoolTaskExecutor) applicationTaskExecutor;

    assertThat(executor.getCorePoolSize()).isEqualTo(2);
    assertThat(executor.getMaxPoolSize()).isEqualTo(4);
    assertThat(executor.getQueueCapacity()).isEqualTo(8);
    assertThat(executor.getThreadNamePrefix()).isEqualTo("lexis-stream-");
    assertThat(executor.getThreadPoolExecutor().getRejectedExecutionHandler())
        .isInstanceOf(ThreadPoolExecutor.AbortPolicy.class);
    assertThat(ReflectionTestUtils.getField(handlerAdapter, "taskExecutor"))
        .isSameAs(applicationTaskExecutor);
    assertThat(ReflectionTestUtils.getField(handlerAdapter, "asyncRequestTimeout"))
        .isEqualTo(300_000L);
  }
}

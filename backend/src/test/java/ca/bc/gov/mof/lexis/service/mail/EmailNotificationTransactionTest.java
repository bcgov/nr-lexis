package ca.bc.gov.mof.lexis.service.mail;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import java.util.concurrent.Executor;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

class EmailNotificationTransactionTest {

  @Test
  void shouldDispatchOnlyAfterCommit() {
    try (AnnotationConfigApplicationContext context = context()) {
      LexisMailService mailService = context.getBean(LexisMailService.class);
      EmailNotificationService notificationService =
          context.getBean(EmailNotificationService.class);

      TransactionTemplate transaction =
          new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
      transaction.executeWithoutResult(
          status -> {
            notificationService.publish(event());
            verifyNoInteractions(mailService);
          });

      verify(mailService)
          .send(
              "LEXIS permit #7000123 ready for review",
              "Permit #7000123 is ready for review.\n",
              List.of("reviewers@gov.bc.ca", "applicant@example.com"),
              List.of(),
              "REGION_RCO",
              null,
              RegionalMailRoute.GENERAL);
    }
  }

  @Test
  void shouldDropEventWhenTransactionRollsBack() {
    try (AnnotationConfigApplicationContext context = context()) {
      LexisMailService mailService = context.getBean(LexisMailService.class);
      EmailNotificationService notificationService =
          context.getBean(EmailNotificationService.class);

      TransactionTemplate transaction =
          new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
      transaction.executeWithoutResult(
          status -> {
            notificationService.publish(event());
            status.setRollbackOnly();
          });

      verifyNoInteractions(mailService);
    }
  }

  @Test
  void shouldDispatchOutsideTransactionWhenNoTransactionIsActive() {
    try (AnnotationConfigApplicationContext context = context()) {
      LexisMailService mailService = context.getBean(LexisMailService.class);
      context.getBean(EmailNotificationService.class).publish(event());

      verify(mailService)
          .send(
              "LEXIS permit #7000123 ready for review",
              "Permit #7000123 is ready for review.\n",
              List.of("reviewers@gov.bc.ca", "applicant@example.com"),
              List.of(),
              "REGION_RCO",
              null,
              RegionalMailRoute.GENERAL);
    }
  }

  private AnnotationConfigApplicationContext context() {
    return new AnnotationConfigApplicationContext(TestConfiguration.class);
  }

  private WorkflowEmailEvent event() {
    return new WorkflowEmailEvent.PermitReview(
        7000123L,
        List.of("reviewers@gov.bc.ca", "applicant@example.com"),
        List.of(),
        "REGION_RCO");
  }

  @Configuration
  @EnableAsync
  @EnableTransactionManagement
  static class TestConfiguration {

    @Bean
    EmailNotificationService emailNotificationService(
        org.springframework.context.ApplicationEventPublisher publisher) {
      return new EmailNotificationService(publisher);
    }

    @Bean
    EmailEventDispatcher emailEventDispatcher(
        LexisMailService mailService,
        EmailTemplateRenderer renderer,
        MeterRegistry meterRegistry) {
      return new EmailEventDispatcher(mailService, renderer, meterRegistry);
    }

    @Bean
    EmailTemplateRenderer emailTemplateRenderer() {
      return new EmailTemplateRenderer();
    }

    @Bean
    LexisMailService mailService() {
      return org.mockito.Mockito.mock(LexisMailService.class);
    }

    @Bean
    MeterRegistry meterRegistry() {
      return new SimpleMeterRegistry();
    }

    @Bean(name = "emailExecutor")
    Executor emailExecutor() {
      return new SyncTaskExecutor();
    }

    @Bean
    PlatformTransactionManager transactionManager() {
      return new TestTransactionManager();
    }
  }

  static class TestTransactionManager extends AbstractPlatformTransactionManager {

    @Override
    protected Object doGetTransaction() {
      return new Object();
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
      // No resource is needed; the test exercises Spring transaction synchronization only.
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
      // Commit callbacks are driven by AbstractPlatformTransactionManager.
    }

    @Override
    protected void doRollback(DefaultTransactionStatus status) {
      // Rollback callbacks are driven by AbstractPlatformTransactionManager.
    }
  }
}

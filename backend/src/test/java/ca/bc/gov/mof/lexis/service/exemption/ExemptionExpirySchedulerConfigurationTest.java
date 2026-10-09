package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;

class ExemptionExpirySchedulerConfigurationTest {

  private final ExemptionExpiryService expiryService = mock(ExemptionExpiryService.class);
  private final LockProvider lockProvider = mock(LockProvider.class);
  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withPropertyValues("spring.profiles.active=oracle")
          .withBean(ExemptionExpiryService.class, () -> expiryService)
          .withBean("expiryLockProvider", LockProvider.class, () -> lockProvider)
          .withBean(MeterRegistry.class, SimpleMeterRegistry::new)
          .withUserConfiguration(ExemptionExpiryScheduler.class, SchedulingConfiguration.class);

  @Test
  void disabledExpiryShouldRegisterNeitherScheduledTaskNorStartupListener() {
    contextRunner.withPropertyValues("lexis.expiry.enabled=false").run(
        context -> {
          assertThat(context).doesNotHaveBean(ExemptionExpiryScheduler.class);
          assertThat(context.getBean(ScheduledAnnotationBeanPostProcessor.class).getScheduledTasks())
              .isEmpty();

          context.publishEvent(
              new ApplicationReadyEvent(
                  new SpringApplication(),
                  new String[0],
                  context.getSourceApplicationContext(),
                  Duration.ZERO));

          verifyNoInteractions(expiryService, lockProvider);
        });
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void enabledOrDefaultExpiryShouldRegisterScheduleAndRunStartupCatchUp(boolean explicitSetting) {
    SimpleLock lock = mock(SimpleLock.class);
    when(lockProvider.lock(any())).thenReturn(Optional.of(lock));
    when(expiryService.expireDueExemptions())
        .thenReturn(new ExemptionExpiryService.ExpiryRunResult(0, List.of(), List.of()));
    ApplicationContextRunner runner =
        explicitSetting
            ? contextRunner.withPropertyValues("lexis.expiry.enabled=true")
            : contextRunner;

    runner.run(
        context -> {
          assertThat(context).hasSingleBean(ExemptionExpiryScheduler.class);
          assertThat(context.getBean(ScheduledAnnotationBeanPostProcessor.class).getScheduledTasks())
              .hasSize(1);

          context.publishEvent(
              new ApplicationReadyEvent(
                  new SpringApplication(),
                  new String[0],
                  context.getSourceApplicationContext(),
                  Duration.ZERO));

          verify(expiryService).expireDueExemptions();
          verify(lockProvider).lock(any());
          verify(lock).unlock();
        });
  }

  @Configuration(proxyBeanMethods = false)
  @EnableScheduling
  static class SchedulingConfiguration {}
}

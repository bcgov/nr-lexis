package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ExemptionExpiryProcessorConfigurationTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withPropertyValues("spring.profiles.active=oracle")
          .withBean(
              ExemptionDetailsRpcRepository.class,
              () -> mock(ExemptionDetailsRpcRepository.class))
          .withBean(
              ApplicationDetailsRpcRepository.class,
              () -> mock(ApplicationDetailsRpcRepository.class))
          .withBean(PermitRpcRepository.class, () -> mock(PermitRpcRepository.class))
          .withBean(
              ApplicationEditLockService.class,
              () -> mock(ApplicationEditLockService.class))
          .withUserConfiguration(ExemptionExpiryProcessor.class);

  @Test
  void oracleProfileShouldCreateExpiryProcessor() {
    contextRunner.run(
        context -> assertThat(context).hasSingleBean(ExemptionExpiryProcessor.class));
  }
}

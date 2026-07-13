package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.configuration.OracleLegacyDynamicFetchExecutorConfiguration;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class OracleCanadianPermitInvoiceConfigurationTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withBean(PermitInvoiceRepository.class, () -> mock(PermitInvoiceRepository.class))
          .withUserConfiguration(
              OracleLegacyDynamicFetchExecutorConfiguration.class,
              OracleCanadianPermitInvoiceOrchestrationService.class)
          .withPropertyValues("spring.profiles.active=oracle");

  @Test
  void shouldEnableCanadianInternalInvoicingByDefault() {
    contextRunner.run(
        context ->
            assertThat(context)
                .hasSingleBean(OracleCanadianPermitInvoiceOrchestrationService.class)
                .hasSingleBean(PermitInvoiceOrchestrationService.class));
  }

  @Test
  void shouldEnableTheExplicitCanadianInternalMode() {
    contextRunner
        .withPropertyValues("lexis.permit-invoice.mode=canadian-internal")
        .run(
            context ->
                assertThat(context)
                    .hasSingleBean(OracleCanadianPermitInvoiceOrchestrationService.class)
                    .hasSingleBean(PermitInvoiceOrchestrationService.class));
  }

  @Test
  void shouldAllowAnExplicitOperationalDisable() {
    contextRunner
        .withPropertyValues("lexis.permit-invoice.mode=disabled")
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean(OracleCanadianPermitInvoiceOrchestrationService.class)
                    .doesNotHaveBean(PermitInvoiceOrchestrationService.class));
  }

  @Test
  void shouldRejectUnknownModes() {
    contextRunner
        .withPropertyValues("lexis.permit-invoice.mode=gbms")
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean(OracleCanadianPermitInvoiceOrchestrationService.class)
                    .doesNotHaveBean(PermitInvoiceOrchestrationService.class));
  }
}

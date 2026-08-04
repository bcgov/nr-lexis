package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.configuration.PermitInvoiceModeConfiguration;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class OracleCanadianPermitInvoiceConfigurationTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withBean(PermitInvoiceRepository.class, () -> mock(PermitInvoiceRepository.class))
          .withBean(PermitRpcRepository.class, () -> mock(PermitRpcRepository.class))
          .withBean(
              OracleGbmsPermitInvoiceService.class,
              () -> mock(OracleGbmsPermitInvoiceService.class))
          .withUserConfiguration(
              PermitInvoiceModeConfiguration.class,
              OracleCanadianPermitInvoiceOrchestrationService.class,
              OracleLegacyPermitInvoiceOrchestrationService.class)
          .withPropertyValues("spring.profiles.active=oracle");

  @Test
  void shouldEnableLegacyBestEffortInvoicingByDefault() {
    contextRunner.run(
        context ->
            assertThat(context)
                .hasSingleBean(OracleLegacyPermitInvoiceOrchestrationService.class)
                .doesNotHaveBean(OracleCanadianPermitInvoiceOrchestrationService.class)
                .hasSingleBean(PermitInvoiceOrchestrationService.class));
  }

  @Test
  void shouldAllowAnExplicitLegacyBestEffortMode() {
    contextRunner
        .withPropertyValues("lexis.permit-invoice.mode=legacy-best-effort")
        .run(
            context ->
                assertThat(context)
                    .hasSingleBean(OracleLegacyPermitInvoiceOrchestrationService.class)
                    .doesNotHaveBean(OracleCanadianPermitInvoiceOrchestrationService.class)
                    .hasSingleBean(PermitInvoiceOrchestrationService.class));
  }

  @Test
  void shouldAllowTheCanadianInternalRollbackMode() {
    contextRunner
        .withPropertyValues("lexis.permit-invoice.mode=canadian-internal")
        .run(
            context ->
                assertThat(context)
                    .hasSingleBean(OracleCanadianPermitInvoiceOrchestrationService.class)
                    .doesNotHaveBean(OracleLegacyPermitInvoiceOrchestrationService.class)
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
                    .doesNotHaveBean(OracleLegacyPermitInvoiceOrchestrationService.class)
                    .doesNotHaveBean(PermitInvoiceOrchestrationService.class));
  }

  @Test
  void shouldFailStartupForUnknownModes() {
    contextRunner
        .withPropertyValues("lexis.permit-invoice.mode=gbms")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .hasMessageContaining("Permit invoice mode must be"));
  }

  @Test
  void shouldFailStartupForBlankModes() {
    contextRunner
        .withPropertyValues("lexis.permit-invoice.mode=")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .hasMessageContaining("Permit invoice mode must be"));
  }
}

package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.session.LexisUserPreferenceService;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ListableBeanFactory;

class OracleServiceRequirementConfigurationTest {

  @Test
  void shouldAcceptACompleteOracleBusinessServiceRuntime() {
    ListableBeanFactory beanFactory = mock(ListableBeanFactory.class);
    when(beanFactory.getBeanNamesForType(any(Class.class), eq(true), eq(false)))
        .thenReturn(new String[] {"oracleService"});

    assertThatCode(
            () ->
                OracleServiceRequirementConfiguration.assertRequiredServicesAvailable(
                    beanFactory))
        .doesNotThrowAnyException();
  }

  @Test
  void shouldReportEveryMissingEssentialOracleService() {
    ListableBeanFactory beanFactory = mock(ListableBeanFactory.class);
    Set<Class<?>> missingTypes = Set.of(PermitDetailsRpcService.class, LexisReportService.class);
    when(beanFactory.getBeanNamesForType(any(Class.class), eq(true), eq(false)))
        .thenAnswer(
            invocation ->
                missingTypes.contains(invocation.getArgument(0))
                    ? new String[0]
                    : new String[] {"oracleService"});

    assertThatThrownBy(
            () ->
                OracleServiceRequirementConfiguration.assertRequiredServicesAvailable(
                    beanFactory))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("PermitDetailsRpcService")
        .hasMessageContaining("LexisReportService");
  }

  @Test
  void shouldInventoryInteractiveFederalAndReportServiceSurfaces() {
    assertThat(OracleServiceRequirementConfiguration.requiredServiceTypes())
        .contains(
            ApplicationDetailsRpcService.class,
            PermitDetailsRpcService.class,
            FederalApplicationService.class,
            LexisReportService.class,
            LexisUserPreferenceService.class)
        .doesNotHaveDuplicates();
  }
}

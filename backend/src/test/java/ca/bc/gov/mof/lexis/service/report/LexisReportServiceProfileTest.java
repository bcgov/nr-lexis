package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class LexisReportServiceProfileTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withBean(DataSource.class, () -> mock(DataSource.class))
          .withBean(
              LexisJasperReportParameterProvider.class,
              () -> mock(LexisJasperReportParameterProvider.class))
          .withBean(
              OracleLegacyCsvReportService.class,
              () -> mock(OracleLegacyCsvReportService.class))
          .withBean(
              OracleLegacyJasperTableReportService.class,
              () -> mock(OracleLegacyJasperTableReportService.class))
          .withBean(PermitRpcRepository.class, () -> mock(PermitRpcRepository.class))
          .withBean(
              LexisReportScheduleRepository.class,
              () -> mock(LexisReportScheduleRepository.class))
          .withBean(LexisSessionService.class, () -> mock(LexisSessionService.class))
          .withBean(
              LexisReportResourceManager.class,
              () -> mock(LexisReportResourceManager.class))
          .withUserConfiguration(
              InMemoryLexisReportService.class, OracleLexisReportService.class);

  @Test
  void defaultProfileShouldNotProvideAReportService() {
    contextRunner.run(
        context ->
            assertThat(context)
                .doesNotHaveBean(LexisReportService.class)
                .doesNotHaveBean(InMemoryLexisReportService.class)
                .doesNotHaveBean(OracleLexisReportService.class));
  }

  @Test
  void unrelatedNonOracleProfileShouldNotProvideAReportService() {
    contextRunner
        .withPropertyValues("spring.profiles.active=test")
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean(LexisReportService.class)
                    .doesNotHaveBean(InMemoryLexisReportService.class)
                    .doesNotHaveBean(OracleLexisReportService.class));
  }

  @Test
  void stubReportsProfileShouldProvideOnlyTheStubService() {
    contextRunner
        .withPropertyValues("spring.profiles.active=stub-reports")
        .run(
            context ->
                assertThat(context)
                    .hasSingleBean(LexisReportService.class)
                    .hasSingleBean(InMemoryLexisReportService.class)
                    .doesNotHaveBean(OracleLexisReportService.class));
  }

  @Test
  void oracleProfileShouldProvideOnlyTheOracleService() {
    contextRunner
        .withPropertyValues("spring.profiles.active=oracle")
        .run(
            context ->
                assertThat(context)
                    .hasSingleBean(LexisReportService.class)
                    .doesNotHaveBean(InMemoryLexisReportService.class)
                    .hasSingleBean(OracleLexisReportService.class));
  }

  @Test
  void oracleProfileShouldSuppressTheStubWhenBothProfilesAreActive() {
    contextRunner
        .withPropertyValues("spring.profiles.active=oracle,stub-reports")
        .run(
            context ->
                assertThat(context)
                    .hasSingleBean(LexisReportService.class)
                    .doesNotHaveBean(InMemoryLexisReportService.class)
                    .hasSingleBean(OracleLexisReportService.class));
  }
}

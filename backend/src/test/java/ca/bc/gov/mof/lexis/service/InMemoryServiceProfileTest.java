package ca.bc.gov.mof.lexis.service;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.service.admin.InMemoryLexisAdminRpcService;
import ca.bc.gov.mof.lexis.service.admin.InMemoryLexisAdminService;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminRpcService;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminService;
import ca.bc.gov.mof.lexis.service.application.InMemoryLexisApplicationService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.rtm.InMemoryRtmEmsLogAmvService;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.service.upload.AttachmentUploadValidator;
import ca.bc.gov.mof.lexis.service.upload.InMemoryLexisUploadService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class InMemoryServiceProfileTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner()
          .withBean(VirusScanService.class, () -> VirusScanService.NO_OP)
          .withBean(AttachmentUploadValidator.class, AttachmentUploadValidator::new)
          .withUserConfiguration(
              InMemoryLexisAdminRpcService.class,
              InMemoryLexisAdminService.class,
              InMemoryLexisApplicationService.class,
              InMemoryRtmEmsLogAmvService.class,
              InMemoryLexisUploadService.class);

  @Test
  void defaultProfileShouldNotProvideInMemoryBusinessServices() {
    contextRunner.run(this::assertNoInMemoryBusinessServices);
  }

  @Test
  void unrelatedProfileShouldNotProvideInMemoryBusinessServices() {
    contextRunner
        .withPropertyValues("spring.profiles.active=test")
        .run(this::assertNoInMemoryBusinessServices);
  }

  @Test
  void stubServicesProfileShouldProvideInMemoryBusinessServices() {
    contextRunner
        .withPropertyValues("spring.profiles.active=stub-services")
        .run(
            context -> {
              assertThat(context).hasSingleBean(LexisAdminRpcService.class);
              assertThat(context).hasSingleBean(LexisAdminService.class);
              assertThat(context).hasSingleBean(LexisApplicationService.class);
              assertThat(context).hasSingleBean(RtmEmsLogAmvService.class);
              assertThat(context).hasSingleBean(LexisUploadService.class);
            });
  }

  @Test
  void oracleProfileShouldSuppressStubsWhenBothProfilesAreActive() {
    contextRunner
        .withPropertyValues("spring.profiles.active=oracle,stub-services")
        .run(this::assertNoInMemoryBusinessServices);
  }

  private void assertNoInMemoryBusinessServices(AssertableApplicationContext context) {
    assertThat(context)
        .doesNotHaveBean(LexisAdminRpcService.class)
        .doesNotHaveBean(LexisAdminService.class)
        .doesNotHaveBean(LexisApplicationService.class)
        .doesNotHaveBean(RtmEmsLogAmvService.class)
        .doesNotHaveBean(LexisUploadService.class);
  }
}

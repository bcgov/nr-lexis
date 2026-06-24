package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.repository.rtm.OracleRtmEmsLogAmvRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

class OracleRtmEmsLogAmvServiceTest {

  @Test
  void shouldInstantiateWithRepositoryConstructorInOracleProfile() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles("oracle");
      context.registerBean(
          OracleRtmEmsLogAmvRepository.class,
          () -> mock(OracleRtmEmsLogAmvRepository.class));
      context.register(OracleRtmEmsLogAmvService.class);

      context.refresh();

      assertThat(context.getBean(RtmEmsLogAmvService.class))
          .isInstanceOf(OracleRtmEmsLogAmvService.class);
    }
  }
}

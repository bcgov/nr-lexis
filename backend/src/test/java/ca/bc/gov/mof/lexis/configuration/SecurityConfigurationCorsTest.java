package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockHeaders;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

class SecurityConfigurationCorsTest {

  @Test
  void shouldExposeOptimisticConcurrencyResponseHeaders() {
    SecurityConfiguration configuration = new SecurityConfiguration();
    ReflectionTestUtils.setField(configuration, "allowedOrigins", "https://lexis.example.test");

    var cors =
        configuration
            .corsConfigurationSource()
            .getCorsConfiguration(new MockHttpServletRequest("GET", "/api/lexis/applications/1"));

    assertThat(cors).isNotNull();
    assertThat(cors.getExposedHeaders())
        .containsExactly(OptimisticLockHeaders.RECORD_VERSION, "ETag");
  }
}

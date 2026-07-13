package ca.bc.gov.mof.lexis.service.scan;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class VirusScanPropertiesTest {

  @Test
  void validBoundaryValuesShouldBeAccepted() {
    assertThatCode(
            () ->
                new VirusScanProperties(
                    true,
                    "clamav",
                    65_535,
                    VirusScanProperties.MAX_TIMEOUT,
                    VirusScanProperties.MAX_CHUNK_SIZE))
        .doesNotThrowAnyException();
  }

  @ParameterizedTest
  @MethodSource("invalidProperties")
  void invalidValuesShouldFailAtConfigurationBinding(
      String host, int port, Duration timeout, int chunkSize) {
    assertThatThrownBy(() -> new VirusScanProperties(true, host, port, timeout, chunkSize))
        .isInstanceOf(IllegalArgumentException.class);
  }

  private static Stream<Arguments> invalidProperties() {
    return Stream.of(
        Arguments.of(" ", 3310, Duration.ofSeconds(10), 8192),
        Arguments.of("clamav", 0, Duration.ofSeconds(10), 8192),
        Arguments.of("clamav", 65_536, Duration.ofSeconds(10), 8192),
        Arguments.of("clamav", 3310, Duration.ZERO, 8192),
        Arguments.of("clamav", 3310, VirusScanProperties.MAX_TIMEOUT.plusMillis(1), 8192),
        Arguments.of("clamav", 3310, Duration.ofSeconds(10), 0),
        Arguments.of(
            "clamav",
            3310,
            Duration.ofSeconds(10),
            VirusScanProperties.MAX_CHUNK_SIZE + 1));
  }
}

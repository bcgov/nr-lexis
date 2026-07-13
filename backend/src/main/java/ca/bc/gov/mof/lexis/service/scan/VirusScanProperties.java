package ca.bc.gov.mof.lexis.service.scan;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "lexis.virus-scan")
public record VirusScanProperties(
    @DefaultValue("false") boolean enabled,
    @DefaultValue("localhost") String host,
    @DefaultValue("3310") int port,
    @DefaultValue("PT10S") Duration timeout,
    @DefaultValue("8192") int chunkSize) {

  static final int MAX_CHUNK_SIZE = 1024 * 1024;
  static final Duration MIN_TIMEOUT = Duration.ofMillis(1);
  static final Duration MAX_TIMEOUT = Duration.ofMinutes(2);

  public VirusScanProperties {
    if (host == null || host.isBlank()) {
      throw new IllegalArgumentException("Virus scan host must not be blank.");
    }
    if (port < 1 || port > 65_535) {
      throw new IllegalArgumentException("Virus scan port must be between 1 and 65535.");
    }
    if (timeout == null
        || timeout.compareTo(MIN_TIMEOUT) < 0
        || timeout.compareTo(MAX_TIMEOUT) > 0) {
      throw new IllegalArgumentException("Virus scan timeout must be between 1 ms and 2 minutes.");
    }
    if (chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
      throw new IllegalArgumentException("Virus scan chunk size must be between 1 byte and 1 MiB.");
    }
  }
}

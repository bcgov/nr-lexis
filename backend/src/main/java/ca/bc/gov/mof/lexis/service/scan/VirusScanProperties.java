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
    @DefaultValue("8192") int chunkSize) {}

package ca.bc.gov.mof.lexis.service.report;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Component
@Validated
@ConfigurationProperties(prefix = "lexis.reports")
public class LexisReportResourceProperties {

  static final long DEFAULT_MAX_OUTPUT_BYTES = 25L * 1024L * 1024L;
  static final int DEFAULT_QUERY_TIMEOUT_SECONDS = 120;

  @Min(1)
  private int maxConcurrent = 4;

  @Min(1)
  @Max(Integer.MAX_VALUE)
  private long maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES;

  @NotBlank
  private String virtualizerDirectory = "/tmp/lexis-jasper";

  @Min(1)
  private int virtualizerMaxPages = 50;

  @Min(1)
  @Max(3600)
  private int queryTimeoutSeconds = DEFAULT_QUERY_TIMEOUT_SECONDS;

  public int getMaxConcurrent() {
    return maxConcurrent;
  }

  public void setMaxConcurrent(int maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
  }

  public long getMaxOutputBytes() {
    return maxOutputBytes;
  }

  public void setMaxOutputBytes(long maxOutputBytes) {
    this.maxOutputBytes = maxOutputBytes;
  }

  public String getVirtualizerDirectory() {
    return virtualizerDirectory;
  }

  public void setVirtualizerDirectory(String virtualizerDirectory) {
    this.virtualizerDirectory = virtualizerDirectory;
  }

  public int getVirtualizerMaxPages() {
    return virtualizerMaxPages;
  }

  public void setVirtualizerMaxPages(int virtualizerMaxPages) {
    this.virtualizerMaxPages = virtualizerMaxPages;
  }

  public int getQueryTimeoutSeconds() {
    return queryTimeoutSeconds;
  }

  public void setQueryTimeoutSeconds(int queryTimeoutSeconds) {
    this.queryTimeoutSeconds = queryTimeoutSeconds;
  }
}

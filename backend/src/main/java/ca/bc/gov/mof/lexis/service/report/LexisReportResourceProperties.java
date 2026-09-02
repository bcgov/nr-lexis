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

  static final int DEFAULT_QUERY_TIMEOUT_SECONDS = 120;
  static final int DEFAULT_JDBC_FETCH_SIZE = 100;
  static final int DEFAULT_MAX_CONCURRENT_GENERATIONS = 6;

  @NotBlank
  private String artifactDirectory = "/tmp/lexis-reports";

  @Min(1)
  private int artifactStaleAfterMinutes = 60;

  @NotBlank
  private String virtualizerDirectory = "/tmp/lexis-jasper";

  @Min(1)
  private int virtualizerMaxPages = 50;

  @Min(1)
  @Max(3600)
  private int queryTimeoutSeconds = DEFAULT_QUERY_TIMEOUT_SECONDS;

  @Min(1)
  @Max(10_000)
  private int jdbcFetchSize = DEFAULT_JDBC_FETCH_SIZE;

  @Min(1)
  @Max(9)
  private int maxConcurrentGenerations = DEFAULT_MAX_CONCURRENT_GENERATIONS;

  public String getArtifactDirectory() {
    return artifactDirectory;
  }

  public void setArtifactDirectory(String artifactDirectory) {
    this.artifactDirectory = artifactDirectory;
  }

  public int getArtifactStaleAfterMinutes() {
    return artifactStaleAfterMinutes;
  }

  public void setArtifactStaleAfterMinutes(int artifactStaleAfterMinutes) {
    this.artifactStaleAfterMinutes = artifactStaleAfterMinutes;
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

  public int getJdbcFetchSize() {
    return jdbcFetchSize;
  }

  public void setJdbcFetchSize(int jdbcFetchSize) {
    this.jdbcFetchSize = jdbcFetchSize;
  }

  public int getMaxConcurrentGenerations() {
    return maxConcurrentGenerations;
  }

  public void setMaxConcurrentGenerations(int maxConcurrentGenerations) {
    this.maxConcurrentGenerations = maxConcurrentGenerations;
  }
}

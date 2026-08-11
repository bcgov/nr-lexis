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

  @NotBlank
  private String artifactDirectory = "/tmp/lexis-reports";

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

  public String getArtifactDirectory() {
    return artifactDirectory;
  }

  public void setArtifactDirectory(String artifactDirectory) {
    this.artifactDirectory = artifactDirectory;
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
}

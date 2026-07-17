package ca.bc.gov.mof.lexis.service.report;

/** Indicates that a configured report could not be generated because a dependency or template failed. */
public class LexisReportGenerationException extends RuntimeException {

  public LexisReportGenerationException(String message, Throwable cause) {
    super(message, cause);
  }
}

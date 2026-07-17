package ca.bc.gov.mof.lexis.service.report;

/** Indicates that a generated report exceeded this pod's configured output-size budget. */
public class LexisReportOutputLimitException extends RuntimeException {

  public LexisReportOutputLimitException(long maxOutputBytes) {
    super(
        "The generated report exceeds the configured maximum of "
            + maxOutputBytes
            + " bytes. Narrow the report filters and try again.");
  }
}

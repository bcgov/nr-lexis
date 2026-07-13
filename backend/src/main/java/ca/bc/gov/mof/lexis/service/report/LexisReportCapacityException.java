package ca.bc.gov.mof.lexis.service.report;

/** Indicates that this pod is already using all configured report-generation slots. */
public class LexisReportCapacityException extends RuntimeException {

  public LexisReportCapacityException(String message) {
    super(message);
  }
}

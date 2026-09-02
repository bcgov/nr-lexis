package ca.bc.gov.mof.lexis.service.report;

/** Indicates that the per-pod report generation capacity is currently exhausted. */
public class LexisReportCapacityException extends RuntimeException {

  public LexisReportCapacityException() {
    super("Report generation capacity is currently exhausted.");
  }
}

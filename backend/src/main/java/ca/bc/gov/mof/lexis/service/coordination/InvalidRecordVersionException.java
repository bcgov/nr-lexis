package ca.bc.gov.mof.lexis.service.coordination;

public class InvalidRecordVersionException extends RuntimeException {

  public InvalidRecordVersionException(String message, Throwable cause) {
    super(message, cause);
  }
}

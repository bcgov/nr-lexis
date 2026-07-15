package ca.bc.gov.mof.lexis.service.coordination;

public class DistributedLockBusyException extends RuntimeException {

  public DistributedLockBusyException(String message) {
    super(message);
  }

  public DistributedLockBusyException(String message, Throwable cause) {
    super(message, cause);
  }
}

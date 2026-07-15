package ca.bc.gov.mof.lexis.service.permit;

final class CoordinatedRollbackResultException extends RuntimeException {

  private final Object result;

  CoordinatedRollbackResultException(Object result) {
    super(null, null, false, false);
    this.result = result;
  }

  @SuppressWarnings("unchecked")
  <T> T result() {
    return (T) result;
  }
}

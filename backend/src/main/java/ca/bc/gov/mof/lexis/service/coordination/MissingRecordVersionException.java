package ca.bc.gov.mof.lexis.service.coordination;

public class MissingRecordVersionException extends RuntimeException {

  public MissingRecordVersionException() {
    super("A record version is required to change this existing record. Refresh the record and try again.");
  }
}

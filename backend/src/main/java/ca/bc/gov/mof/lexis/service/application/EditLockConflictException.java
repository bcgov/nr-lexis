package ca.bc.gov.mof.lexis.service.application;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class EditLockConflictException extends RuntimeException {

  public EditLockConflictException(String message) {
    super(message);
  }
}

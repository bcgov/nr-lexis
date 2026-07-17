package ca.bc.gov.mof.lexis.repository.application;

import org.springframework.dao.DataIntegrityViolationException;

/** Identifies an exact package-number conflict confirmed after the Oracle header insert. */
public final class DuplicatePackageNumberException extends DataIntegrityViolationException {

  private final String packageNumber;

  public DuplicatePackageNumberException(String packageNumber, Throwable cause) {
    super("Package " + packageNumber + " already exists.", cause);
    this.packageNumber = packageNumber;
  }

  public String packageNumber() {
    return packageNumber;
  }
}

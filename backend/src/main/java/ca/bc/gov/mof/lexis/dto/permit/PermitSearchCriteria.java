package ca.bc.gov.mof.lexis.dto.permit;

import java.time.LocalDate;
import java.util.List;

public record PermitSearchCriteria(
    String applicationNumber,
    String packageNumber,
    String permitNumber,
    LocalDate issuedFromDate,
    LocalDate issuedToDate,
    String permitStatus,
    String invoiceNumber,
    String applicantClientNumber,
    String ownerClientNumber,
    boolean requireScalePermit,
    List<Long> regionNumbers,
    String sortField,
    int page,
    int size) {

  public PermitSearchCriteria(
      String applicationNumber,
      String packageNumber,
      String permitNumber,
      LocalDate issuedFromDate,
      LocalDate issuedToDate,
      String permitStatus,
      String invoiceNumber,
      String applicantClientNumber,
      String ownerClientNumber,
      List<Long> regionNumbers,
      String sortField,
      int page,
      int size) {
    this(
        applicationNumber,
        packageNumber,
        permitNumber,
        issuedFromDate,
        issuedToDate,
        permitStatus,
        invoiceNumber,
        applicantClientNumber,
        ownerClientNumber,
        false,
        regionNumbers,
        sortField,
        page,
        size);
  }
}

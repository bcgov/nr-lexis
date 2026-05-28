package ca.bc.gov.mof.lexis.dto.offer;

import java.time.LocalDate;
import java.util.List;

public record PurchaseOfferSearchCriteria(
    String applicationNumber,
    String packageNumber,
    LocalDate listingFromDate,
    LocalDate listingToDate,
    LocalDate withdrawalFromDate,
    LocalDate withdrawalToDate,
    String clientNumber,
    String offeringClientNumber,
    boolean excludeWithdrawn,
    boolean restrictToProvincialOrNullJurisdiction,
    List<Long> regionNumbers,
    String sortField,
    int page,
    int size) {

  public PurchaseOfferSearchCriteria(
      String applicationNumber,
      String packageNumber,
      LocalDate listingFromDate,
      LocalDate listingToDate,
      LocalDate withdrawalFromDate,
      LocalDate withdrawalToDate,
      String clientNumber,
      List<Long> regionNumbers,
      String sortField,
      int page,
      int size) {
    this(
        applicationNumber,
        packageNumber,
        listingFromDate,
        listingToDate,
        withdrawalFromDate,
        withdrawalToDate,
        clientNumber,
        null,
        false,
        false,
        regionNumbers,
        sortField,
        page,
        size);
  }
}

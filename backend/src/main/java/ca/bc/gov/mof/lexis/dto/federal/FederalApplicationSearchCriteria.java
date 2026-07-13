package ca.bc.gov.mof.lexis.dto.federal;

import java.time.LocalDate;
import java.util.List;

public record FederalApplicationSearchCriteria(
    String federalApplicationNumber,
    String packageNumber,
    String exemptionNumber,
    String applicationStatus,
    LocalDate receivedFromDate,
    LocalDate receivedToDate,
    LocalDate listingFromDate,
    LocalDate listingToDate,
    String ownerClientNumber,
    String agentClientNumber,
    List<Long> regionNumbers,
    int page,
    int size) {

  public FederalApplicationSearchCriteria(
      String federalApplicationNumber,
      String packageNumber,
      String exemptionNumber,
      String applicationStatus,
      LocalDate receivedFromDate,
      LocalDate receivedToDate,
      LocalDate listingFromDate,
      LocalDate listingToDate,
      String ownerClientNumber,
      String agentClientNumber,
      int page,
      int size) {
    this(
        federalApplicationNumber,
        packageNumber,
        exemptionNumber,
        applicationStatus,
        receivedFromDate,
        receivedToDate,
        listingFromDate,
        listingToDate,
        ownerClientNumber,
        agentClientNumber,
        List.of(),
        page,
        size);
  }
}

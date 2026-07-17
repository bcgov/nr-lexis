package ca.bc.gov.mof.lexis.dto.application;

import java.time.LocalDate;
import java.util.List;

public record LexisApplicationSearchCriteria(
    String applicationNumber,
    String packageNumber,
    String exemptionNumber,
    String exemptionType,
    String applicationStatus,
    String ownerClientNumber,
    String agentClientNumber,
    String productTypeCode,
    LocalDate receivedFromDate,
    LocalDate receivedToDate,
    LocalDate listingFromDate,
    LocalDate listingToDate,
    List<Long> regionNumbers,
    boolean broadClientMatch,
    String sortField,
    int page,
    int size) {

  public LexisApplicationSearchCriteria(
      String applicationNumber,
      String packageNumber,
      String exemptionNumber,
      String exemptionType,
      String applicationStatus,
      String ownerClientNumber,
      String agentClientNumber,
      String productTypeCode,
      LocalDate receivedFromDate,
      LocalDate receivedToDate,
      LocalDate listingFromDate,
      LocalDate listingToDate,
      List<Long> regionNumbers,
      String sortField,
      int page,
      int size) {
    this(
        applicationNumber,
        packageNumber,
        exemptionNumber,
        exemptionType,
        applicationStatus,
        ownerClientNumber,
        agentClientNumber,
        productTypeCode,
        receivedFromDate,
        receivedToDate,
        listingFromDate,
        listingToDate,
        regionNumbers,
        false,
        sortField,
        page,
        size);
  }
}

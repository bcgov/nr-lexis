package ca.bc.gov.mof.lexis.dto.federal;

import java.time.LocalDate;

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
    int page,
    int size) {}

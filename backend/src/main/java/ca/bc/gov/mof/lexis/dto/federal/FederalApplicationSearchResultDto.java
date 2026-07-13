package ca.bc.gov.mof.lexis.dto.federal;

import java.time.LocalDate;

public record FederalApplicationSearchResultDto(
    Long applicationNumber,
    String federalApplicationNumber,
    String status,
    String client,
    String reason,
    String exemptionType,
    String exemptionNumber,
    LocalDate receivedDate,
    LocalDate listingDate,
    boolean selectable,
    boolean locked) {

  public FederalApplicationSearchResultDto withLocked(boolean locked) {
    return new FederalApplicationSearchResultDto(
        applicationNumber,
        federalApplicationNumber,
        status,
        client,
        reason,
        exemptionType,
        exemptionNumber,
        receivedDate,
        listingDate,
        selectable,
        locked);
  }
}

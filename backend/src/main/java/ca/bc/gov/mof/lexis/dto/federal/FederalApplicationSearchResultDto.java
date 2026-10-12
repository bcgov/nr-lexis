package ca.bc.gov.mof.lexis.dto.federal;

import java.time.LocalDate;

public record FederalApplicationSearchResultDto(
    Long applicationNumber,
    String federalApplicationNumber,
    String status,
    String client,
    String reason,
    LocalDate receivedDate,
    LocalDate listingDate) {}

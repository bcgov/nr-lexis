package ca.bc.gov.mof.lexis.dto.federal;

import java.time.LocalDate;

public record FederalApplicationOfferDto(
    String offerNumber, String companyName, LocalDate receivedDate) {}

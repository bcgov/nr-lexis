package ca.bc.gov.mof.lexis.dto.summary;

import java.time.LocalDate;

public record SummaryOfferItemDto(
    Long offerNumber,
    Long application,
    String packageNumber,
    LocalDate listingDate) {}

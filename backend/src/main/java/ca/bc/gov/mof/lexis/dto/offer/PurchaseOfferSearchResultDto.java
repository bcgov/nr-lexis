package ca.bc.gov.mof.lexis.dto.offer;

import java.time.LocalDate;

public record PurchaseOfferSearchResultDto(
    Long offerNumber,
    Long applicationNumber,
    String packageNumber,
    LocalDate listingDate,
    String region,
    LocalDate offerWithdrawalDate) {}

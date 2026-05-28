package ca.bc.gov.mof.lexis.dto.review;

import java.time.LocalDate;

public record ApplicationReviewSearchResultDto(
    Long applicationNumber,
    Double volume,
    String speciesEndUse,
    LocalDate listingDate,
    String status,
    String region,
    boolean showInfoIcon) {}

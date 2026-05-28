package ca.bc.gov.mof.lexis.dto.review;

import java.time.LocalDate;
import java.util.List;

public record ApplicationReviewSearchCriteria(
    String applicationNumber,
    String productTypeCode,
    LocalDate receivedFromDate,
    LocalDate receivedToDate,
    LocalDate listingFromDate,
    LocalDate listingToDate,
    List<Long> regionNumbers,
    String sortField,
    int page,
    int size) {}

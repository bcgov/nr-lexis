package ca.bc.gov.mof.lexis.dto.offer;

import java.time.LocalDate;
import java.util.List;

public record PurchaseOfferSearchCriteria(
    String applicationNumber,
    String packageNumber,
    LocalDate listingFromDate,
    LocalDate listingToDate,
    LocalDate withdrawalFromDate,
    LocalDate withdrawalToDate,
    String clientNumber,
    List<Long> regionNumbers,
    String sortField,
    int page,
    int size) {}

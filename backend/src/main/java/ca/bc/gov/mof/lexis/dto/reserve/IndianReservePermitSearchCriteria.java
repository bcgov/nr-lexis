package ca.bc.gov.mof.lexis.dto.reserve;

import java.time.LocalDate;

public record IndianReservePermitSearchCriteria(
    String permitNumber,
    String packageNumber,
    LocalDate issuedFromDate,
    LocalDate issuedToDate,
    LocalDate shippingFromDate,
    LocalDate shippingToDate,
    int page,
    int size) {}

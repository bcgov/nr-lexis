package ca.bc.gov.mof.lexis.dto.reserve;

import java.time.LocalDate;

public record IndianReservePermitSearchResultDto(
    String permitNumber,
    String clientNumber,
    LocalDate issueDate,
    LocalDate shippingDate) {}

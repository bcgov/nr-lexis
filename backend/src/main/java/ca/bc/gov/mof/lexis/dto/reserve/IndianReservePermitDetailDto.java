package ca.bc.gov.mof.lexis.dto.reserve;

import java.time.LocalDate;
import java.util.List;

public record IndianReservePermitDetailDto(
    String permitNumber,
    String clientNumber,
    String clientLocation,
    Long region,
    LocalDate applicationDate,
    LocalDate permitIssueDate,
    LocalDate estimatedShippingDate,
    String destinationCountry,
    String transportTypeCode,
    String transportName,
    String portOfExport,
    String otherPortOfExport,
    List<String> packages) {}

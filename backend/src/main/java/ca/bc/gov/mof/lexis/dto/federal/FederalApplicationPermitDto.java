package ca.bc.gov.mof.lexis.dto.federal;

import java.time.LocalDate;

public record FederalApplicationPermitDto(
    Long permitNumber,
    LocalDate permitIssueDate,
    String destinationCountry,
    String transportType,
    String transportName,
    LocalDate shippingDate,
    String portOfExport,
    String otherPortOfExport) {}

package ca.bc.gov.mof.lexis.dto.permit;

import java.time.LocalDate;

public record PermitDetailDto(
    Long permitNumber,
    Long applicationNumber,
    String packageNumber,
    String exemptionNumber,
    String permitStatusCode,
    String permitStatusDescription,
    String applicantClientNumber,
    String ownerClientNumber,
    String destinationCompanyName,
    String destinationCountryCode,
    String transportTypeCode,
    String transportName,
    String portOfExportCode,
    String otherPortOfExport,
    LocalDate issueDate,
    LocalDate expiryDate,
    LocalDate receivedDate,
    LocalDate estimatedShippingDate,
    double permitVolume,
    long numberOfPieces,
    String receiptNumber,
    String federalPermitNumber,
    String invoiceNumber,
    String remarks,
    String region) {}

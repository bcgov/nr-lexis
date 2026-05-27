package ca.bc.gov.mof.lexis.dto.fee;

public record FeePermitSummaryDto(
    Long permitNumber,
    String exemptionNumber,
    double totalVolume,
    long totalPieces,
    Double totalFees,
    String receiptNumber) {}

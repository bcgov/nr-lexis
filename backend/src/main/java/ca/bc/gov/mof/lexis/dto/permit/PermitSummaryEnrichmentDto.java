package ca.bc.gov.mof.lexis.dto.permit;

/** Permit fields needed by the provincial summary but not returned by permit search. */
public record PermitSummaryEnrichmentDto(
    String exemptionNumber, long numberOfPieces, String receiptNumber) {}

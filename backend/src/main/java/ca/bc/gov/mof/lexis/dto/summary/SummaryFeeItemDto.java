package ca.bc.gov.mof.lexis.dto.summary;

public record SummaryFeeItemDto(
    Long permit,
    String status,
    double volume,
    Double fees,
    String receipt) {}

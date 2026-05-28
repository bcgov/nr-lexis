package ca.bc.gov.mof.lexis.dto.summary;

import java.util.List;

public record SummaryExemptionsResponseDto(
    List<SummaryExemptionItemDto> results,
    int total,
    int page,
    int size) {}

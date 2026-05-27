package ca.bc.gov.mof.lexis.dto.summary;

import java.util.List;

public record SummaryFeesResponseDto(
    List<SummaryFeeItemDto> results,
    int total,
    int page,
    int size) {}

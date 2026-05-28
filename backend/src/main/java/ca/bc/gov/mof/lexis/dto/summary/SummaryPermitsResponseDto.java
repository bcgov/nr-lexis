package ca.bc.gov.mof.lexis.dto.summary;

import java.util.List;

public record SummaryPermitsResponseDto(
    List<SummaryPermitItemDto> results,
    int total,
    int page,
    int size) {}

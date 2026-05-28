package ca.bc.gov.mof.lexis.dto.summary;

import java.util.List;

public record SummaryApplicationsResponseDto(
    List<SummaryApplicationItemDto> results,
    int total,
    int page,
    int size) {}
